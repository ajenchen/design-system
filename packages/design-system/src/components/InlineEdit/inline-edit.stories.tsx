import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { userEvent, waitFor, within } from 'storybook/test'
import { InlineEdit } from './inline-edit'
import { Select, type SelectOption } from '@/design-system/components/Select/select'
import { Field, FieldLabel, FieldGroup } from '@/design-system/components/Field/field'
import { Button } from '@/design-system/components/Button/button'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverBody,
} from '@/design-system/components/Popover/popover'
import { ExampleGroup, ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta<typeof InlineEdit> = {
  title: 'Design System/Components/InlineEdit/展示',
  component: InlineEdit,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: '讓既有文字或選擇值在原位置切換為編輯控制項，保留檢視與編輯的版面連續性。適用低風險、可快速儲存的單欄位修改，不取代完整表單。' } },
  },
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
  parameters: {
    docs: { description: { story: '標題平常是純文字,滑鼠移入顯示灰底提示可編輯;點擊(或鍵盤 Tab + Enter)切成輸入框,Enter 儲存、Esc 取消。' } },
  },
  render: () => {
    const [title, setTitle] = React.useState('修正 Safari 上結帳 e2e 測試偶發失敗')
    return (
      <div className="w-[560px] rounded-md border border-border bg-surface p-[var(--layout-space-loose)]">
        {/* 議題編號 → 標題 = tight:編號替標題提供所在脈絡(layoutSpace 規則 3,layoutSpace.spec.md:76 / :81 context dependency) */}
        <p className="mb-[var(--layout-space-tight)] text-caption text-fg-secondary">PROJ-482</p>
        <InlineEdit
          as="h1"
          value={title}
          onCommit={setTitle}
          label="任務標題"
          readClassName="text-h4 font-bold text-foreground"
          placeholder="加上標題…"
        />
      </div>
    )
  },
}

/* ── 真實業務:詳情面板多個 metadata 欄位逐欄就地編輯 ── */
function MetaRow({ label, value, placeholder }: { label: string; value: string; placeholder?: string }) {
  return (
    <Field orientation="horizontal">
      <FieldLabel>{label}</FieldLabel>
      <StatefulInlineEdit value={value} label={label} placeholder={placeholder} size="sm" />
    </Field>
  )
}

export const MetadataFields: Story = {
  name: '詳情欄位就地編輯',
  render: () => (
    <div className="w-[440px] rounded-md border border-border bg-surface p-[var(--layout-space-loose)]">
      {/* 標題 → 欄位 = loose(標題是整組欄位的標題,欄位之間 loose,它到欄位也是 loose:layoutSpace.spec.md 規則 3「標題區 → 內容」第 3 題:標題到第一個 = 欄位之間、至少 loose);
          同一張表的水平欄位共用 FieldGroup 的 label 寬(field.spec.md「同一表單的多個 horizontal Field 必經 FieldGroup labelWidth」) */}
      <h2 className="mb-[var(--layout-space-loose)] text-h6 font-medium text-foreground">詳細資訊</h2>
      <FieldGroup labelWidth={128}>
        <MetaRow label="摘要" value="Q3 上線檢查清單負責人交接" />
        <MetaRow label="故事點數" value="5" />
        <MetaRow label="外部連結" value="figma.com/file/checkout-flow" placeholder="加上連結…" />
        <MetaRow label="審查備註" value="" placeholder="加上備註…" />
      </FieldGroup>
    </div>
  ),
}

/* ── 狀態 matrix:view / hover / edit（二態 canonical,hover 是 view 子態;play 驅動 hover + edit 態顯示）── */
function StateRow({
  caption,
  children,
  ...rest
}: { caption: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  // 說明照一般文件的對齊方式(靠左、不內縮):狀態示範的說明字不是 DS 定義的東西(user 2026-10-21 C-S3)
  return (
    <ExampleGroup {...rest}>
      <ExampleCaption>{caption}</ExampleCaption>
      {children}
    </ExampleGroup>
  )
}

export const States: Story = {
  name: '狀態:檢視/懸停/編輯',
  // 截圖治具(play 標出懸停目標、點開編輯態,visual-audit 拍狀態基準圖):不是讀者看的情境 → test-only(story-rules.md「Technical probe visibility」)
  tags: ['test-only'],
  render: () => (
    <div className="flex w-[440px] flex-col gap-[var(--layout-space-loose)]">
      <StateRow caption="平常:只顯示文字,沒有底色、看不到邊框(邊框的位置先留著)">
        <StatefulInlineEdit value="設計審查會議紀錄" label="標題" />
      </StateRow>
      <StateRow
        caption="滑鼠移入:出現淺灰的圓角底色,不是邊框"
        data-testid="inline-edit-hover-row"
      >
        <StatefulInlineEdit value="設計審查會議紀錄" label="標題" />
      </StateRow>
      <StateRow
        caption="編輯中:換成真正的輸入框,有邊框,聚焦時是藍框"
        data-testid="inline-edit-edit-row"
      >
        <StatefulInlineEdit value="設計審查會議紀錄" label="標題" />
      </StateRow>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // 只標記第二列；真實 CSS :hover 由 visual-audit 的 Playwright pointer 建立。
    const hoverBtn = canvasElement
      .querySelector('[data-testid="inline-edit-hover-row"]')
      ?.querySelector('button')
    if (hoverBtn) hoverBtn.setAttribute('data-visual-hover-target', '')
    // edit 態:點擊第三列 → 切成真正的 Input 控件
    const editBtn = canvasElement
      .querySelector('[data-testid="inline-edit-edit-row"]')
      ?.querySelector('button')
    if (editBtn) await userEvent.click(editBtn)
  },
}

/* ── 真實業務:工作項目 Status 就地編輯(型別化 view = Tag)──
   SSOT 示範:view 態的 Tag **不是** InlineEdit 自刻,而是渲染 `<Select mode="view" display="tag">`
   —— 「select 值 → Tag」的格式化 SSOT 住在 Select 的 view mode(= DataTable 格子消費的同一份)。
   view 與 edit 用同一個 Select、只切 mode,格式零分歧。 */
const STATUS_OPTIONS: SelectOption[] = [
  { value: 'todo', label: '待處理', tagVariant: 'neutral' },
  { value: 'in-progress', label: '進行中', tagVariant: 'blue' },
  { value: 'in-review', label: '審查中', tagVariant: 'yellow' },
  { value: 'done', label: '已完成', tagVariant: 'green' },
]

// 架構理由(移出 story name,per story-rules.md name 必人話):view 態顯示為 Tag,SSOT = Select
// 的 view mode —— InlineEdit 委派 Select 控件,view 態消費 Select 的 view 呈現(標籤/色點)。
export const SelectTagField: Story = {
  name: '狀態就地編輯(讀取時顯示為標籤)',
  render: () => {
    const [status, setStatus] = React.useState('in-progress')
    return (
      <Field
        orientation="horizontal"
        labelWidth="128px"
        className="w-[440px] rounded-md border border-border bg-surface p-[var(--layout-space-loose)]"
      >
        <FieldLabel>狀態</FieldLabel>
        <InlineEdit<string>
          value={status}
          onCommit={setStatus}
          label="狀態"
          size="sm"
          // view:Select 的 view mode 輸出 Tag(格式化 SSOT 住在 Select,InlineEdit 不自刻)。
          // Tag **盒子左緣**對齊同欄其他純文字值(horizontal Field:值落內容欄左緣 + field-px,
          // 不用 -mx),tag 文字被 pill 內距自然縮排 —— 對齊 Meegle 實測
          // (PIL 量測 2026-07-10:Meegle pill box=值左緣、text 縮排 ~8px@1x)。**不做 text outdent**。
          renderRead={(v) => (
            <Select mode="view" display="tag" size="sm" value={v} options={STATUS_OPTIONS} />
          )}
          // edit:同一個 Select 切 edit mode + 立即開選單;選完即 commit 回 view
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
    )
  },
}

/* ── 真實業務:工作項目 Description 多行就地編輯(任務管理工具的描述欄)──
   multiline:view 態換行顯示、edit 態預設 Textarea(Enter=換行、Cmd/Ctrl+Enter 或 blur 提交)。 */
export const MultilineDescription: Story = {
  name: '多行描述就地編輯(Jira 描述欄類)',
  render: () => {
    const [desc, setDesc] = React.useState(
      'Safari 上點擊結帳時,e2e 測試會間歇性失敗。\n\n重現:連跑測試 5 次,約 2 次失敗;疑似結帳 webhook 的時序問題。',
    )
    return (
      <div className="w-[560px] rounded-md border border-border bg-surface p-[var(--layout-space-loose)]">
        <Field orientation="vertical">
          <FieldLabel>描述</FieldLabel>
          <InlineEdit
            multiline
            value={desc}
            onCommit={setDesc}
            label="描述"
            placeholder="加上描述…"
          />
        </Field>
      </div>
    )
  },
}

/* ── 真實業務:工作項目詳情面板 —— vertical Field(FieldLabel + control)+ InlineEdit ──
   混合 plain / Tag / 多行欄位,驗證 Tag 值與 FieldLabel + 其他 plain 值的左緣視覺對齊。 */
export const VerticalFieldForm: Story = {
  name: '詳情面板:垂直欄位就地編輯',
  render: () => {
    // InlineEdit 是 <Field> 的直接子時，Field 同步讀取靜態 fieldPreferredSize='sm'；若經過
    // wrapper / memo / HOC，InlineEdit 仍會在掛載時註冊偏好，讓 Field 控件槽跟上 sm。
    // Field 或 InlineEdit 顯式 size 永遠優先(對照 anatomy CascadeDemo)。
    const [assignee, setAssignee] = React.useState('Alex Rivera')
    const [status, setStatus] = React.useState('in-progress')
    const [desc, setDesc] = React.useState('Safari 上點擊結帳時,e2e 測試會間歇性失敗。')
    return (
      <div
        data-testid="vfield-form"
        className="flex w-[420px] flex-col gap-[var(--layout-space-loose)] rounded-md border border-border bg-surface p-[var(--layout-space-loose)]"
      >
        <Field orientation="vertical">
          <FieldLabel>負責人</FieldLabel>
          <InlineEdit value={assignee} onCommit={setAssignee} label="負責人" />
        </Field>
        <Field orientation="vertical">
          <FieldLabel>狀態</FieldLabel>
          <InlineEdit<string>
            value={status}
            onCommit={setStatus}
            label="狀態"
            renderRead={(v) => (
              <Select mode="view" display="tag" size="sm" value={v} options={STATUS_OPTIONS} />
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
          <FieldLabel>描述</FieldLabel>
          <InlineEdit multiline value={desc} onCommit={setDesc} label="描述" />
        </Field>
      </div>
    )
  },
}

/* ── test-only:宿主卸載時提交草稿(inline-edit.spec.md「宿主卸載時仍在編輯 = 以草稿提交」;calendar.spec.md「點外面」(1))──
   團隊行事曆的事件詳情浮層:改標題改到一半,另一位成員把這個事件移到下週(即時同步)→ 本週那一列連同它的詳情浮層一起不在了。
   整棵子樹跟著卸載 = 沒有收起動畫、焦點不會先被還走、被拿掉的輸入框也不發 blur;改到一半的標題仍要送出,onCommit 剛好一次。
   以 play 當閘(story-demo-focus 閘會載入每支 story 並跑 play,斷言不成立就紅)。遠端同步用一個 window 事件模擬 ——
   指標 / 焦點事件都會先觸發 InlineEdit 另外兩條結算路(點外面 / blur),量不到「卸載」這一條。
   對照組(2026-11-25 實測):拿掉 inline-edit.tsx 的卸載提交 → onCommit 0 次、play 丟錯。 */
const REMOTE_MOVE_EVENT = 'inline-edit-demo:remote-move'

function RemoteMoveDetail() {
  const [title, setTitle] = React.useState('設計審查會議')
  const [commits, setCommits] = React.useState(0)
  const [week, setWeek] = React.useState<'this' | 'next'>('this')
  React.useEffect(() => {
    const onRemoteMove = () => setWeek('next')
    window.addEventListener(REMOTE_MOVE_EVENT, onRemoteMove)
    return () => window.removeEventListener(REMOTE_MOVE_EVENT, onRemoteMove)
  }, [])
  const slot = `週三 14:00 ${title}`
  return (
    <div
      data-testid="remote-move-probe"
      data-commit-count={commits}
      data-committed-title={title}
      className="flex w-[440px] flex-col gap-[var(--layout-space-loose)]"
    >
      <ExampleGroup>
        <ExampleCaption>本週</ExampleCaption>
        {week === 'this' ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="tertiary">{slot}</Button>
            </PopoverTrigger>
            <PopoverContent align="start">
              <PopoverHeader>
                <PopoverTitle>事件詳情</PopoverTitle>
              </PopoverHeader>
              <PopoverBody>
                <Field orientation="vertical">
                  <FieldLabel>標題</FieldLabel>
                  <InlineEdit
                    value={title}
                    label="標題"
                    onCommit={(next) => {
                      setTitle(next)
                      setCommits((n) => n + 1)
                    }}
                  />
                </Field>
              </PopoverBody>
            </PopoverContent>
          </Popover>
        ) : (
          <p className="text-body text-fg-muted">沒有事件</p>
        )}
      </ExampleGroup>
      <ExampleGroup>
        <ExampleCaption>下週</ExampleCaption>
        <p className="text-body text-foreground">{week === 'next' ? slot : '沒有事件'}</p>
      </ExampleGroup>
    </div>
  )
}

export const CommitOnHostUnmount: Story = {
  name: '浮層卸載時提交草稿',
  tags: ['test-only'],
  render: () => <RemoteMoveDetail />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const probe = canvasElement.querySelector<HTMLElement>('[data-testid="remote-move-probe"]')
    if (!probe) throw new Error('找不到 remote-move-probe')
    // 每次都重讀 DOM 上的計數(React 重繪後才會更新)
    const read = () => ({ count: probe.dataset.commitCount, title: probe.dataset.committedTitle })
    await userEvent.click(canvas.getByRole('button', { name: '週三 14:00 設計審查會議' }))
    // 詳情浮層 portal 到 body,不在 canvas 裡
    const editButton = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>('button[aria-label="編輯 標題"]')
      if (!el) throw new Error('詳情浮層沒開 / 找不到「編輯 標題」')
      return el
    })
    await userEvent.click(editButton)
    await waitFor(() => {
      if (!(document.activeElement instanceof HTMLInputElement)) throw new Error('進編輯後焦點不在標題輸入框')
    })
    await userEvent.keyboard('{End}(改線上)')
    // 對照前提:此刻還在編輯、還沒提交過(否則量到的不是「卸載」那一條)
    const before = read()
    if (before.count !== '0') throw new Error(`遠端同步前就提交了 ${before.count} 次`)
    window.dispatchEvent(new Event(REMOTE_MOVE_EVENT))
    await waitFor(() => {
      if (document.querySelector('button[aria-label="編輯 標題"], [data-editing="true"]')) throw new Error('詳情浮層還在')
    })
    // 卸載那一刻的提交在 effect 清理裡呼叫 onCommit,父層的計數晚一次重繪才寫回 DOM → 等它(等不到 = 沒有以草稿提交)
    await waitFor(() => {
      const after = read()
      if (after.count !== '1' || after.title !== '設計審查會議(改線上)') {
        throw new Error(`宿主卸載時沒有以草稿提交:onCommit ${after.count} 次、標題「${after.title}」(應 1 次、「設計審查會議(改線上)」)`)
      }
    })
  },
}

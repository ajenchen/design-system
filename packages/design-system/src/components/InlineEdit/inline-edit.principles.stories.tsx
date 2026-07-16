// @benchmark-unverified-blanket: file-level retraction per M22 (d) — 本檔 brand 引用(Jira/Linear/Notion)為真實業務場景示意(mindset #4),非 URL-citable 的 DS 行為 benchmark claim。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { InlineEdit } from './inline-edit'
import { Field, FieldLabel } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'

/**
 * InlineEdit 設計原則(principles)—— 何時用 / 何時不用 / 近親分界 / 內容準則。
 */
const meta: Meta<typeof InlineEdit> = {
  title: 'Design System/Components/InlineEdit/設計原則',
  component: InlineEdit,
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof InlineEdit>

function Card({ tone, title, children }: { tone: 'do' | 'dont' | 'neutral'; title: string; children: React.ReactNode }) {
  const ring = tone === 'do' ? 'border-success' : tone === 'dont' ? 'border-error' : 'border-border'
  const tag = tone === 'do' ? '✓ 適用' : tone === 'dont' ? '✕ 不適用' : '—'
  const tagColor = tone === 'do' ? 'text-success' : tone === 'dont' ? 'text-error' : 'text-fg-muted'
  return (
    <div className={`rounded-lg border ${ring} bg-surface p-[var(--layout-space-loose)]`}>
      <p className={`mb-1 text-caption font-semibold ${tagColor}`}>{tag}</p>
      <p className="mb-2 text-body font-medium text-foreground">{title}</p>
      <div className="text-body text-fg-secondary">{children}</div>
    </div>
  )
}
function Stateful({ value: initial, ...props }: Omit<React.ComponentProps<typeof InlineEdit>, 'onCommit'>) {
  const [value, setValue] = React.useState(initial)
  return <InlineEdit {...props} value={value} onCommit={setValue} />
}

export const WhenToUse: Story = {
  name: '何時用',
  render: () => (
    <div className="grid max-w-[860px] grid-cols-2 gap-4">
      <Card tone="do" title="詳情面板的可編欄位">
        Jira / Linear issue 詳情、Notion property —— 值平常是純內容,原地點擊即可改,不跳表單。
        <div className="mt-3"><Stateful value="Fix flaky checkout e2e test" label="標題" /></div>
      </Card>
      <Card tone="do" title="標題型就地編輯">
        頁面 / 文件標題 <code>as="h1"</code>,保留文件大綱,同時可點擊改名。
        <div className="mt-3"><Stateful as="h2" value="Q3 產品路線圖" readClassName="text-h5 font-bold" label="文件標題" /></div>
      </Card>
      <Card tone="do" title="唯讀值同場並列(editable=false)">
        系統產生值(訂單編號、建立時間)與可編欄位並列 —— 用 <code>editable=false</code>,視覺一致但無編輯入口、不灰化。
        <div className="mt-3"><Stateful value="PROJ-482" label="編號" editable={false} /></div>
      </Card>
      <Card tone="do" title="格式化值就地編輯">
        狀態 Tag / 日期 / 負責人頭像 —— <code>renderRead</code> 委派控件 view mode,edit 換該控件 edit mode。
      </Card>
    </div>
  ),
}

export const WhenNotToUse: Story = {
  name: '何時不用',
  render: () => (
    <div className="grid max-w-[860px] grid-cols-2 gap-4">
      <Card tone="dont" title="整張表單填寫">
        新增 / 建立流程要一次填多欄 —— 用 <code>&lt;Field&gt; + 控件</code> 明確表單,不用逐欄就地編輯。
        <div className="mt-3">
          <Field><FieldLabel>Email</FieldLabel><Input placeholder="you@company.com" /></Field>
        </div>
      </Card>
      <Card tone="dont" title="永久唯讀、不同場可編欄位">
        純展示頁(唯讀報表)—— 直接用 <code>&lt;Control mode="view"&gt;</code> 或純文字,不需就地編輯的 hover 入口成本。
      </Card>
      <Card tone="dont" title="需要即時驗證 / 複雜互動">
        密碼、需即時錯誤回饋、multi-step 的欄位 —— 用完整 Field + FieldError,不塞進二態就地編輯。
      </Card>
      <Card tone="dont" title="條件停用的欄位">
        「選國家前城市不可填」這種表單條件停用 —— 用 <code>&lt;Field mode="disabled"&gt;</code>,不是 InlineEdit
        (就地編輯無 disabled 態;鎖定 = editable=false 純 view)。
      </Card>
    </div>
  ),
}

export const VsControlView: Story = {
  name: '近親分界:就地編輯 vs 唯讀展示 vs 表單',
  render: () => (
    <div className="max-w-[820px]">
      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-border text-left text-caption font-semibold text-fg-muted">
            <th className="py-2 pr-4">用它</th>
            <th className="py-2 pr-4">場景</th>
            <th className="py-2">可編 / 入口</th>
          </tr>
        </thead>
        <tbody className="text-body text-fg-secondary">
          <tr className="border-b border-divider align-top">
            <td className="py-2 pr-4 font-medium text-foreground">InlineEdit</td>
            <td className="py-2 pr-4">詳情面板、可原地改的值</td>
            <td className="py-2">view↔edit,hover 入口(editable=true)</td>
          </tr>
          <tr className="border-b border-divider align-top">
            <td className="py-2 pr-4 font-medium text-foreground">InlineEdit editable=false</td>
            <td className="py-2 pr-4">與可編欄位並列的唯讀值(訂單編號)</td>
            <td className="py-2">純 view,無入口、不灰化</td>
          </tr>
          <tr className="border-b border-divider align-top">
            <td className="py-2 pr-4 font-medium text-foreground">{'<Control mode="view">'}</td>
            <td className="py-2 pr-4">永久唯讀展示頁的值</td>
            <td className="py-2">純展示,無互動</td>
          </tr>
          <tr className="align-top">
            <td className="py-2 pr-4 font-medium text-foreground">{'<Field> + 控件'}</td>
            <td className="py-2 pr-4">表單填寫(一次多欄)</td>
            <td className="py-2">恆 edit,label + error</td>
          </tr>
        </tbody>
      </table>
    </div>
  ),
}

export const ContentGuidelines: Story = {
  name: '內容準則',
  render: () => (
    <div className="grid max-w-[860px] grid-cols-2 gap-4">
      <Card tone="do" title="placeholder 用行動語氣">
        空值提示寫「指派負責人…」「新增說明…」,告訴使用者能做什麼,而非「無」。
        <div className="mt-3"><Stateful value="" label="負責人" placeholder="指派負責人…" /></div>
      </Card>
      <Card tone="do" title="label 傳人類可讀名稱">
        <code>label</code> 組出 aria-label「編輯 負責人」—— 傳欄位真名,別傳代號。
      </Card>
      <Card tone="dont" title="別把格式化 Tag 自刻">
        狀態值要顯示 Tag,<code>renderRead</code> 必須渲染 <code>&lt;Select mode="view" display="tag"&gt;</code> ——
        自己拼 <code>&lt;Tag&gt;</code> 會與 edit 態格式漂移。
      </Card>
      <Card tone="neutral" title="多行用 multiline">
        Jira description 類長文字傳 <code>multiline</code> —— view 保留換行、edit 換 Textarea,上下 padding 一致。
      </Card>
    </div>
  ),
}

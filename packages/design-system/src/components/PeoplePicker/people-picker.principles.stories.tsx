// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { PeoplePicker } from './people-picker'
import type { PersonValue } from './person-display'
import { Select } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'

const meta: Meta = {
  title: 'Design System/Components/PeoplePicker/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ───────────────────────────────────────────────────────────────────

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3 max-w-md">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// 對齊 ProfileCard 預設呈現:name + subtitle + status + statusMessage + fields
// avatar.spec.md DS-wide canonical:所有 person avatar hover 必出 ProfileCard,展示資訊不可精簡
const team: PersonValue[] = [
  { name: 'Alice Chen', avatarUrl: 'https://i.pravatar.cc/128?img=1', description: 'Design｜Taipei｜EMP-3001', status: 'online', statusMessage: '可線上 review。', fields: [{ label: 'ID', value: 'AC001' }, { label: '部門', value: 'Product Design' }, { label: '時區', value: 'TST (GMT+8)' }] },
  { name: 'Bob Lin', avatarUrl: 'https://i.pravatar.cc/128?img=2', description: 'Engineering｜Tokyo｜EMP-3002', status: 'busy', statusMessage: '深度工作,2hr 後再回。', fields: [{ label: 'ID', value: 'BL002' }, { label: '部門', value: 'Frontend' }, { label: '時區', value: 'JST (GMT+9)' }] },
  { name: 'Carol Wu', avatarUrl: 'https://i.pravatar.cc/128?img=3', description: 'Engineering｜Singapore｜EMP-3003', status: 'online', statusMessage: '今日 OnCall。', fields: [{ label: 'ID', value: 'CW003' }, { label: '部門', value: 'Backend' }, { label: '時區', value: 'SGT (GMT+8)' }] },
  { name: 'David Lee', avatarUrl: 'https://i.pravatar.cc/128?img=4', description: 'Product｜Hong Kong｜EMP-3004', status: 'away', statusMessage: '會議中,15:00 後可聊。', fields: [{ label: 'ID', value: 'DL004' }, { label: '部門', value: 'Product' }, { label: '時區', value: 'HKT (GMT+8)' }] },
  { name: 'Emma Yang', avatarUrl: 'https://i.pravatar.cc/128?img=5', description: 'Design｜Sydney｜EMP-3005', status: 'offline', statusMessage: '已下線,明早 9:00 上線。', fields: [{ label: 'ID', value: 'EY005' }, { label: '部門', value: 'Design Systems' }, { label: '時區', value: 'AEST (GMT+10)' }] },
]

// ── UsageGuidance — 何時用 / 何時不用 / vs 近親元件(合併 WhenToUse + VsSelectRule + VsComboboxRule) ──

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [assignee, setAssignee] = React.useState<PersonValue | null>(team[0])
    const [category, setCategory] = React.useState('design')
    const [tags, setTags] = React.useState<string[]>(['design', 'typescript'])
    return (
      <div>
        <Rule
          title="何時用 — 真實業務場景"
          note="PeoplePicker 用於「選擇 user 為值」場景 — 資料本質是「人」,需要 avatar 視覺輔助辨識(對比一般 Combobox 純字串)。Avatar-first display 對齊 Linear assignee picker / Asana people field / Slack mention picker 共識,讓使用者「掃 avatar 而非讀名字」更快。"
        >
          <ul className="space-y-1">
            <li>
              <LinkTo kind="Design System/Components/PeoplePicker/展示" name="單人"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">單人</span></LinkTo>
            </li>
            <li>
              <LinkTo kind="Design System/Components/PeoplePicker/展示" name="多人"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">多人</span></LinkTo>
            </li>
            <li>
              <LinkTo kind="Design System/Components/PeoplePicker/展示" name="尺寸"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">尺寸</span></LinkTo>
            </li>
          </ul>
        </Rule>

        <Rule
          title="vs Select — PeoplePicker 是選人員(選項有 avatar 視覺)"
          note="assign task、email 收件人、PR reviewer、文章作者等場景:資料本質是人,使用者靠 avatar + 名字識別(不是純文字 label)。對齊 Slack people picker / Jira assignee dropdown 的 avatar-first 模式"
        >
          <div>
            <Label>✅ 指派 task 給某人（單選）</Label>
            <PeoplePicker
              value={assignee}
              onChange={(v) => setAssignee(Array.isArray(v) ? v[0] : v)}
              people={team}
              aria-label="task 負責人"
            />
          </div>
        </Rule>

        <Rule
          title="❌ 選非人員(分類 / 狀態)用 PeoplePicker"
          note="Avatar 視覺是「選人」的獨有語意——選「優先級」、「產品類別」、「訂單狀態」這些非人員的分類用 Select / Combobox,否則 avatar 會變成無意義裝飾"
        >
          <div>
            <Label>✅ 選產品分類用 Select（沒有 avatar 概念）</Label>
            <Select
              options={[
                { value: 'design', label: '設計' },
                { value: 'engineering', label: '工程' },
                { value: 'product', label: '產品' },
              ]}
              value={category}
              onChange={setCategory}
            />
          </div>
          <Label warn>↑ 非人員不要用 PeoplePicker</Label>
        </Rule>

        <Rule
          title="vs Combobox — 多選非人員 → Combobox(不是 PeoplePicker)"
          note="Combobox 是通用多選,沒 avatar 假設。「產品標籤」、「技術 stack」這類非人員多選用 Combobox;人員多選才用 PeoplePicker"
        >
          <Combobox
            options={[
              { value: 'design', label: '設計' },
              { value: 'typescript', label: 'TypeScript' },
              { value: 'react', label: 'React' },
              { value: 'figma', label: 'Figma' },
            ]}
            value={tags}
            onChange={setTags}
            aria-label="技術 stack(多選 Combobox)"
          />
          <Label>↑ 技術 stack 是分類多選,不是人員,用 Combobox</Label>
        </Rule>
      </div>
    )
  },
}

// ── 單選 vs 多選 ──────────────────────────────────────────────────────────

export const SingleVsMultiRule: Story = {
  name: '單選 vs 多選',
  render: () => {
    const [assignee, setAssignee] = React.useState<PersonValue | null>(team[0])
    const [reviewers, setReviewers] = React.useState<PersonValue[]>([team[1], team[2]])
    return (
      <div>
        <Rule
          title="單選 — 一個 task 的 assignee、文章作者"
          note="value 是單一 PersonValue 或 null。value 類型決定 UI 行為（單選 trigger 只顯示一個 avatar + name）"
        >
          <PeoplePicker
            value={assignee}
            onChange={(v) => setAssignee(Array.isArray(v) ? v[0] : v)}
            people={team}
            aria-label="task 負責人(單選)"
          />
          <Label>↑ 指派 task：assignee 通常一人</Label>
        </Rule>

        <Rule
          title="多選 — PR reviewers、email 收件人、channel 成員"
          note="value 是 PersonValue[]。多人堆疊 avatar + 溢出時 +N 指示器,hover 可看完整名單"
        >
          <PeoplePicker
            value={reviewers}
            onChange={(v) => setReviewers(Array.isArray(v) ? v : [v])}
            people={team}
            aria-label="PR reviewers(多選)"
          />
          <Label>↑ PR reviewers：可選多人,已選 {reviewers.length} 人</Label>
        </Rule>

        <Rule
          title="❌ 在多選語意下強制只能選一人"
          note="若業務規則是「只能選一人」,直接用單選。用 multi + 限制 length === 1 等於用錯元件"
        >
          <Label warn>（設計規則）單多選由 value 類型決定,不做混合或限制</Label>
        </Rule>
      </div>
    )
  },
}

// ── 空值呈現 ────────────────────────────────────────────────────────────

export const EmptyStateRule: Story = {
  name: '空值呈現',
  render: () => (
    <div>
      <Rule
        title="edit 模式 — 未選時顯示「請選擇人員」佔位提示"
        note="跟 Select / Combobox 的 placeholder 行為一致。不用半形連字號,因為 edit mode 是可操作的"
      >
        <PeoplePicker value={null} onChange={() => {}} people={team} aria-label="指派人員(空值 placeholder demo)" />
      </Rule>

      <Rule
        title="readonly — 未填時顯示半形連字號（-）"
        note="跟所有 Field readonly 空值呈現一致。table cell 場景特別常見(未指派 assignee)"
      >
        <PeoplePicker mode="readonly" value={null} />
      </Rule>
    </div>
  ),
}


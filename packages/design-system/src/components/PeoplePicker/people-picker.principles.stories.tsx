// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { PeoplePicker } from './people-picker'
import type { PersonValue } from './person-display'
import { Select } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'
import { ExampleCaption, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/PeoplePicker/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, examplesClassName: 'max-w-md' })

// 對齊 ProfileCard 預設呈現:name + subtitle + status + statusMessage + fields
// avatar.spec.md DS-wide canonical:所有 person avatar hover 必出 ProfileCard,展示資訊不可精簡
// 兩個預設欄位(ID / 員工編號)走 PersonData 的 id / employeeNumber,不寫進 fields —— 2026-10-21 前 ID 寫在 fields:被去重後排到「員工編號」後面,員工編號則是「-」、副標卻寫著 EMP-xxxx(profile-card.spec.md「defaultFieldValues 優於 fields 同名 label」;閘 overlay-story-contract S8)
const team: PersonValue[] = [
  { name: 'Alice Chen', avatarUrl: 'https://i.pravatar.cc/128?img=1', description: 'Design｜Taipei｜EMP-3001', status: 'online', statusMessage: '可線上 review。', id: 'AC001', employeeNumber: 'EMP-3001', fields: [{ label: '部門', value: 'Product Design' }, { label: '時區', value: 'TST (GMT+8)' }] },
  { name: 'Bob Lin', avatarUrl: 'https://i.pravatar.cc/128?img=2', description: 'Engineering｜Tokyo｜EMP-3002', status: 'busy', statusMessage: '深度工作,2hr 後再回。', id: 'BL002', employeeNumber: 'EMP-3002', fields: [{ label: '部門', value: 'Frontend' }, { label: '時區', value: 'JST (GMT+9)' }] },
  { name: 'Carol Wu', avatarUrl: 'https://i.pravatar.cc/128?img=3', description: 'Engineering｜Singapore｜EMP-3003', status: 'online', statusMessage: '今日 OnCall。', id: 'CW003', employeeNumber: 'EMP-3003', fields: [{ label: '部門', value: 'Backend' }, { label: '時區', value: 'SGT (GMT+8)' }] },
  { name: 'David Lee', avatarUrl: 'https://i.pravatar.cc/128?img=4', description: 'Product｜Hong Kong｜EMP-3004', status: 'away', statusMessage: '會議中,15:00 後可聊。', id: 'DL004', employeeNumber: 'EMP-3004', fields: [{ label: '部門', value: 'Product' }, { label: '時區', value: 'HKT (GMT+8)' }] },
  { name: 'Emma Yang', avatarUrl: 'https://i.pravatar.cc/128?img=5', description: 'Design｜Sydney｜EMP-3005', status: 'offline', statusMessage: '已下線,明早 9:00 上線。', id: 'EY005', employeeNumber: 'EMP-3005', fields: [{ label: '部門', value: 'Design Systems' }, { label: '時區', value: 'AEST (GMT+10)' }] },
]

// ── UsageGuidance — 何時用 / 何時不用 / vs 近親元件(合併 WhenToUse + VsSelectRule + VsComboboxRule) ──

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [assignee, setAssignee] = React.useState<PersonValue | null>(team[0])
    const [category, setCategory] = React.useState('design')
    const [tags, setTags] = React.useState<string[]>(['design', 'typescript'])
    return (
      <TutorialPage>
        <UsageSection kind="when">
          <p>選的值本質上是「人」:指派負責人、加入成員、@提及、PR 審核者;選項前有頭像,使用者靠頭像掃視比讀名字快(Linear 指派、Asana 人員欄、Slack 提及同樣的做法)。</p>
          <TutorialList>
            <li>
              <StoryLink kind="Design System/Components/PeoplePicker/展示" name="單人">單人</StoryLink>
            </li>
            <li>
              <StoryLink kind="Design System/Components/PeoplePicker/展示" name="多人">多人</StoryLink>
            </li>
            <li>
              <StoryLink kind="Design System/Components/PeoplePicker/展示" name="尺寸">尺寸</StoryLink>
            </li>
          </TutorialList>
        </UsageSection>

        <UsageSection kind="whenNot">
          <TutorialRule
            title="❌ 選非人員(分類 / 狀態)用 PeoplePicker"
            note="Avatar 視覺是「選人」的獨有語意——選「優先級」、「產品類別」、「訂單狀態」這些非人員的分類用 Select / Combobox,否則 avatar 會變成無意義裝飾"
          >
            <ExampleGroup>
              <ExampleCaption>✅ 選產品分類用 Select（沒有 avatar 概念）</ExampleCaption>
              <Select aria-label="產品分類"
                options={[
                  { value: 'design', label: '設計' },
                  { value: 'engineering', label: '工程' },
                  { value: 'product', label: '產品' },
                ]}
                value={category}
                onChange={setCategory}
              />
            </ExampleGroup>
            <ExampleCaption warn>↑ 非人員不要用 PeoplePicker</ExampleCaption>
          </TutorialRule>
          <TutorialList>
            <li>只顯示某個人、不需要選 → ProfileCard + Avatar</li>
            <li>顯示整個團隊的成員列表 → 頭像堆疊或自訂清單:PeoplePicker 是「選人」,不是「展示團隊」</li>
          </TutorialList>
        </UsageSection>

        <UsageSection kind="siblings">
          <TutorialRule
            title="PeoplePicker vs Select:選的是人(選項有頭像)"
            note="assign task、email 收件人、PR reviewer、文章作者等場景:資料本質是人,使用者靠 avatar + 名字識別(不是純文字 label)。對齊 Slack people picker / Jira assignee dropdown 的 avatar-first 模式"
          >
            <ExampleGroup>
              <ExampleCaption>✅ 指派 task 給某人（單選）</ExampleCaption>
              <PeoplePicker
                value={assignee}
                onChange={(v) => setAssignee(Array.isArray(v) ? v[0] : v)}
                people={team}
                aria-label="task 負責人"
              />
            </ExampleGroup>
          </TutorialRule>

          <TutorialRule
            title="PeoplePicker vs Combobox:多選的不是人 → Combobox"
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
            <ExampleCaption>↑ 技術 stack 是分類多選,不是人員,用 Combobox</ExampleCaption>
          </TutorialRule>
        </UsageSection>
      </TutorialPage>
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
      <TutorialPage>
        <TutorialRule
          title="單選 — 一個 task 的 assignee、文章作者"
          note="value 是單一 PersonValue 或 null。value 類型決定 UI 行為（單選 trigger 只顯示一個 avatar + name）"
        >
          <PeoplePicker
            value={assignee}
            onChange={(v) => setAssignee(Array.isArray(v) ? v[0] : v)}
            people={team}
            aria-label="task 負責人(單選)"
          />
          <ExampleCaption>↑ 指派 task：assignee 通常一人</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="多選 — PR reviewers、email 收件人、channel 成員"
          note="value 是 PersonValue[]。多人堆疊 avatar + 溢出時 +N 指示器,hover 可看完整名單"
        >
          <PeoplePicker
            value={reviewers}
            onChange={(v) => setReviewers(Array.isArray(v) ? v : [v])}
            people={team}
            aria-label="PR reviewers(多選)"
          />
          <ExampleCaption>↑ PR reviewers：可選多人,已選 {reviewers.length} 人</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 在多選語意下強制只能選一人"
          note="若業務規則是「只能選一人」,直接用單選。用 multi + 限制 length === 1 等於用錯元件"
        >
          <ExampleCaption warn>（設計規則）單多選由 value 類型決定,不做混合或限制</ExampleCaption>
        </TutorialRule>
      </TutorialPage>
    )
  },
}

// ── 空值呈現 ────────────────────────────────────────────────────────────

export const EmptyStateRule: Story = {
  name: '空值呈現',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="edit 模式 — 未選時顯示「請選擇人員」佔位提示"
        note="跟 Select / Combobox 的 placeholder 行為一致。不用半形連字號,因為 edit mode 是可操作的"
      >
        <PeoplePicker value={null} onChange={() => {}} people={team} aria-label="指派人員(空值 placeholder demo)" />
      </TutorialRule>

      <TutorialRule
        title="readonly — 未填時顯示半形連字號（-）"
        note="跟所有 Field readonly 空值呈現一致。table cell 場景特別常見(未指派 assignee)"
      >
        <PeoplePicker mode="readonly" value={null} />
      </TutorialRule>
    </TutorialPage>
  ),
}


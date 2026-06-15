import type { Meta, StoryObj } from '@storybook/react'
import { OverflowIndicator } from './overflow-indicator'
import { Tag } from '@/design-system/components/Tag/tag'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { ProfileCard, ProfileCardDefaultActions } from '@/design-system/components/ProfileCard/profile-card'

/** Person avatar hover canonical helper — 對齊 avatar.spec.md DS-wide rule:
 *  person avatar 必 hover → ProfileCard,必含 status / statusMessage / fields / actions / onViewMore
 *  (profile-card.spec.md 重要資訊 canonical;consumer 的 person 資料全備則全 render) */
const personHoverCard = (p: { name: string; role?: string; empId?: string }) => (
  <ProfileCard
    name={p.name}
    subtitle={p.role ? `${p.role}｜${p.empId ?? 'EMP-0000'}` : 'Design｜D-0042｜EMP-1001'}
    avatar={{ alt: p.name }}
    status="online"
    statusMessage="Out of Office: Back on Monday! For urgent matters please contact @Wei-Lun Cheng in the meantime."
    actions={<ProfileCardDefaultActions />}
    fields={[
      { label: 'ID', value: 'YHANAX' },
      { label: 'Employee number', value: '1234567' },
    ]}
    onViewMore={() => {}}
  />
)

const meta: Meta<typeof OverflowIndicator> = {
  title: 'Design System/Internal/OverflowIndicator/展示',
  component: OverflowIndicator,
  tags: ['!dev'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'OverflowIndicator 是 `+N` 溢出指示器——當容器無法顯示全部項目時,以 `+N` 形式提示,hover 展開完整清單(HoverCard 承載,可互動)。由 Combobox / PeoplePicker / Avatar Group 等元件消費,App 不直接使用。',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof OverflowIndicator>

/* ═══════════════════════════════════════════════════════════════════════════
   Story 1:Combobox 多選標籤溢出(shape="tag")
   ═══════════════════════════════════════════════════════════════════════════ */

const labelTags = [
  { value: 'bug', label: 'bug' },
  { value: 'p0', label: 'P0' },
  { value: 'performance', label: 'performance' },
  { value: 'auth', label: 'auth' },
  { value: 'frontend', label: 'frontend' },
]

export const ComboboxTagOverflow: Story = {
  name: 'Combobox 標籤溢出',
  render: () => (
    <div className="flex flex-col gap-3 max-w-sm">
      <p className="text-caption text-fg-muted">
        Jira 任務 labels 欄位 — 單行模式時顯示前 2 個 tag,其餘折成 +N hover 展開。
      </p>
      <div className="border border-border rounded-md px-3 py-1.5 flex items-center gap-1 bg-surface">
        {labelTags.slice(0, 2).map((t) => (
          <Tag key={t.value} size="sm">
            {t.label}
          </Tag>
        ))}
        <OverflowIndicator count={labelTags.length - 2} shape="tag" size="sm">
          {labelTags.slice(2).map((t) => (
            <Tag key={t.value} size="sm">
              {t.label}
            </Tag>
          ))}
        </OverflowIndicator>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 2:Avatar 人員 stack +N(shape="circle")
   ═══════════════════════════════════════════════════════════════════════════ */

const reviewers = [
  { name: 'Ada Chen', color: 'indigo' as const },
  { name: '張美真', color: 'magenta' as const },
  { name: '林伯彥', color: 'green' as const },
  { name: '黃怡君', color: 'turquoise' as const },
  { name: '王文彬', color: 'purple' as const },
  { name: '李思妤', color: 'yellow' as const },
]

export const AvatarStackOverflow: Story = {
  name: '人員頭像 疊合 +N',
  render: () => (
    <div className="flex flex-col gap-3 max-w-sm">
      <p className="text-caption text-fg-muted">
        GitHub PR Reviewers — 只顯示前 3 位,其餘 +3 hover 看完整清單。
      </p>
      <div className="flex items-center">
        {reviewers.slice(0, 3).map((p, i) => (
          <span key={p.name} className={i > 0 ? '-ml-1.5' : ''}>
            <Avatar alt={p.name} color={p.color} size={24} hoverCard={personHoverCard(p)} />
          </span>
        ))}
        <span className="-ml-1.5">
          <OverflowIndicator count={reviewers.length - 3} shape="circle" size="md">
            <div className="flex flex-col gap-1 min-w-[160px] text-caption">
              {reviewers.slice(3).map((p) => (
                <div key={p.name} className="flex items-center gap-2">
                  <Avatar alt={p.name} color={p.color} size={20} hoverCard={personHoverCard(p)} />
                  <span>{p.name}</span>
                </div>
              ))}
            </div>
          </OverflowIndicator>
        </span>
      </div>
    </div>
  ),
}

// @story-trait-rationale: Shapes(形狀對照)retired 2026-06-11 per audit Dim 24/25 —
//   shape × size 全矩陣已由 anatomy ShapeMatrix「Shape × Size 視覺矩陣」+ SizeMatrix
//   (overflow-indicator.anatomy.stories.tsx)完整覆蓋,展示層只留真實業務場景;
//   principles UsageGuidance 對應 LinkTo 已同步移除。

/* ═══════════════════════════════════════════════════════════════════════════
   Story 3:Breadcrumb 中段收合(+N 顯示隱藏路徑)
   ═══════════════════════════════════════════════════════════════════════════ */

export const BreadcrumbCollapse: Story = {
  name: 'Breadcrumb 中段收合',
  render: () => (
    <div className="flex flex-col gap-3 max-w-lg">
      <p className="text-caption text-fg-muted">
        深層路徑過長時,中段收合為 +N,hover 看完整路徑。
      </p>
      <nav className="flex items-center gap-1 text-caption">
        <span className="text-fg-muted hover:text-foreground cursor-pointer">Projects</span>
        <span className="text-fg-muted">/</span>
        <OverflowIndicator count={3} shape="tag" size="sm">
          <div className="flex flex-col gap-1 text-caption">
            <span>Platform</span>
            <span>Infrastructure</span>
            <span>Monitoring</span>
          </div>
        </OverflowIndicator>
        <span className="text-fg-muted">/</span>
        <span className="text-fg-muted hover:text-foreground cursor-pointer">Dashboards</span>
        <span className="text-fg-muted">/</span>
        <span className="text-foreground font-medium">API latency</span>
      </nav>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 4:DataTable row 的指派人員溢出
   ═══════════════════════════════════════════════════════════════════════════ */

const rows = [
  {
    title: '登入頁改版',
    assignees: [
      { name: 'Ada Chen', color: 'indigo' as const },
      { name: '張美真', color: 'magenta' as const },
    ],
  },
  {
    title: 'Stripe 金流串接',
    assignees: [
      { name: '林伯彥', color: 'green' as const },
      { name: '黃怡君', color: 'turquoise' as const },
      { name: '王文彬', color: 'purple' as const },
      { name: '李思妤', color: 'yellow' as const },
      { name: '吳冠霆', color: 'red' as const },
    ],
  },
  {
    title: '行銷活動著陸頁',
    assignees: [
      { name: '蔡佳芸', color: 'blue' as const },
      { name: '陳俊宇', color: 'purple' as const },
      { name: '周思涵', color: 'magenta' as const },
    ],
  },
]

export const TableRowAssignees: Story = {
  name: 'DataTable 人員欄位',
  render: () => (
    <div className="border border-border rounded-md max-w-2xl overflow-hidden">
      <table className="w-full text-caption">
        <thead className="bg-muted text-fg-secondary">
          <tr>
            <th className="text-left px-3 py-2 font-medium">任務</th>
            <th className="text-left px-3 py-2 font-medium">負責人</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const visible = r.assignees.slice(0, 2)
            const hidden = r.assignees.slice(2)
            return (
              <tr key={r.title} className="border-t border-divider">
                <td className="px-3 py-2">{r.title}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center">
                    {visible.map((p, i) => (
                      <span key={p.name} className={i > 0 ? '-ml-1.5' : ''}>
                        <Avatar alt={p.name} color={p.color} size={20} hoverCard={personHoverCard(p)} />
                      </span>
                    ))}
                    {hidden.length > 0 && (
                      <span className="-ml-1.5">
                        <OverflowIndicator count={hidden.length} shape="circle" size="sm">
                          <div className="flex flex-col gap-1 min-w-[140px]">
                            {hidden.map((p) => (
                              <div key={p.name} className="flex items-center gap-2">
                                <Avatar alt={p.name} color={p.color} size={20} hoverCard={personHoverCard(p)} />
                                <span>{p.name}</span>
                              </div>
                            ))}
                          </div>
                        </OverflowIndicator>
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  ),
}

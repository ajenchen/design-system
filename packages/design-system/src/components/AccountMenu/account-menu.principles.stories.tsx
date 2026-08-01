// @benchmark-cited: usage 分界與 placement 由 account-menu.spec.md 已列的
// Atlassian / shadcn / Primer / Material primary sources 收斂；本檔只投影 canonical，
// 不新增 email、account switcher 或其他 aspirational contract。
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'
import type { ReactNode } from 'react'
import { AccountMenu } from './account-menu'

const meta: Meta = {
  title: 'Design System/Components/AccountMenu/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

const noop = () => {}
const DEMO_USER = {
  name: 'Alan Chen',
  avatar: { src: 'https://i.pravatar.cc/48?u=EMP-1001', color: 'blue' as const },
}

const Rule = ({
  title,
  note,
  children,
}: {
  title: string
  note: string
  children?: ReactNode
}) => (
  <section className="space-y-3">
    <h3 className="text-h5">{title}</h3>
    <p className="max-w-2xl text-body text-fg-secondary">{note}</p>
    {children}
  </section>
)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex max-w-3xl flex-col gap-10">
      <Rule
        title="用在目前登入者的帳號入口"
        note="AccountMenu 表示「我自己的個人資料、設定與登出」；primary-header 桌面模式放 global header 右側，行動裝置 global header 被 Sheet 取代時搬到 SidebarHeader。"
      >
        <LinkTo kind="Design System/Components/AccountMenu/展示" name="全域標頭帳號入口">
          <span className="cursor-pointer text-primary hover:text-primary-hover">查看展示 → 全域標頭帳號入口</span>
        </LinkTo>
      </Rule>

      <Rule
        title="不要拿來展示別人的人員資訊"
        note="同事、留言者或 reviewer 的 hover 詳情屬於 ProfileCard；AccountMenu 綁定 navigation callbacks，語義不是聯絡某人。"
      />

      <Rule
        title="不要當成一般動作選單"
        note="排序、匯出與 row actions 直接使用 DropdownMenu。只有 identity trigger + canonical 帳號集合才使用 AccountMenu。"
      />
    </div>
  ),
}

export const PlacementRule: Story = {
  name: '放置規則:每個畫面只出現一次',
  render: () => (
    <div className="max-w-3xl space-y-6 text-body">
      <h3 className="text-h5">Placement owner = AppShell spec</h3>
      <ul className="list-disc space-y-2 pl-5 text-fg-secondary">
        <li><strong>primary-header：</strong>global header 右側使用 AccountMenu。</li>
        <li><strong>primary-sidebar：</strong>帳號入口留在 SidebarFooter，不另放 AccountMenu。</li>
        <li><strong>mobile Sheet：</strong>global header 不可見時，入口鏡像到 Sheet 的 SidebarHeader。</li>
        <li><strong>禁止：</strong>global header 與 sidebar footer 同時各放一份。</li>
      </ul>
    </div>
  ),
}

export const CompositionRule: Story = {
  name: '組合規則:固定身分,開放內容',
  render: () => (
    <div className="flex max-w-3xl flex-col gap-6">
      <p className="text-body text-fg-secondary">
        Trigger 與 identity Label 由 AccountMenu 固定，預設 actions 可透過 callbacks 使用；
        產品需要 i18n 或額外項目時以 <code>children</code> 取代 default action 集合，
        不繞過元件重刻 avatar + dropdown。
      </p>
      <div className="inline-flex w-fit items-center gap-4 rounded-md border border-dashed border-divider p-4">
        <AccountMenu
          user={DEMO_USER}
          onViewProfile={noop}
          onOpenSettings={noop}
          onSignOut={noop}
        />
        <span className="text-caption text-fg-muted">固定 trigger + identity contract</span>
      </div>
    </div>
  ),
}

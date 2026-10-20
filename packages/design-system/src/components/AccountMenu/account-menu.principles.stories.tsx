// @benchmark-cited: usage 分界與 placement 由 account-menu.spec.md 已列的
// Atlassian / shadcn / Primer / Material primary sources 收斂；本檔只投影 canonical，
// 不新增 email、account switcher 或其他 aspirational contract。
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'
import { AccountMenu } from './account-menu'
import { ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

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

// 規則的內容是一段連結 / 說明(不是範例區),不給 caption;說明字色沿用本頁原本的 fg-secondary
const TutorialRule = createTutorialRule({ noteTone: 'secondary' })

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage className="max-w-3xl">
      <TutorialRule
        title="用在目前登入者的帳號入口"
        note="AccountMenu 表示「我自己的個人資料、設定與登出」；primary-header 放 global header 右側；Menu 放不下、叫出的左側浮層蓋住 global header 時，鏡像到浮層頂排的 SidebarHeader 右側。"
      >
        {/* 包一層段落:連結維持行內寬度(規則的內容是直排區塊,裸連結會被拉滿整列、整列都變成可點) */}
        <p>
          <LinkTo kind="Design System/Components/AccountMenu/展示" name="全域標頭帳號入口">
            <span className="cursor-pointer text-primary hover:text-primary-hover">查看展示 → 全域標頭帳號入口</span>
          </LinkTo>
        </p>
      </TutorialRule>

      <TutorialRule
        title="不要拿來展示別人的人員資訊"
        note="同事、留言者或 reviewer 的 hover 詳情屬於 ProfileCard；AccountMenu 綁定 navigation callbacks，語義不是聯絡某人。"
      />

      <TutorialRule
        title="不要當成一般動作選單"
        note="排序、匯出與 row actions 直接使用 DropdownMenu。只有 identity trigger + canonical 帳號集合才使用 AccountMenu。"
      />
    </TutorialPage>
  ),
}

export const PlacementRule: Story = {
  name: '放置規則:每個畫面只出現一次',
  render: () => (
    <TutorialPage className="max-w-3xl text-body">
      <TutorialRule title="Placement owner = AppShell spec">
        {/* @layout-space-magic-ok: 項目符號清單:同質清單項列距 / 項目符號縮排(清單自身幾何)(layoutSpace.spec.md:165 同質清單列) */}
        <ul className="list-disc space-y-2 pl-5 text-fg-secondary">
          <li><strong>primary-header：</strong>global header 右側使用 AccountMenu。</li>
          <li><strong>primary-sidebar：</strong>帳號入口留在 SidebarFooter，不另放 AccountMenu。</li>
          <li><strong>Menu 左側浮層：</strong>浮層蓋住 global header 時，入口鏡像到浮層頂排的 SidebarHeader 右側（只在浮層那一份）。</li>
          <li><strong>禁止：</strong>global header 與 sidebar footer 同時各放一份。</li>
        </ul>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const CompositionRule: Story = {
  name: '組合規則:固定身分,開放內容',
  render: () => (
    // 說明 ↔ 它說的範例 = tight(ExampleGroup);整頁外框 = 共用教學頁元件
    <TutorialPage className="max-w-3xl">
      <ExampleGroup>
        <p className="text-body text-fg-secondary">
          Trigger 與 identity Label 由 AccountMenu 固定，預設 actions 可透過 callbacks 使用；
          產品需要 i18n 或額外項目時以 <code>children</code> 取代 default action 集合，
          不繞過元件重刻 avatar + dropdown。
        </p>
        <div className="inline-flex w-fit items-center gap-[var(--layout-space-tight)] rounded-md border border-dashed border-divider p-[var(--layout-space-loose)]">
          <AccountMenu
            user={DEMO_USER}
            onViewProfile={noop}
            onOpenSettings={noop}
            onSignOut={noop}
          />
          <span className="text-caption text-fg-muted">固定 trigger + identity contract</span>
        </div>
      </ExampleGroup>
    </TutorialPage>
  ),
}

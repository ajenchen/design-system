// @benchmark-cited: usage 分界與 placement 由 account-menu.spec.md 已列的
// Atlassian / shadcn / Primer / Material primary sources 收斂；本檔只投影 canonical，
// 不新增 email、account switcher 或其他 aspirational contract。
import type { Meta, StoryObj } from '@storybook/react'
import { AccountMenu } from './account-menu'
import { ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

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

// 規則的內容是一段說明(不是範例區)
const TutorialRule = createTutorialRule()

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage className="max-w-3xl">
      <UsageSection kind="when">
        <p>目前登入者「自己」的帳號入口:個人資料、設定與登出。</p>
        <TutorialList>
          <li>上方有全域標頭的版面(primary-header):放在全域標頭右側,品牌在左、自己的帳號在右(GitHub / Gmail / Slack 的慣例)—— <StoryLink kind="Design System/Components/AccountMenu/展示" name="全域標頭帳號入口">全域標頭帳號入口</StoryLink></li>
          <li>Menu 放不下、叫出的左側浮層蓋住全域標頭時:入口鏡像到浮層頂排(SidebarHeader 右側)</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="不要拿來展示別人的人員資訊"
          note="同事、留言者或審核者的詳細資料用 ProfileCard;AccountMenu 開的是「自己」的設定與登出,不是聯絡某人。"
        />
        <TutorialRule
          title="不要當成一般動作選單"
          note="排序、匯出、列操作直接用 DropdownMenu。只有「頭像觸發 + 固定的帳號項目」才用 AccountMenu。"
        />
        <TutorialRule
          title="側欄版面(primary-sidebar)的帳號入口不用 AccountMenu"
          note="那種版面帳號放在側欄底部(SidebarFooter 的帳號列,整列開帳號選單),不放在標頭。"
        />
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>ProfileCard</strong> —— 看「別人」的人員卡(滑過展開,可聊天 / 通話);AccountMenu 是「自己」的入口,兩者不互換</li>
          <li><strong>側欄底部的帳號列</strong> —— 同樣是「自己」,但屬於側欄版面;標頭版面才用 AccountMenu</li>
          <li><strong>DropdownMenu</strong> —— 一般選單;AccountMenu 是它固定成帳號用途的版本(頭像觸發 + 固定項目)</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

export const PlacementRule: Story = {
  name: '放置規則:每個畫面只出現一次',
  render: () => (
    <TutorialPage className="max-w-3xl">
      <TutorialRule title="帳號入口放在哪裡,由版面模式決定">
        <TutorialList>
          <li><strong>primary-header：</strong>global header 右側使用 AccountMenu。</li>
          <li><strong>primary-sidebar：</strong>帳號入口留在 SidebarFooter，不另放 AccountMenu。</li>
          <li><strong>Menu 左側浮層：</strong>浮層蓋住 global header 時，入口鏡像到浮層頂排的 SidebarHeader 右側（只在浮層那一份）。</li>
          <li><strong>禁止：</strong>global header 與 sidebar footer 同時各放一份。</li>
        </TutorialList>
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

// @story-baseline: packages/design-system/src/components/AppShell/_demo-helpers.tsx#GlobalHeader
// (WorkspaceBrand + AccountMenu archetype;_demo-helpers 依 naming-conventions 只供同資料夾消費,
//  故本檔照 M23(d) 抄 production baseline 結構 + cite,不 cross-folder import demo helper)
import type { Meta, StoryObj } from '@storybook/react'
import { AccountMenu } from './account-menu'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'

const meta: Meta = {
  title: 'Design System/Components/AccountMenu/展示',
  parameters: { layout: 'padded' },
}
export default meta

const noop = () => {}

// 示範資料對齊 AppShell demo baseline(Alan Chen / EMP-1001,真實業務場景)
const DEMO_USER = {
  name: 'Alan Chen',
  avatar: { src: 'https://i.pravatar.cc/48?u=EMP-1001', color: 'blue' as const },
}

// ── 全域標頭帳號入口(primary-header globalHeader 右側 canonical 位置)──
// 結構抄 _demo-helpers.tsx GlobalHeader archetype:ChromeHeader(top-level chrome 自畫 bg-surface,
// header-canonical.spec.md 規則 6)+ brand 左(raw <Avatar size={24}> per 4.5 canonical)+ flex-1
// + AccountMenu 右。放置 SSOT → app-shell.spec.md「帳號入口(Account entry)放置 SSOT」。
export const GlobalHeaderEntry: StoryObj = {
  name: '全域標頭帳號入口',
  render: () => (
    <ChromeHeader className="bg-surface">
      <div className="flex items-center gap-2 min-w-0">
        {/* 24 per header-canonical.spec.md 4.5 chrome header avatar canonical; sync with --chrome-header-avatar-size */}
        <Avatar size={24} shape="square" color="blue" solid alt="Acme Inc" />
        <span className="text-body-lg font-medium truncate">Acme Inc</span>
      </div>
      <div className="flex-1" />
      <AccountMenu
        user={DEMO_USER}
        onViewProfile={noop}
        onOpenSettings={noop}
        onSignOut={noop}
      />
    </ChromeHeader>
  ),
}

// ── 展開快照(M15 visual-audit coverable:不需真人點擊即可截圖選單內容)──
export const OpenSnapshot: StoryObj = {
  name: '展開快照',
  render: () => (
    <div className="flex justify-end pb-64">
      <AccountMenu
        user={DEMO_USER}
        onViewProfile={noop}
        onOpenSettings={noop}
        onSignOut={noop}
        defaultOpen
      />
    </div>
  ),
}

// @story-baseline: packages/design-system/src/components/AppShell/_demo-helpers.tsx#GlobalHeader
// (WorkspaceBrand + AccountMenu archetype;_demo-helpers 依 naming-conventions 只供同資料夾消費,
//  故本檔照 M23(d) 抄 production baseline 結構 + cite,不 cross-folder import demo helper)
import type { Meta, StoryObj } from '@storybook/react'
import { AccountMenu } from './account-menu'
import { demoPersonPhoto } from '@/design-system/stories-helpers/scene/person-card'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'

const meta: Meta = {
  title: 'Design System/Components/AccountMenu/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: '全域 chrome 中目前登入者的帳號入口，以 avatar 開啟個人資料、設定與登出選單。primary-header 模式需要唯一帳號入口時使用；他人資訊改用 ProfileCard。' } },
  },
}
export default meta

const noop = () => {}

// 示範資料對齊 AppShell demo baseline(Alan Chen / EMP-1001,真實業務場景)
const DEMO_USER = {
  name: 'Alan Chen',
  avatar: { src: demoPersonPhoto('Alan Chen', 48), color: 'blue' as const },
}

// ── 全域標頭帳號入口(primary-header globalHeader 右側 canonical 位置)──
// 結構抄 _demo-helpers.tsx GlobalHeader archetype:ChromeHeader(top-level chrome 自畫 bg-surface,
// header-canonical.spec.md 規則 6)+ brand 左(raw <Avatar size={24}> per 4.5 canonical)+ flex-1
// + AccountMenu 右。放置 SSOT → app-shell.spec.md「帳號入口(Account entry)放置 SSOT」。
export const GlobalHeaderEntry: StoryObj = {
  name: '全域標頭帳號入口',
  render: () => (
    <ChromeHeader className="bg-surface">
      {/* 品牌 Avatar ↔ 工作區名稱 8px = 同一個行內標記(圖示 + 名稱)內部的間距:inline-flex 行內群,utility-registry canonical_micro_geometry 的分類器認得,
          不需要放行章(值沿用已發布版)。這一格是 ChromeHeader 的 flex 子項,inline-flex 在 flex 容器裡照樣算成 flex,畫面不變 */}
      <div className="inline-flex items-center gap-2 min-w-0">
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
    // @layout-space-magic-ok: 展開快照在下方保留 256px 畫布高度,讓開著的選單落在 story 畫布內 —— 這是截圖畫布的留白,不是兩個元素之間的間距,layoutSpace 規則管不到;規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值
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

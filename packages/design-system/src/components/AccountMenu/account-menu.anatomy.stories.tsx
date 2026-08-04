// @anatomy-rationale: ColorMatrix + SizeMatrix N/A — AccountMenu 是固定的
// chrome identity composite，沒有 color / size variant；trigger avatar 依
// header-canonical.spec.md 固定 24px，選單色彩、尺寸與互動狀態由 DropdownMenu
// canonical 擁有。本檔保留 Overview / Inspector / StateBehavior / Accessibility。
// @story-baseline: packages/design-system/src/components/AccountMenu/account-menu.stories.tsx#GlobalHeaderEntry
import type { Meta, StoryObj } from '@storybook/react'
import { AccountMenu } from './account-menu'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta<typeof AccountMenu> = {
  title: 'Design System/Components/AccountMenu/設計規格',
  component: AccountMenu,
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof AccountMenu>

const noop = () => {}
const DEMO_USER = {
  name: 'Alan Chen',
  avatar: { src: 'https://i.pravatar.cc/48?u=EMP-1001', color: 'blue' as const },
}

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-8 max-w-3xl">
      <section>
        <H3>Anatomy</H3>
        <Desc>
          AccountMenu 是固定的帳號入口組合：24px Avatar button 作 Trigger，
          DropdownMenu Content 先顯示 identity Label，再放個人資料、設定與獨立分區的登出動作。
          元件只負責這個同構組合；放在 global header 或 mobile Sheet 由 AppShell placement SSOT 決定。
        </Desc>
        <div className="mt-4 inline-flex items-center gap-4 rounded-md border border-dashed border-divider p-4">
          <AccountMenu
            user={DEMO_USER}
            onViewProfile={noop}
            onOpenSettings={noop}
            onSignOut={noop}
          />
          <span className="text-caption text-fg-muted">Avatar trigger → identity label → navigation items</span>
        </div>
      </section>

      <section>
        <H3>固定結構</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>部位</Th><Th>Canonical</Th><Th>責任</Th></tr></thead>
            <tbody>
              <tr><Td mono>Trigger</Td><Td mono>Avatar size=24 + button</Td><Td>自己的帳號入口與可讀 aria-label</Td></tr>
              <tr><Td mono>Identity label</Td><Td mono>DropdownMenuLabel</Td><Td>顯示目前登入者姓名，不可 focus</Td></tr>
              <tr><Td mono>Default actions</Td><Td mono>2 DropdownMenuGroup</Td><Td>個人資料、設定、登出；登出以第二 group 分區，不另畫 separator</Td></tr>
              <tr><Td mono>Custom content</Td><Td mono>children</Td><Td>取代 default actions，但保留 identity label</Td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  ),
}

export const Inspector: Story = {
  name: '元件檢閱器',
  args: {
    user: DEMO_USER,
    align: 'end',
    triggerAriaLabel: '帳號與設定',
    onViewProfile: noop,
    onOpenSettings: noop,
    onSignOut: noop,
  },
  argTypes: {
    align: { control: 'inline-radio', options: ['start', 'center', 'end'] },
    triggerAriaLabel: { control: 'text' },
    defaultOpen: { control: false },
    children: { control: false },
  },
  render: args => (
    // items-start:容器只示範放置,不得成為 anchor 幾何的一部分(flex 預設 stretch 曾把
    // trigger 撐成 96px 高,選單因此離 avatar 44px;根因層已在 account-menu.tsx 鎖 size-6)
    <div className="flex min-h-32 items-start justify-end rounded-md border border-dashed border-divider p-4">
      <AccountMenu {...args} />
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="max-w-3xl space-y-4 text-body">
      <h3 className="text-h5">狀態由 Radix DropdownMenu 管理</h3>
      <ul className="list-disc space-y-2 pl-5 text-fg-secondary">
        <li>關閉：trigger 留在 tab sequence，Enter、Space 或 ArrowDown 開啟。</li>
        <li>開啟：item 接手鍵盤巡覽；Esc 關閉並把焦點還給 trigger。</li>
        <li>選取 default action：執行對應 callback 後關閉。</li>
        <li><code>defaultOpen</code> 只提供 uncontrolled 初始狀態；視覺快照由「展示 → 展開快照」統一覆蓋。</li>
      </ul>
    </div>
  ),
}

export const Accessibility: Story = {
  name: '無障礙與鍵盤',
  render: () => (
    <div className="max-w-3xl space-y-4 text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground">A11y contract</h3>
      <ul className="list-disc space-y-2 pl-5">
        <li>Trigger 是 <code>type="button"</code>，並以 <code>triggerAriaLabel</code> 提供可讀名稱。</li>
        <li>選單開啟期間不讓 modal <code>aria-hidden</code> subtree 留下可循序聚焦的 trigger。</li>
        <li>Label 僅作 presentation；所有動作維持 DropdownMenu 的 <code>menuitem</code> 語義。</li>
        <li>鍵盤操作與 focus return 完整繼承 DropdownMenu canonical，不在 AccountMenu 重造。</li>
      </ul>
    </div>
  ),
}

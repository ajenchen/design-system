// @story-trait-rationale: hasSizes 由 anatomy.stories.tsx SizeMatrix auto-compile owns size showcase; hasInteractiveStates 的 Disabled story 已在本檔覆蓋(2026-05-15 F-migration)。
import type { Meta, StoryObj } from '@storybook/react'
import { Users, Settings, Bell, ChevronDown, Archive, Pin, EyeOff } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'
import { Badge } from '@/design-system/components/Badge/badge'
import { ItemInlineActionButton } from '@/design-system/patterns/element-anatomy/item-anatomy'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/design-system/components/DropdownMenu/dropdown-menu'

const meta: Meta<typeof Tabs> = {
  title: 'Design System/Components/Tabs/展示',
  component: Tabs,
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj<typeof Tabs>

export const Default: Story = {
  name: '預設',
  // 2026-05-18 fix(user 抓 startIcon 違反 #4 全有全無):原 4 triggers 2 有 startIcon 2 無 →
  // 改成全無 startIcon(badge 是不同 slot 不算 startIcon),展示純文字 tabs 標準型。
  render: () => (
    <Tabs defaultValue="overview" className="w-[600px]">
      <TabsList>
        <TabsTrigger value="overview">總覽</TabsTrigger>
        <TabsTrigger value="members">成員</TabsTrigger>
        <TabsTrigger value="notifications" badge={<Badge count={3} />}>通知</TabsTrigger>
        <TabsTrigger value="settings">設定</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="text-body text-fg-secondary">專案的總覽資訊（KPI、最近活動、團隊成員簡介）</TabsContent>
      <TabsContent value="members" className="text-body text-fg-secondary">專案成員列表（3 人待邀請）</TabsContent>
      <TabsContent value="notifications" className="text-body text-fg-secondary">3 則未讀通知（提及、指派、留言回覆）</TabsContent>
      <TabsContent value="settings" className="text-body text-fg-secondary">專案設定（一般、權限、整合）</TabsContent>
    </Tabs>
  ),
}

export const WithSuffix: Story = {
  name: '帶後綴',
  // 2026-05-21 v3 升 inlineAction split-click pattern(per user「該後綴應該是 inline action +
  // 點擊 inline action 跟其他地方應該不同反應」directive):
  //   - 「全部」「通知」純文字 / badge 後綴(切 tab)
  //   - 「更多」tab 用 `inlineAction` 包 DropdownMenu — 點 tab body 切 tab,
  //     點 ChevronDown(inline action)開 dropdown 不切 tab。
  // 對齊 GitHub「Code ▾」/ Linear "Triage..." menu split-tab 共識。endIcon 不再示範
  // 「點下去展開更多」(misleading affordance),已撤回 spec L99。
  render: () => (
    <Tabs defaultValue="notifications" className="w-[700px]">
      <TabsList>
        <TabsTrigger value="all">全部</TabsTrigger>
        <TabsTrigger value="notifications" badge={<Badge count={12} />}>通知</TabsTrigger>
        <TabsTrigger
          value="more"
          inlineAction={
            // ItemInlineActionButton(無 Tooltip 內層)— DropdownMenuTrigger asChild slot 直接 compose
            // props 到 button(aria-haspopup, aria-expanded, data-state, onPointerDown toggle)。
            // 若用外層 ItemInlineAction(有 Tooltip wrap)會斷 asChild chain,trigger 失效。
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ItemInlineActionButton icon={ChevronDown} aria-label="更多選項" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem startIcon={Archive}>封存</DropdownMenuItem>
                <DropdownMenuItem startIcon={Pin}>釘選</DropdownMenuItem>
                <DropdownMenuItem startIcon={EyeOff}>隱藏</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        >
          更多
        </TabsTrigger>
      </TabsList>
    </Tabs>
  ),
}

export const AllWithStartIcon: Story = {
  name: '全部含起始圖示',
  // 2026-05-18 加(配合 #4 startIcon 全有全無 rule):示範另一極端 — 全 trigger 都帶
  // startIcon,uniform visual。對齊 Material UI 「icon-positioned tabs」共識。
  render: () => (
    <Tabs defaultValue="overview" className="w-[600px]">
      <TabsList>
        <TabsTrigger value="overview" startIcon={Bell}>總覽</TabsTrigger>
        <TabsTrigger value="members" startIcon={Users}>成員</TabsTrigger>
        <TabsTrigger value="settings" startIcon={Settings}>設定</TabsTrigger>
      </TabsList>
    </Tabs>
  ),
}

export const OverflowScroll: Story = {
  name: '溢出處理 — 水平捲動',
  // 2026-05-18 加(user 抓 overflow story 沒秀真實溢出):narrow 320px container + 8 tabs
  // 強制觸發 overflow → fade mask + scroll arrow 視覺實際可見。
  render: () => (
    <div className="w-[320px] border border-divider rounded-md p-2">
      <Tabs defaultValue="overview">
        <TabsList overflow="scroll">
          <TabsTrigger value="overview">總覽</TabsTrigger>
          <TabsTrigger value="members">成員</TabsTrigger>
          <TabsTrigger value="projects">專案設定</TabsTrigger>
          <TabsTrigger value="notifications">通知</TabsTrigger>
          <TabsTrigger value="integrations">整合</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
          <TabsTrigger value="billing">計費</TabsTrigger>
          <TabsTrigger value="security">安全性</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  ),
}

export const OverflowMenu: Story = {
  name: '溢出處理 — ⌄ 導覽選單',
  // 2026-05-18 加:narrow 320px container + 8 tabs 強制觸發 → 右側出現 ⌄ navigator(OverflowMenuTriggerButton),DropdownMenu 列全部 tab 快速跳轉;全 trigger 仍在捲動容器內可見。
  render: () => (
    <div className="w-[320px] border border-divider rounded-md p-2">
      <Tabs defaultValue="overview">
        <TabsList overflow="menu">
          <TabsTrigger value="overview">總覽</TabsTrigger>
          <TabsTrigger value="members">成員</TabsTrigger>
          <TabsTrigger value="projects">專案設定</TabsTrigger>
          <TabsTrigger value="notifications">通知</TabsTrigger>
          <TabsTrigger value="integrations">整合</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
          <TabsTrigger value="billing">計費</TabsTrigger>
          <TabsTrigger value="security">安全性</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  ),
}

// @story-trait-rationale: overflow 機制對照(none / scroll / menu side-by-side)由 anatomy
//   OverflowMatrix own;上方兩則「溢出處理」是 320px 窄容器的真實情境示範
//   (2026-05-18 加,user 要求展示層要真的看得到溢出),兩層分工不重複。

export const Disabled: Story = {
  name: '停用',
  render: () => (
    <Tabs defaultValue="a" className="w-[600px]">
      <TabsList>
        <TabsTrigger value="a">可用</TabsTrigger>
        <TabsTrigger value="b" disabled>停用</TabsTrigger>
        <TabsTrigger value="c">可用</TabsTrigger>
      </TabsList>
    </Tabs>
  ),
}

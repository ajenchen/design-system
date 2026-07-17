// @story-trait-rationale: hasSizes 由 anatomy.stories.tsx SizeMatrix owns size showcase;hasInteractiveStates 由 anatomy.stories.tsx StateBehavior owns(展示層 Disabled + AllWithStartIcon story 2026-07-17 Dim 24 retire — 分別與 anatomy StateBehavior disabled 列 / Overview startIcon slot + principles TriggerSlots 全 icon 示範重複)。
import type { Meta, StoryObj } from '@storybook/react'
import { ChevronDown, Archive, Pin, EyeOff } from 'lucide-react'
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
      <TabsContent value="all" className="text-body text-fg-secondary">全部訊息（通知、提及、系統公告）</TabsContent>
      <TabsContent value="notifications" className="text-body text-fg-secondary">12 則未讀通知（含 3 則需要你回覆）</TabsContent>
      <TabsContent value="more" className="text-body text-fg-secondary">已封存與已釘選的通知</TabsContent>
    </Tabs>
  ),
}

// AllWithStartIcon story 2026-07-17 Dim 24 retire — 「全 trigger 帶 startIcon」的 uniform visual
// 已由 anatomy Overview「Trigger 內部結構」slot(全帶 icon)+ principles TriggerSlots(startIcon 全有全無 rule)
// 完整覆蓋,單獨一則展示屬重複。#4 startIcon 全有全無 rule 語意保留在 TriggerSlots note。

// 工作區設定頁的 8 個分頁 — OverflowScroll / OverflowMenu 共用(narrow 320px 容器強制觸發溢出);
// 每個 trigger 都有對應 TabsContent,是完整可切換的真實設定頁(非只有 TabsList 的空殼)。
const workspaceSettingsTabs = [
  { value: 'overview', label: '總覽', content: '工作區總覽（成員、方案、近期活動）' },
  { value: 'members', label: '成員', content: '成員名單與角色權限管理' },
  { value: 'projects', label: '專案設定', content: '專案預設值與範本' },
  { value: 'notifications', label: '通知', content: '通知偏好與訂閱範圍' },
  { value: 'integrations', label: '整合', content: '已連接的第三方服務（Slack、Zoom、Google 日曆）' },
  { value: 'api', label: 'API', content: 'API 金鑰與 Webhook 設定' },
  { value: 'billing', label: '計費', content: '訂閱方案與付款方式' },
  { value: 'security', label: '安全性', content: '雙重驗證與登入裝置管理' },
] as const

export const OverflowScroll: Story = {
  name: '溢出處理 — 水平捲動',
  // 2026-05-18 加(user 抓 overflow story 沒秀真實溢出):narrow 320px container + 8 tabs
  // 強制觸發 overflow → fade mask + scroll arrow 視覺實際可見。
  render: () => (
    <div className="w-[320px] border border-divider rounded-md p-2">
      <Tabs defaultValue="overview">
        <TabsList overflow="scroll">
          {workspaceSettingsTabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {workspaceSettingsTabs.map((t) => (
          <TabsContent key={t.value} value={t.value} className="text-body text-fg-secondary mt-2">{t.content}</TabsContent>
        ))}
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
          {workspaceSettingsTabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {workspaceSettingsTabs.map((t) => (
          <TabsContent key={t.value} value={t.value} className="text-body text-fg-secondary mt-2">{t.content}</TabsContent>
        ))}
      </Tabs>
    </div>
  ),
}

// @story-trait-rationale: overflow 機制對照(none / scroll / menu side-by-side)由 anatomy
//   OverflowMatrix own;上方兩則「溢出處理」是 320px 窄容器的真實情境示範
//   (2026-05-18 加,user 要求展示層要真的看得到溢出),兩層分工不重複。

// Disabled story 2026-07-17 Dim 24 retire — 「可用 / 停用 / 可用」的 disabled 態
// 已由 anatomy StateBehavior 的 disabled 列(selected / hover / disabled 三態並列)完整覆蓋,
// 單獨一則展示屬重複。hasInteractiveStates trait 由 anatomy StateBehavior owns(見檔首 rationale)。

// AppShell stories 共用 helper(對齊 sidebar.stories.tsx IconCollapse baseline)
// @story-baseline: src/design-system/components/Sidebar/sidebar.stories.tsx#IconCollapse
//
// **嚴格**對齊既有 production-grade Sidebar story baseline,避免 AppShell stories 跟
// Sidebar 既有範例視覺偏移(2026-05-20 user 抓 anti-drift)。
// Showcase + Anatomy stories 全部 consume 此 file 不重發明 simplified mock。

import {
  Inbox,
  Calendar,
  Settings,
  Users,
  BarChart3,
  LayoutDashboard,
} from 'lucide-react'
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
} from '@/design-system/components/Sidebar/sidebar'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'
import {
  ItemAvatar,
} from '@/design-system/patterns/element-anatomy/item-anatomy'
import {
  NameCard,
  NameCardDefaultActions,
} from '@/design-system/components/NameCard/name-card'

// ── MAIN_NAV(對齊 sidebar.stories.tsx baseline)────────────────────────

export const MAIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

// ── WorkspaceBrand(對齊 sidebar.stories.tsx)────────────────────────────

// 2026-05-20 撤回 group-data-[collapsible=icon]:justify-center(fix「avatar 飛右後左收」動畫)。
// 真根因:展開 256px avatar 在 x=0,collapsible attribute 瞬切 + justify start→center,avatar
// 瞬間 jump 到 x=128(中心)然後跟 width 縮到 x=24 → 視覺看到 fly-right-then-left。
// Fix:avatar 永遠 left-align,sidebar 自身 side padding 視覺自然居中(對齊 VS Code / Linear 慣例)。
export const WorkspaceBrand = () => (
  <div className="flex items-center gap-2 min-w-0">
    <ItemAvatar alt="Acme Inc" shape="square" color="blue" solid />
    <span className="text-body-lg font-medium truncate group-data-[collapsible=icon]:hidden">Acme Inc</span>
  </div>
)

// ── UserFooter(對齊 sidebar.stories.tsx)────────────────────────────────

export const UserFooter = () => (
  <SidebarMenu>
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <div role="group" aria-label="當前使用者">
          <ItemAvatar
            alt="Alan Chen"
            color="blue"
            hoverCard={
              <NameCard
                name="Alan Chen"
                subtitle="Design｜D-0042"
                avatar={{ alt: 'Alan Chen', color: 'blue' }}
                status="online"
                actions={<NameCardDefaultActions />}
              />
            }
          />
          <span data-sidebar="menu-label" className="min-w-0 flex-1 truncate">Alan Chen</span>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
)

// ── AcmeSidebar(完整 production-grade,對齊 sidebar IconCollapse story)──
// `includeWorkspaceBrand` default true(primary-sidebar 派 Linear/Notion 慣例:workspace brand 在 sidebar 頂)。
// `false` 用於 primary-header mode:workspace brand 移到 globalHeader 左側(GitHub logo / Slack workspace bar 慣例)。

export function AcmeSidebar({
  viewportInsetTop,
  includeWorkspaceBrand = true,
}: {
  viewportInsetTop?: string
  includeWorkspaceBrand?: boolean
} = {}) {
  return (
    <Sidebar collapsible="icon" viewportInsetTop={viewportInsetTop}>
      {includeWorkspaceBrand && (
        <SidebarHeader>
          <WorkspaceBrand />
        </SidebarHeader>
      )}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {MAIN_NAV.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    id={item.id}
                    startIcon={item.icon}
                    tooltip={item.label}
                  >
                    {item.label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserFooter />
      </SidebarFooter>
    </Sidebar>
  )
}

// ── GlobalHeader(primary-header mode 用,跨頁 chrome:WorkspaceBrand 左 + 跨頁 actions 右)──
// 2026-05-21 加 per user clarification「primary-header = primary-sidebar + 一條 global header」。
// 對齊 GitHub top nav(logo 左 / search 中 / account 右)+ Slack workspace bar 慣例。
// 消費 ChromeHeader(per `header-canonical.spec.md` Element + Background ownership 段:
// top-level chrome → 自畫 bg-surface)。

export function GlobalHeader({ rightSlot }: { rightSlot?: React.ReactNode } = {}) {
  return (
    <ChromeHeader className="bg-surface">
      <SidebarTrigger />
      <WorkspaceBrand />
      <div className="flex-1" />
      {rightSlot}
    </ChromeHeader>
  )
}

// ── PageHeader(top-level chrome header,消費 ChromeHeader primitive)──
// 2026-05-20 migrate 消費 ChromeHeader,撤回自刻 `<header>` + 重複 className
// (per header-canonical.spec.md「6. Background ownership」段「Top-level chrome
// header 自畫 bg-surface」+「Element canonical」段「ChromeHeader 內部用 `<header>`」)。
// global header aside toggle 已撤回(2026-05-20 user「圖二 global header 不該有」)— 由
// DataTable rowActions Info icon 主入口(row-driven)取代,page header 純 title。

export function PageHeader({
  title,
  tabsSlot,
  includeSidebarTrigger = true,
}: {
  title: string
  /**
   * Optional tabs row(per header-canonical.spec.md W1-W6 + Background ownership 段)。
   * 提供時 ChromeHeader 自動 column mode + suppress border + delegate paint 給 TabsList。
   */
  tabsSlot?: React.ReactNode
  /**
   * 是否含 SidebarTrigger(2026-05-21 加 per user「primary-header mode 的 sidebar toggle 應該只放在 primary header 才對」)。
   * - `primary-sidebar` mode = true(預設):PageHeader 是 chrome 第一層,trigger 自然在這
   * - `primary-header` mode = false:SidebarTrigger 已在 GlobalHeader,PageHeader 不該重複
   */
  includeSidebarTrigger?: boolean
}) {
  return (
    <ChromeHeader className="bg-surface" tabsSlot={tabsSlot}>
      {includeSidebarTrigger && <SidebarTrigger />}
      <h1 className="text-body-lg font-medium flex-1 truncate">{title}</h1>
    </ChromeHeader>
  )
}

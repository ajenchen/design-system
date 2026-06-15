// 完整 AppShell 範例 — 對齊 DS canonical `sidebar.stories.tsx#IconCollapse` baseline
// (per `.claude/rules/story-rules.md`「Production-grade composition fidelity」+ M23(d) nearest-same-purpose canonical wins)
//
// @story-baseline: @qijenchen/design-system/components/Sidebar/sidebar.stories.tsx#IconCollapse
// (2026-06-02 conformance-model:@story-baseline = consume canonical 結構的意圖,由靜態 conformance hook 驗
//  〔check_consumer_ds_primitive_misuse〔含 Pattern 8〕/ check_layout_space_magic_numbers / check_story_invariants
//  R7+R8〕。舊的 shell-only 視覺 identity-diff 標記已移除(此範本品牌 Acme Product / nav / 內容 by-design
//  異於 DS demo Acme Inc / MAIN_NAV,連 shell 文字都不同,pixel/DOM identity 即使遮罩內容也必 false-positive,
//  per composition-fidelity.md「禁拿產品範本 pixel 比 showcase」)。注意:此註解刻意不寫可被 diff script regex
//  解析的標記字面,以免「解釋移除」反而把標記種回去。)
//
// SSOT 鐵律:
//   - Consumer 只 import `@qijenchen/design-system` public exports
//   - 禁修改 DS source(走 fork DS repo)
//   - 視覺 token 透過 DS 提供的 `@qijenchen/design-system/styles/tokens` 載入
//
// Fork user 替換步驟:
//   1. 替換 NAV array(新 product 的真實導覽項)
//   2. 替換 WorkspaceBrand 內 workspace 名 / Avatar 顏色
//   3. 替換 DashboardPage 為真實業務 widgets(DataTable / Chart / Card 等 DS 元件)
//   4. 替換 PageHeader rightSlot 的 primary action(若有)

import { useState } from 'react'
import {
  AppShell,
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  ChromeHeader,
  TooltipProvider,
  Avatar,
  ItemAvatar,
  Button,
} from '@qijenchen/design-system'
import { LayoutDashboard, Users, Settings, FileText, BarChart3 } from 'lucide-react'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'orders', label: 'Orders', icon: FileText },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

// ── Sidebar(對齊 DS IconCollapse baseline:collapsible="icon" + WorkspaceBrand + footer)──
function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* Chrome header avatar canonical(per header-canonical.spec.md:57-72):chrome header 不是 row context → raw <Avatar size={24}>,禁用 <ItemAvatar>(會誤啟動 row anatomy lookup)*/}
        <div className="flex items-center gap-2 min-w-0 group-data-[collapsible=icon]:justify-center">
          <Avatar alt="Acme Product" size={24} shape="square" color="blue" solid />
          <span className="text-body-lg font-medium truncate group-data-[collapsible=icon]:hidden">Acme Product</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(({ id, label, icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton id={id} startIcon={icon} tooltip={label}>
                    {label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {/* 對齊 DS canonical UserFooter(sidebar.stories.tsx):asChild + <div role="group"> + data-sidebar="menu-label" 必有,否則 SidebarMenuButton 把 children 全 wrap 進 ItemLabel 視覺垂直 stack */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <div role="group" aria-label="當前使用者">
                <ItemAvatar alt="Current user" color="blue" />
                <span data-sidebar="menu-label" className="min-w-0 flex-1 truncate">當前使用者</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

// ── PageHeader(消費 DS ChromeHeader primitive,2026-06-12 修:原手刻 <header className=...>
// 繞過 header-canonical 全部機械簽名 + 違反「消費 primitive 不 hand-craft」canonical;
// 對齊 _demo-helpers.tsx PageHeader 同款消費形)──
// SidebarTrigger 必有(primary-sidebar mode 的 menu toggle 入口,⌘B keyboard shortcut)
// rightSlot 用 JSX.Element(非 React.ReactNode):workspace 內 app 自帶 @types/react 副本與
// DS 套件 .d.ts 解析的 ReactNode 版本不相容(bigint 差異)— Element 兩邊皆可指派
function PageHeader({ title, rightSlot }: { title: string; rightSlot?: JSX.Element }) {
  return (
    <ChromeHeader className="bg-surface">
      <SidebarTrigger />
      <h1 className="text-body-lg font-medium flex-1 truncate">{title}</h1>
      {rightSlot}
    </ChromeHeader>
  )
}

function DashboardPage() {
  return (
    <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] space-y-6">
      <section>
        <h2 className="text-h5 mb-2">Today</h2>
        <p className="text-body text-fg-secondary">
          替換為真實業務 — 訂單 / 收入 / 待處理任務等 dashboard widgets。Consume DS components
          (DataTable / Chart / Card / Stat 等),never modify DS source。
        </p>
      </section>
      <section className="grid grid-cols-3 gap-4">
        {['Revenue', 'Active customers', 'Pending orders'].map((label) => (
          <div key={label} className="rounded-lg border border-divider bg-surface p-4">
            <div className="text-caption text-fg-secondary">{label}</div>
            <div className="text-h3 mt-1">—</div>
          </div>
        ))}
      </section>
    </div>
  )
}

export default function App() {
  const [activeId, setActiveId] = useState<string>('dashboard')
  const current = NAV.find((n) => n.id === activeId) ?? NAV[0]
  // TooltipProvider self-wrap(Storybook story render 跳過 main.tsx → App 必自帶 TooltipProvider context)
  return (
    <TooltipProvider delayDuration={500} skipDelayDuration={300}>
      <SidebarProvider activeId={activeId} onActiveChange={setActiveId}>
        <AppShell
          layout="primary-sidebar"
          sidebar={<AppSidebar />}
          header={
            <PageHeader
              title={current.label}
              rightSlot={<Button variant="primary" size="md">New customer</Button>}
            />
          }
        >
          <DashboardPage />
        </AppShell>
      </SidebarProvider>
    </TooltipProvider>
  )
}

// Cloud Kitchen Hub — AppShell
// @story-baseline: @qijenchen/design-system/components/Sidebar/sidebar.stories.tsx#IconCollapse

import { useState } from 'react'
import {
  AppShell, SidebarProvider, Sidebar, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu,
  SidebarMenuItem, SidebarMenuButton, SidebarTrigger, TooltipProvider,
  Avatar, ItemAvatar,
} from '@qijenchen/design-system'
import {
  LayoutDashboard, ClipboardList, BookOpen, Truck, Settings,
} from 'lucide-react'
import { DashboardPage } from './pages/DashboardPage'
import { OrderListPage } from './pages/OrderListPage'
import { CreateOrderPage } from './pages/CreateOrderPage'
import { RecipePage } from './pages/RecipePage'
import { DispatchPage } from './pages/DispatchPage'
import { SettingsPage } from './pages/SettingsPage'

export type PageId =
  | 'dashboard'
  | 'orders'
  | 'create-order'
  | 'recipe'
  | 'dispatch'
  | 'settings'

const NAV = [
  { id: 'dashboard' as PageId, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'orders' as PageId, label: '訂單中心', icon: ClipboardList },
  { id: 'recipe' as PageId, label: 'Recipe & 履歷', icon: BookOpen },
  { id: 'dispatch' as PageId, label: '派工中心', icon: Truck },
  { id: 'settings' as PageId, label: '系統設定', icon: Settings },
]

function AppSidebar({ onNav }: { onNav: (id: PageId) => void }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 min-w-0 group-data-[collapsible=icon]:justify-center">
          <Avatar alt="Cloud Kitchen Hub" size={24} shape="square" color="orange" solid />
          <span className="text-body-lg font-medium truncate group-data-[collapsible=icon]:hidden">
            Cloud Kitchen
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(({ id, label, icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton id={id} startIcon={icon} tooltip={label} onClick={() => onNav(id)}>
                    {label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <div role="group" aria-label="目前使用者">
                <ItemAvatar alt="廚房管理員" color="orange" />
                <span data-sidebar="menu-label" className="min-w-0 flex-1 truncate">廚房管理員</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

function PageHeader({ title, rightSlot }: { title: string; rightSlot?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-2 h-[var(--chrome-header-height)] px-[var(--layout-space-loose)] bg-surface border-b border-divider">
      <SidebarTrigger />
      <h1 className="text-body-lg font-medium flex-1 truncate">{title}</h1>
      {rightSlot}
    </header>
  )
}

export default function App() {
  const [pageId, setPageId] = useState<PageId>('dashboard')
  const [orderForRecipe, setOrderForRecipe] = useState<string | null>(null)

  const navLabel = NAV.find(n => n.id === pageId)?.label ?? 'Dashboard'

  function navigateTo(id: PageId, orderId?: string) {
    setPageId(id)
    if (orderId) setOrderForRecipe(orderId)
  }

  function renderPage() {
    switch (pageId) {
      case 'dashboard': return <DashboardPage onNavigate={navigateTo} />
      case 'orders': return <OrderListPage onNavigate={navigateTo} />
      case 'create-order': return <CreateOrderPage onBack={() => setPageId('orders')} />
      case 'recipe': return <RecipePage orderId={orderForRecipe} onNavigate={navigateTo} />
      case 'dispatch': return <DispatchPage onNavigate={navigateTo} />
      case 'settings': return <SettingsPage />
      default: return <DashboardPage onNavigate={navigateTo} />
    }
  }

  return (
    <TooltipProvider delayDuration={500} skipDelayDuration={300}>
      <SidebarProvider activeId={pageId} onActiveChange={(id) => setPageId(id as PageId)}>
        <AppShell
          layout="primary-sidebar"
          sidebar={<AppSidebar onNav={navigateTo} />}
          header={<PageHeader title={navLabel} />}
        >
          {renderPage()}
        </AppShell>
      </SidebarProvider>
    </TooltipProvider>
  )
}

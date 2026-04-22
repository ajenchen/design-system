import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  LayoutDashboard, Inbox, Users, Settings, Bell,
  Folder, FileText, FileCode, Plus, MoreVertical,
} from 'lucide-react'
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from './sidebar'
import { TreeView, TreeItem } from '@/design-system/components/TreeView/tree-view'
import { ItemAvatar, ItemLabel } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { NameCard, NameCardDefaultActions } from '@/design-system/components/NameCard/name-card'

const meta: Meta = {
  title: 'Design System/Components/Sidebar/展示',
  parameters: { layout: 'fullscreen' },
}
export default meta

type Story = StoryObj

// ── 主導覽(設計好的 1 層扁平,每項必須有 icon 以支援 icon 模式)──────────
const MAIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

// ── 共用元件 ─────────────────────────────────────────────────────────────

/**
 * Workspace 品牌 header——Avatar 方塊 + workspace 名稱。
 * 不加 padding——SidebarHeader 已用 loose token 提供水平 padding。
 *
 * Chrome typography:`text-body-lg font-medium`(16px)——跟 page title 同級。
 */
const WorkspaceBrand = () => (
  <div className="flex items-center gap-2 min-w-0 group-data-[collapsible=icon]:justify-center">
    <ItemAvatar alt="Acme Inc" shape="square" color="blue" solid />
    <span className="text-body-lg font-medium truncate group-data-[collapsible=icon]:hidden">Acme Inc</span>
  </div>
)

/**
 * User footer——用 SidebarMenu 結構,每個 footer 項目是一個 SidebarMenuButton。
 * 未來可加更多選項(Settings / Help / Logout 等),全部共用同一套 item-layout。
 *
 * **Avatar 尺寸遵守 item-layout.spec 的預設**:
 * 無 description → inline 模式 24px @ md(20/24/24 for sm/md/lg)
 * **不要為了跟 icon 對齊而把 avatar 改小**——不同 prefix 類型(icon 16 / avatar 24)
 * 的 label x 位置略有差異是可接受的,每個 prefix 反映自己的視覺重量(詳見 spec)。
 *
 * asChild + h-[1lh] 容器強制 avatar 對齊第一行文字中線。
 */
const UserFooter = () => (
  <SidebarMenu>
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <button type="button">
          <ItemAvatar
            alt="Alan Chen"
            color="blue"
            hoverCard={<NameCard name="Alan Chen" subtitle="Design｜D-0042" actions={<NameCardDefaultActions />} onViewMore={() => {}} />}
          />
          <span data-sidebar="menu-label" className="min-w-0 flex-1 truncate">Alan Chen</span>
        </button>
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
)

/**
 * 主內容區——h-12 header 對齊 SidebarHeader 高度。
 * Trigger 是唯一的 sidebar 切換入口。
 */
const PageContent = ({ title, description }: { title: string; description: React.ReactNode }) => (
  <main className="flex-1 flex flex-col min-w-0 min-h-svh bg-canvas">
    {/* Header 用 --chrome-header-height token,跟 SidebarHeader 自動同高對齊,隨 density 變 */}
    <header className="flex h-[var(--chrome-header-height)] shrink-0 items-center gap-2 border-b border-divider bg-surface px-[var(--layout-space-loose)]">
      {/* 不加 -ml-1(shadcn 原版的 offset 是補償 Button 的 px-3;我們 text iconOnly 是 p-0 無 padding,
          trigger 直接貼 loose 邊界即對齊) */}
      <SidebarTrigger />
      {/* Chrome typography:跟 workspace brand 同 `text-body-lg font-medium` (16px),
          平等 sibling。「當下在哪頁」的訊號由 sidebar active item 負責,不靠 title 字重 */}
      <h1 className="text-body-lg font-medium">{title}</h1>
    </header>
    <div className="flex-1 overflow-auto p-8">
      <div className="max-w-2xl">
        <p className="text-body text-fg-secondary mb-6">{description}</p>
        <div className="grid grid-cols-2 gap-4">
          {['專案數量', '團隊成員', '本週提交', '待處理'].map((t) => (
            <div key={t} className="rounded-lg border border-divider bg-surface p-4">
              <p className="text-caption text-fg-muted">{t}</p>
              <p className="text-h5 font-semibold mt-1">{Math.floor(Math.random() * 100)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  </main>
)

// ── 1. 完整佈局(icon 收合模式,預設推薦)────────────────────────────────

export const IconCollapse: Story = {
  name: '完整佈局(icon 收合)',
  render: () => {
    const [activeId, setActiveId] = React.useState<string>('dashboard')

    return (
      <SidebarProvider activeId={activeId} onActiveChange={setActiveId}>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <WorkspaceBrand />
          </SidebarHeader>
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

        <PageContent
          title={MAIN_NAV.find((n) => n.id === activeId)?.label ?? 'Dashboard'}
          description={
            <>
              扁平主導覽用 <code className="text-caption px-1 bg-neutral-hover rounded">SidebarMenu</code>,
              每項必須有 icon。點左上角 <strong>SidebarTrigger</strong>(灰框按鈕)或按
              <kbd className="text-caption px-1 bg-neutral-hover rounded">⌘B</kbd> 切換收合。
              收合後變 icon rail,hover 顯示 tooltip。
            </>
          }
        />
      </SidebarProvider>
    )
  },
}

// ── 2. 混合內容(SidebarMenu + TreeView)─────────────────────────────────

const PROJECTS_TREE = [
  { id: 'web', label: 'Web App', icon: Folder, children: [
    { id: 'frontend', label: 'frontend', icon: Folder },
    { id: 'backend', label: 'backend', icon: Folder },
    { id: 'readme', label: 'README.md', icon: FileText },
  ]},
  { id: 'mobile', label: 'Mobile App', icon: Folder, children: [
    { id: 'ios', label: 'iOS', icon: FileCode },
    { id: 'android', label: 'Android', icon: FileCode },
  ]},
  { id: 'docs', label: 'Docs', icon: Folder },
  { id: 'design', label: 'Design System', icon: Folder },
  { id: 'infra', label: 'Infrastructure', icon: Folder },
  { id: 'analytics', label: 'Analytics', icon: Folder },
]

export const MixedContent: Story = {
  name: '混合內容(SidebarMenu + TreeView)',
  render: () => {
    // 單一 active state 跨整個 sidebar——SidebarProvider 內建 single-selection,
    // 每個 SidebarMenuButton 只要傳 `id`,點擊自動 setActiveId、isActive 自動算。
    // TreeView 的 selectedIds 需要手動同步(TreeView 有自己的 selection state)。
    const [activeId, setActiveId] = React.useState<string>('frontend')
    const isInMainNav = MAIN_NAV.some((n) => n.id === activeId)
    // Show-more 展示:預設只顯示前 2 個 project,點「查看更多」展開全部
    const [showAllProjects, setShowAllProjects] = React.useState(false)
    const visibleProjects = showAllProjects ? PROJECTS_TREE : PROJECTS_TREE.slice(0, 2)
    const remainingCount = PROJECTS_TREE.length - 2

    return (
      <SidebarProvider activeId={activeId} onActiveChange={setActiveId}>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <WorkspaceBrand />
          </SidebarHeader>
          <SidebarContent>
            {/* 主導覽——`id` prop 讓每個 button 自動接 SidebarProvider 的 single-selection,
                不需要 consumer 手動 isActive + onClick */}
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

            {/* User data:TreeView,icon 模式整區隱藏。
                `collapsible` 讓整個 group 可收合——label 變 trigger + 自動 chevron,
                content 用 Radix Collapsible 包起來。
                群組之間的分隔線由 SidebarGroup 的 [&+&]:before 自動處理。 */}
            <SidebarGroup collapsible className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel>Projects</SidebarGroupLabel>
              <SidebarGroupContent>
                <TreeView
                  aria-label="Projects"
                  defaultExpandedIds={['web']}
                  selectedIds={new Set(isInMainNav ? [] : [activeId])}
                  onSelectedChange={(ids) => {
                    const first = Array.from(ids)[0]
                    if (first) setActiveId(first)
                  }}
                >
                  {visibleProjects.map((proj) => (
                    <TreeItem key={proj.id} id={proj.id} icon={proj.icon} label={proj.label}>
                      {proj.children?.map((child) => (
                        <TreeItem key={child.id} id={child.id} icon={child.icon} label={child.label} />
                      ))}
                    </TreeItem>
                  ))}
                </TreeView>
                {/* Section 底部的「查看更多」——variant="meta" 自動:
                    - fg-muted 文字(視覺退到 meta 層)
                    - font-normal(從 nav 的 medium 退下來)
                    - 不參與 single-selection(不會變 active,不需 id)
                    - hover 時升到 foreground,跟其他 row 共用 row rhythm
                    無 icon——對齊 Linear / Notion / macOS Mail 的「Show more」慣例,
                    label x 自然跟上方 tree items 錯位是 feature(meta != data 視覺訊號)*/}
                {remainingCount > 0 && (
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        variant="meta"
                        onClick={() => setShowAllProjects((v) => !v)}
                      >
                        {showAllProjects ? '顯示更少' : `查看更多 (${remainingCount})`}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                )}
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Favorites:扁平清單 + hover-reveal inline actions。
                每個 item 傳 `id` 就自動參與整個 sidebar 的 single-selection——
                選 alpha 會自動 deselect Dashboard / TreeView 的選項,反之亦然。 */}
            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel>Favorites</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {['alpha', 'beta', 'gamma'].map((name) => (
                    <SidebarMenuItem key={name}>
                      <SidebarMenuButton
                        id={`fav-${name}`}
                        startIcon={Folder}
                        actionsReveal="hover"
                        inlineActions={[
                          { icon: MoreVertical, label: '更多動作', onClick: () => {} },
                          { icon: Plus, label: '新增', onClick: () => {} },
                        ]}
                      >
                        {name}
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

        <PageContent
          title={isInMainNav
            ? MAIN_NAV.find((n) => n.id === activeId)?.label ?? ''
            : activeId}
          description={
            <>
              上方 <code className="text-caption px-1 bg-neutral-hover rounded">SidebarMenu</code> 是 designer 設計好的主導覽,
              下方 <code className="text-caption px-1 bg-neutral-hover rounded">TreeView</code> 是使用者自建的 project 資料。
              整個 sidebar 同時只有一個 active,切到 icon 模式後 TreeView 整段隱藏。
            </>
          }
        />
      </SidebarProvider>
    )
  },
}

// ── 3. Offcanvas 模式 ─────────────────────────────────────────────────────

export const Offcanvas: Story = {
  name: 'Offcanvas 收合',
  render: () => {
    const [activeId, setActiveId] = React.useState<string>('dashboard')

    return (
      <SidebarProvider activeId={activeId} onActiveChange={setActiveId}>
        <Sidebar collapsible="offcanvas">
          <SidebarHeader>
            <WorkspaceBrand />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {MAIN_NAV.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton id={item.id} startIcon={item.icon}>
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

        <PageContent
          title={MAIN_NAV.find((n) => n.id === activeId)?.label ?? 'Dashboard'}
          description={
            <>
              Offcanvas 模式:收合時整個 sidebar 滑出畫面。重新展開的唯一方法是點左上角
              <strong> SidebarTrigger </strong>或按 <kbd className="text-caption px-1 bg-neutral-hover rounded">⌘B</kbd>。
            </>
          }
        />
      </SidebarProvider>
    )
  },
}

// ── 4. Mixed prefix(uniformPrefix:nav icon + brand logo)──────────────

export const IntegrationSidebar: Story = {
  name: 'Mixed prefix(icon + brand logo)',
  render: () => {
    const [activeId, setActiveId] = React.useState<string>('home')

    // Linear / Raycast 風格:主導覽是 lucide icon,integration 是 brand logo,
    // 兩者語意等價(都是「導覽目的地」),用 uniformPrefix 讓 label 齊左
    const NAV_ITEMS = [
      { id: 'home', label: 'Home', icon: LayoutDashboard },
      { id: 'inbox-2', label: 'Inbox', icon: Inbox },
      { id: 'team-2', label: 'Team', icon: Users },
    ] as const

    const INTEGRATIONS = [
      { id: 'github', label: 'GitHub', color: 'neutral' as const },
      { id: 'slack',  label: 'Slack',  color: 'purple'  as const },
      { id: 'figma',  label: 'Figma',  color: 'red'     as const },
    ]

    return (
      // uniformPrefix opt-in 啟用 school B(Notion/Linear 風格)的全域對齊。
      // 預設是 false(school A),這個 demo 主動開啟讓混用的 icon + brand logo 對齊。
      <SidebarProvider activeId={activeId} onActiveChange={setActiveId} uniformPrefix>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <WorkspaceBrand />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                {/* SidebarProvider 開了 uniformPrefix → CSS :has() 偵測這個 menu 同時存在
                    icon 跟 avatar prefix,自動套用 24px 固定槽:
                    - icon items(16px)在 24px 槽內 justify-center
                    - logo items(24px)填滿 24px 槽
                    - 兩種 label x 完全對齊
                    Notion / Raycast / Linear integrations 的 canonical 模式 */}
                <SidebarMenu>
                  {NAV_ITEMS.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton id={item.id} startIcon={item.icon} tooltip={item.label}>
                        {item.label}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {INTEGRATIONS.map((app) => (
                    <SidebarMenuItem key={app.id}>
                      <SidebarMenuButton id={app.id} tooltip={app.label} asChild>
                        <button type="button">
                          <ItemAvatar shape="square" alt={app.label} color={app.color} />
                          <ItemLabel>{app.label}</ItemLabel>
                        </button>
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

        <PageContent
          title={
            [...NAV_ITEMS, ...INTEGRATIONS].find((n) => n.id === activeId)?.label ?? 'Home'
          }
          description={
            <>
              <code className="text-caption px-1 bg-neutral-hover rounded">SidebarProvider uniformPrefix</code>
              {' '}opt-in 後,CSS :has() 偵測整個 sidebar 子樹的混用 prefix,nav icon(16px)
              和 brand logo(24px)在 24px 固定槽內共同對齊,兩種 label x 完全一致。Notion /
              Raycast / Linear integrations 的混用模式。預設關閉(school A,explicit 立場)。
            </>
          }
        />
      </SidebarProvider>
    )
  },
}


// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @story-history: hasSizes / hasInteractiveStates / Default 由 anatomy.stories.tsx SizeMatrix + StateBehavior + Inspector auto-compile owns(2026-05-15 F-migration);showcase 層展示真實導覽 / 整合情境。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  LayoutDashboard, Inbox, Users, Settings, Folder, FileText, FileCode, Plus, MoreVertical,
  User, LogOut, StarOff,
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
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuItem,
  SidebarMenuButton,
} from './sidebar'
import { MAIN_NAV } from '@/design-system/stories-helpers/data/sidebar-nav'
import { TreeView, TreeItem } from '@/design-system/components/TreeView/tree-view'
import { ItemAvatar, ItemLabel, ItemInlineAction, ItemInlineActionButton } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { Toaster, toast } from '@/design-system/components/Toast/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from '@/design-system/components/DropdownMenu/dropdown-menu'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'
import { InsightsView } from '@/design-system/components/AppShell/_demo-helpers'

const meta: Meta = {
  title: 'Design System/Components/Sidebar/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: '應用程式主要導覽與工作區 chrome 的側欄結構，包含群組、項目與收合;放在 AppShell 裡時,放不下會收成細列、按開關叫出左側浮層。產品以 primary-sidebar 模式組織跨頁導覽時使用。' } },
  },
}
export default meta

type Story = StoryObj

// ── 共用元件 ─────────────────────────────────────────────────────────────

/**
 * Workspace 品牌 header——Avatar 方塊 + workspace 名稱。
 * 不加 padding——SidebarHeader 已用 loose token 提供水平 padding。
 *
 * Chrome typography:`text-body-lg font-medium`(16px)——跟 page title 同級。
 */
// @canonical-pattern: chrome-header-brand
// Consumer 抄此 pattern 用於 SidebarHeader 內 brand。raw <Avatar size={24}>(chrome header 非 row context)。
// Per header-canonical.spec.md:57-72 + sidebar.spec.md:241-247。
const WorkspaceBrand = () => (
  // @layout-space-magic-ok: WorkspaceBrand:Avatar ↔ 工作區名稱 8px —— 規格沒寫 8 這個值(layoutSpace.spec.md「刻意固定值 OK」表只把這類列為 micro / 控件內部間距,sidebar.spec.md「Chrome 內的 text element」只定字級),不由 AI 補進規格(F-S7),沿用已發布值(main 同值)
  <div className="flex items-center gap-2 min-w-0 group-data-[collapsible=icon]:justify-center">
    <Avatar size={24} shape="square" color="blue" solid alt="Acme Inc" />
    <span className="text-body-lg font-medium truncate group-data-[collapsible=icon]:hidden">Acme Inc</span>
  </div>
)

/**
 * User footer——帳號入口(當前使用者)。整行 = 帳號選單(DropdownMenu)觸發點,
 * 點開「個人資料 / 設定 / 登出」。Rule owner = `app-shell.spec.md`
 * 「帳號入口(Account entry)放置 SSOT」:primary-sidebar mode 帳號家 = SidebarFooter,
 * 入口開帳號選單、不是 ProfileCard——ProfileCard 是看「別人」的人員卡
 * (預設動作 Chat / 通話,用在自己身上不對);職稱 / 工號等身份資訊歸
 * 帳號選單頂部 DropdownMenuLabel 第二行(text-caption)。
 *
 * Avatar 尺寸遵守 item-layout.spec 的預設:
 * 無 description → inline 模式 24px @ md(20/24/24 for sm/md/lg)
 * 不要為了跟 icon 對齊而把 avatar 改小——不同 prefix 類型(icon 16 / avatar 24)
 * 的 label x 位置略有差異是可接受的,每個 prefix 反映自己的視覺重量(詳見 spec)。
 */
// a11y(2026-07-30 帳號選單 rewrite;取代 2026-04-25 <div role='group'> + Avatar hoverCard 結構):
// DropdownMenuTrigger asChild → SidebarMenuButton asChild → 單一 <button type="button">
// = 整行唯一 interactive element,無 nested-interactive;aria-expanded / keyboard 由 Radix DropdownMenu 提供。
// @canonical-pattern: sidebar-menu-button-with-avatar
// Consumer 抄此 pattern 用於 SidebarMenuButton 含 Avatar prefix 時必走 asChild + <button type="button"> wrap
// + data-sidebar="menu-label" min-w-0 flex-1 truncate。不走會被 SidebarMenuButton 隱式 wrap 進
// ItemLabel 致 Avatar+text 垂直 stack(2026-05-27 user 抓的 bug)。
// 選單 baseline = dropdown-menu.stories.tsx Groups(DropdownMenuLabel + DropdownMenuGroup 分組)。
const UserFooter = () => (
  <SidebarMenu>
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton asChild tooltip="Alan Chen">
            <button type="button" aria-label="帳號與設定">
              <ItemAvatar src="https://i.pravatar.cc/48?u=EMP-1001" alt="Alan Chen" color="blue" />
              <span data-sidebar="menu-label" className="min-w-0 flex-1 truncate">Alan Chen</span>
            </button>
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" minWidth={280}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <span className="block truncate">Alan Chen</span>
              <span className="block truncate text-caption font-normal text-fg-secondary">Design｜D-0042｜EMP-1001</span>
            </DropdownMenuLabel>
            <DropdownMenuItem startIcon={User}>個人資料</DropdownMenuItem>
            <DropdownMenuItem startIcon={Settings}>設定</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuItem startIcon={LogOut}>登出</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
)

/**
 * 主內容區 — header 消費 ChromeHeader primitive(2026-05-20 migrate per
 * header-canonical.spec.md「6. Background ownership」段:top-level chrome
 * 自畫 bg-surface;Element canonical:ChromeHeader 內部用 `<header>`)。
 * Trigger 是唯一的 sidebar 切換入口。
 * 主區放真實頁面內容(D6 甲,user 10-21「D6 照你建議」:不做手刻指標卡、不亂造元件)—— 同一份 InsightsView
 * (AppShell 展示與設計規格「元件總覽」的 Main 也是它:本週 Sprint 摘要,DescriptionList 組成);
 * 每則的說明寫在 parameters.docs.description.story(story-rules「整頁情境」:畫布不放便條)。
 */
const PageContent = ({ title }: { title: string }) => (
  <main className="flex-1 flex flex-col min-w-0 min-h-svh bg-canvas">
    <ChromeHeader className="bg-surface">
      {/* 不加 -ml-1(shadcn 原版的 offset 是補償 Button 的 px-3;我們 text iconOnly 是 p-0 無 padding,
          trigger 直接貼 loose 邊界即對齊) */}
      <SidebarTrigger />
      {/* Chrome typography:跟 workspace brand 同 `text-body-lg font-medium` (16px),
          平等 sibling。「當下在哪頁」的訊號由 sidebar active item 負責,不靠 title 字重 */}
      <h1 className="text-body-lg font-medium">{title}</h1>
    </ChromeHeader>
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl">
        <InsightsView />
      </div>
    </div>
  </main>
)

// ── 1. 完整佈局(icon 收合模式,預設推薦)────────────────────────────────

export const IconCollapse: Story = {
  name: '完整佈局',
  parameters: { docs: { description: { story: '扁平主導覽用 `SidebarMenu`,每項必須有 icon。點左上角 **SidebarTrigger**(灰框按鈕)或按 ⌘B 切換收合;收合後變 icon rail,滑過顯示 tooltip。' } } },
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
        />
      </SidebarProvider>
    )
  },
}

// SidebarMenuAction 的 hover 階梯證據。2026-09-24 起它委派 `ItemInlineActionButton`(不再手刻),
// 所以這則同時是「委派後幾何正確」的視覺回歸樣本:16 圖示 / 18 懸停底色。
// 用 public Sidebar composition render 真實 row/action 關係,不直接複製 action class。
export const ActionHoverState: Story = {
  name: '側邊欄動作懸停狀態',
  tags: ['test-only'],
  render: () => (
    <div className="w-[320px] overflow-hidden rounded-lg border border-divider bg-surface p-2">
      <SidebarProvider defaultActiveId="roadmap" style={{ minHeight: 'auto' }}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton id="roadmap" startIcon={Folder}>
              產品路線圖
            </SidebarMenuButton>
            <SidebarMenuAction icon={MoreVertical} aria-label="更多產品路線圖操作" data-visual-hover-target />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>
    </div>
  ),
}

// ── 1b. 群組動作(SidebarGroupAction)──────────────────────────────────────
// 群組標題列右端那顆行內動作鈕:清單型群組的「新增一筆」入口(work-management `AppSidebar.tsx` 的
// All projects + Create project 同款,2026-09-29 補 story,待辦總帳 OE12)。`icon` 必填 —— 2026-09-24 起委派
// `ItemInlineActionButton`,API 從 children 改成 icon prop,刻意不留 children 後備(sidebar.spec.md「API 破壞性變更」,M23(f));
// 尺寸(16 圖示 / 18 懸停底色)由那顆 primitive 決定;位置 = 標題列自己的列尾槽(ItemSuffix,h-[1lh]),跟收合箭頭同一套公式,icon 收合模式整顆隱藏。
// 專案名稱取自代理整頁示範同一個假資料世界(結帳流程改版 …),「建立專案」把待排程的下一個專案加進群組。
const PROJECTS_SEED = [
  { id: 'checkout', label: '結帳流程改版' },
  { id: 'reconcile', label: '對帳批次' },
  { id: 'notify', label: '支付失敗通知' },
]
const PROJECTS_BACKLOG = ['會員等級重算', '發票寄送']
export const GroupAction: Story = {
  name: '群組動作',
  parameters: { docs: { description: { story: '群組標題列右端的行內動作鈕(`SidebarGroupAction`,`icon` 必填,放在 `SidebarGroupLabel` 之後、`SidebarGroupContent` 之前,按鈕會住進標題列的列尾槽,圖示中線對齊標題文字):清單型群組的「新增一筆」入口,這裡是「所有專案」的「建立專案」。它委派 `ItemInlineActionButton`,懸停底色就是命中區;側欄收成 icon 模式時整顆隱藏(標題也不在了)。按下去把下一個專案加進清單。' } } },
  render: function GroupActionStory() {
    const [activeId, setActiveId] = React.useState<string>('checkout')
    const [projects, setProjects] = React.useState(PROJECTS_SEED)
    const createProject = () => {
      const next = PROJECTS_BACKLOG[projects.length - PROJECTS_SEED.length]
      if (!next) return
      setProjects((list) => [...list, { id: `p${list.length + 1}`, label: next }])
    }
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
                  {MAIN_NAV.slice(0, 2).map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton id={item.id} startIcon={item.icon} tooltip={item.label}>
                        {item.label}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>所有專案</SidebarGroupLabel>
              <SidebarGroupAction icon={Plus} aria-label="建立專案" onClick={createProject} />
              <SidebarGroupContent>
                <SidebarMenu>
                  {projects.map((p) => (
                    <SidebarMenuItem key={p.id}>
                      <SidebarMenuButton id={p.id} startIcon={Folder} tooltip={p.label}>
                        {p.label}
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
          title={projects.find((p) => p.id === activeId)?.label ?? MAIN_NAV.find((n) => n.id === activeId)?.label ?? 'Dashboard'}
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

// 收藏(Favorites 群組):真實專案名,沿用同檔「群組動作」的專案(稽核 M095:原本 alpha / beta / gamma 是佔位符)
const FAVORITES_SEED = [
  { id: 'fav-checkout', label: '結帳流程改版' },
  { id: 'fav-reconcile', label: '對帳批次' },
  { id: 'fav-notify', label: '支付失敗通知' },
]
const treeLabel = (id: string) => PROJECTS_TREE.flatMap((p) => [p, ...(p.children ?? [])]).find((n) => n.id === id)?.label

/** 收藏列的兩顆動作鈕(寫法同 TreeView 展示的 DocRowActions:⋯ = 真的 DropdownMenu、＋ = 宣告式行內動作):
 *  「更多動作 → 取消收藏」把這一列拿掉;「新增」在這個專案新增一筆議題(Toast 回報,同 UD-B26「送出跳 Toast」)。 */
function FavoriteRowActions({ project, onUnfavorite }: { project: string; onUnfavorite: () => void }) {
  return (
    <>
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <ItemInlineActionButton icon={MoreVertical} aria-label="更多動作" overlayTrigger />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>更多動作</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem startIcon={StarOff} onClick={onUnfavorite}>取消收藏</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <ItemInlineAction action={{ icon: Plus, label: '新增', onClick: () => toast({ variant: 'success', title: `已在「${project}」新增一筆議題` }) }} />
    </>
  )
}
// 插槽裡放兩顆鈕:SidebarMenuButton 插槽模式只預留一顆的寬(sidebar.tsx「Slot mode 預設按 1 icon 預留(consumer 寬度自控)」),
// 照它說的由 consumer 補到兩顆 = loose + 2 × 16 + 8 + 0.5rem(與宣告式 inlineActions 兩顆時同一條公式)
const TWO_ACTION_SLOT_PR = '!pr-[calc(var(--layout-space-loose)+2.5rem+0.5rem)]'

export const MixedContent: Story = {
  name: '混合內容',
  parameters: { docs: { description: { story: '上方 `SidebarMenu` 是 designer 設計好的主導覽,下方 `TreeView` 是使用者自建的 project 資料。整個 sidebar 同時只有一個 active,切到 icon 模式後 TreeView 整段隱藏。' } } },
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
    const [favorites, setFavorites] = React.useState(FAVORITES_SEED)
    const [showArchived, setShowArchived] = React.useState(true)

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

            {/* User data:TreeView,icon 模式整區隱藏(下方 group 手動加 group-data-[collapsible=icon]:hidden)。
                `collapsible` 讓整個 group 可收合——label 尾端自動加 chevron button 作為
                Collapsible.Trigger(label 本身維持 presentation div,不升格為 button),
                content 用 Radix Collapsible 包起來。
                群組之間的分隔線由 SidebarGroup 的 [&+&]:before 自動處理。 */}
            <SidebarGroup collapsible value="projects" className="group-data-[collapsible=icon]:hidden">
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
                  {favorites.map((fav) => (
                    <SidebarMenuItem key={fav.id}>
                      <SidebarMenuButton
                        id={fav.id}
                        startIcon={Folder}
                        actionsReveal="hover"
                        className={TWO_ACTION_SLOT_PR}
                        inlineActionsSlot={<FavoriteRowActions project={fav.label} onUnfavorite={() => setFavorites((list) => list.filter((x) => x.id !== fav.id))} />}
                      >
                        {fav.label}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {/* Disabled favorite(已封存專案):host disabled 時 inline actions
                      整組不渲染——hover 也不出現 ⋯,不可操作就不暗示可操作
                      (sidebar.spec.md「Host disabled 時」+ inline-action.spec.md 宿主 disabled 規則)。 */}
                  {showArchived && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        startIcon={Folder}
                        disabled
                        actionsReveal="hover"
                        inlineActionsSlot={<FavoriteRowActions project="發票寄送" onUnfavorite={() => setShowArchived(false)} />}
                      >
                        發票寄送（已封存）
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <UserFooter />
          </SidebarFooter>
        </Sidebar>

        <PageContent
          title={MAIN_NAV.find((n) => n.id === activeId)?.label ?? treeLabel(activeId) ?? favorites.find((x) => x.id === activeId)?.label ?? ''}
        />
        <Toaster />
      </SidebarProvider>
    )
  },
}

// ── 3. Offcanvas 模式 ─────────────────────────────────────────────────────

export const Offcanvas: Story = {
  name: '抽屜收合（離畫面外）',
  parameters: { docs: { description: { story: 'Offcanvas 模式:收合時整個 sidebar 滑出畫面。重新展開的唯一方法是點左上角 **SidebarTrigger** 或按 ⌘B。' } } },
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
        />
      </SidebarProvider>
    )
  },
}

// ── 4. Mixed prefix(uniformPrefix:nav icon + brand logo)──────────────

export const IntegrationSidebar: Story = {
  name: '混合前綴',
  parameters: { docs: { description: { story: '開啟 `uniformPrefix` 後,icon 導覽項與帶 logo 的整合項會對齊到同一條左緣,讓文字起點一致(如 Notion / Raycast / Linear 的整合區)。預設關閉。' } } },
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
                    Notion / Raycast / Linear integrations 的 標準模式 */}
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
        />
      </SidebarProvider>
    )
  },
}

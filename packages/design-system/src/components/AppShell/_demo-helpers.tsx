// AppShell stories 共用 helper(對齊 sidebar.stories.tsx IconCollapse baseline)
// @story-baseline: packages/design-system/src/components/Sidebar/sidebar.stories.tsx#IconCollapse
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
  User,
  LogOut,
  FolderKanban,
} from 'lucide-react'
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  useSidebarSurface,
} from '@/design-system/components/Sidebar/sidebar'
import { useAppShell, type PanelWidthRange } from '@/design-system/components/AppShell/app-shell'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'
import {
  ItemAvatar,
} from '@/design-system/patterns/element-anatomy/item-anatomy'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { AccountMenu as AccountMenuPrimitive } from '@/design-system/components/AccountMenu/account-menu'
// 帳號選單內容(AccountMenuItems)在本檔以 DropdownMenu primitives 直接組,
// 供 header AccountMenu demo wrapper 與 footer UserFooter 共用(M17 單一 SSOT)。
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from '@/design-system/components/DropdownMenu/dropdown-menu'

// ── MAIN_NAV(對齊 sidebar.stories.tsx baseline)────────────────────────

export const MAIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

// ── 專案(可收合群組;「版面規則」示範頁用)────────────────────────────
/** Acme 的進行中專案(側欄的「專案」區段;示範資料)。 */
export const ACME_PROJECTS = [
  { id: 'proj-checkout', label: 'Q4 結帳改版' },
  { id: 'proj-mobile', label: '行動版 App 3.0' },
] as const

// ── WorkspaceBrand(對齊 sidebar.stories.tsx)────────────────────────────

// 2026-05-21 v15 — Chrome header avatar SSOT, semantic-correct revise(per user 抓 v14
// RowSizeProvider hijack 是 semantic 漂移 + 「想辦法在語言正確下修到正確」directive):
//
// Chrome header **不是 row context**(per `item-anatomy.spec.md:550` 規則 scope 是 row primitive
// consumer + `header-canonical.spec.md` 4.5 chrome header avatar SSOT)。Chrome header avatar
// 是 spec-level canonical 24px、density-fixed、row-size-fixed,跟 row-anatomy 的 sm/md/lg
// lookup 邏輯無關。
//
// 因此 chrome header 內 avatar **用 raw `<Avatar size={24}>`,不用 `<ItemAvatar>`**:
//   - ItemAvatar 透過 RowSizeContext lookup 是 row primitive(Sidebar / SelectMenu / TreeView 等)
//     的 anatomy helper,目的避免 asChild consumer 寫死跨 row size 漂移
//   - Chrome header 沒有 sm/md/lg row size 概念,無 lookup 需求,用 raw Avatar 才語義正確
//   - 父 `<div flex items-center>` 已 provide 縱向對齊,ItemPrefix wrapper(`h-[1lh]`)冗餘
//
// SSOT 鎖定:`<Avatar size={24}>` 對應 `--chrome-header-avatar-size: 1.5rem` token
// (`header-canonical.css`)+ `header-canonical.spec.md` 4.5 canonical「24px raw Avatar」。
// 公式端透過 var() 連動;JS 端透過 spec authority + comment cite 連動。改 24 → 同步 token + 此 hardcode。
export const WorkspaceBrand = () => (
  <div className="flex items-center gap-2 min-w-0">
    {/* 24 per header-canonical.spec.md 4.5 chrome header avatar canonical; sync with `--chrome-header-avatar-size` */}
    {/* Workspace brand = 組織識別(非人)→ 首字 letter mark;2026-07-08 人像真實化 sweep 刻意保留,
        真實人像僅套用於 person avatar(組織用人臉照片會誤導身份) */}
    <Avatar size={24} shape="square" color="blue" solid alt="Acme Inc" />
    <span className="text-body-lg font-medium truncate group-data-[collapsible=icon]:hidden">Acme Inc</span>
  </div>
)

// ── UserFooter(對齊 sidebar.stories.tsx;primary-sidebar 帳號入口 = footer 行開帳號選單)──
// per app-shell.spec.md「帳號入口(Account entry)放置 SSOT」「入口開什麼」段:入口開
// DropdownMenu 帳號選單,不掛 ProfileCard(看「別人」的人員卡)。選單內容與 AccountMenu
// 共用 AccountMenuItems(同檔單一 SSOT,M17)。

export const UserFooter = () => (
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
          <AccountMenuItems />
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
)

// ── AcmeSidebar(完整 production-grade,對齊 sidebar IconCollapse story)──
// `includeWorkspaceBrand` default true(primary-sidebar 派 Linear/Notion 慣例:workspace brand 在 sidebar 頂)。
// `false` 用於 primary-header mode:workspace brand 移到 globalHeader 左側(GitHub logo / Slack workspace bar 慣例)。
// `includeUserFooter` default true(primary-sidebar:帳號在 sidebar 底)。`false` 用於 primary-header:
// 帳號入口移到 globalHeader 右側 AccountMenu(GitHub/Gmail/Slack 慣例;見 app-shell.spec.md 帳號入口放置 SSOT)。

/**
 * Acme 示範產品給 Menu 的寬度設定(app-shell.spec.md「版面規則」§1:Menu 的最大寬 DS 沒有既有值,產品必給)。
 * 最小 / 初始 = DS 預設 240(`--sidebar-width-min` / `--sidebar-width`,user 2026-05-21 定);最大 320 = 示範產品自己的值
 * (多留 80px 給較長的專案名稱;示範用,不是 DS 規則)。
 */
export const ACME_MENU_WIDTH: PanelWidthRange = { min: 240, initial: 240, max: 320 }

/**
 * Acme 側欄頂排 —— **每一份自己判斷**(Menu 浮層開著時 Sidebar 的 children 畫兩份:版面上的細列 + 浮層;`sidebar.spec.md`「同一份內容、畫兩份」)。
 * 浮層精修(2026-06-18 v2;2026-10-14 改條件;2026-10-15 改成每一份自己判斷):Menu 浮層(Sheet,z-50)從視窗頂端起、蓋住 globalHeader →
 * primary-header 把品牌 + 帳號放 globalHeader,浮層內就看不到、浮層變孤兒,故在**浮層那一份**補回。
 * **每 mode 鏡像自己桌面的帳號家**(per app-shell.spec.md「帳號入口(Account entry)放置 SSOT」浮層精修):
 *   - primary-header:桌面帳號在 globalHeader 右(brand 左 / account 右)→ 浮層把整條 globalHeader 搬進 SidebarHeader
 *     (brand + flex-1 + AccountMenu;**SidebarHeader 即 ChromeHeader 基底,與 GlobalHeader 同 primitive** = 結構 SSOT,非手刻對齊),
 *     **不放 SidebarFooter**(footer 是 primary-sidebar 慣例;對齊 Material modal navigation drawer「帳號 switcher 放 drawer header,非 footer」)。
 *   - primary-sidebar:桌面帳號在 sidebar 底(SidebarFooter)→ 頂排 = brand(兩份都有,細列只露出品牌方塊)。
 * 被浮層蓋住的細列那一份**不補**(細列在浮層開著時保留、版面不跳,sidebar.spec.md「放不下時」)。判斷讀 `useSidebarSurface()`(這一份畫在哪),
 * 不讀 `useAppShell().display.menu`(整個 Menu 的顯示方式,兩份同時是 "overlay")—— 2026-10-14 版讀後者,primary-header 叫出浮層時細列那一份
 * 也長出標頭:細列圖示下跳 48px、品牌與帳號各 3 份(2026-10-15 r1b 複驗 F4)。「只能出現一次」= 同一時間看得到的只有一份。
 */
function AcmeSidebarHeader({ includeWorkspaceBrand }: { includeWorkspaceBrand: boolean }) {
  const { layout } = useAppShell()
  const menuIsOverlay = useSidebarSurface() === 'overlay'
  if (!includeWorkspaceBrand && !menuIsOverlay) return null
  // primary-header 的 Menu 浮層:帳號入口鏡像 globalHeader 放 SidebarHeader 右(SidebarHeader = ChromeHeader 基底,
  // 與 GlobalHeader「brand 左 + flex-1 + account 右」完全同結構 → avatar 24px + 右緣距 px-loose 由 construction 保證)。
  const headerHasAccount = layout === 'primary-header' && menuIsOverlay
  return (
    <SidebarHeader>
      <WorkspaceBrand />
      {headerHasAccount && (
        <>
          <div className="flex-1" />
          <AccountMenu />
        </>
      )}
    </SidebarHeader>
  )
}

export function AcmeSidebar({
  includeWorkspaceBrand = true,
  includeUserFooter = true,
  widthRange = ACME_MENU_WIDTH,
  collapsible = 'icon',
  includeProjects = false,
}: {
  includeWorkspaceBrand?: boolean
  includeUserFooter?: boolean
  /** Menu 寬度設定(預設 = Acme 示範產品的值;「版面規則」示範頁換成 user 例子的數字)。 */
  widthRange?: PanelWidthRange
  /** `icon` = 有細列(收起時只剩圖示,預設,同 Sidebar IconCollapse baseline);`offcanvas` = 收起整個不見。 */
  collapsible?: 'icon' | 'offcanvas'
  /**
   * 加上可收合的「專案」群組(預設收起;`value="projects"`)。「版面規則」示範頁用來示範 Menu 浮層與版面上兩份內容共用展開狀態
   * (sidebar.spec.md「同一份內容、畫兩份」):在浮層裡展開、收回、放寬回並排,群組仍是展開的。
   */
  includeProjects?: boolean
} = {}) {
  return (
    <Sidebar collapsible={collapsible} widthRange={widthRange}>
      <AcmeSidebarHeader includeWorkspaceBrand={includeWorkspaceBrand} />
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
        {includeProjects && (
          // 細列沒地方放展開的清單 → 細列時整組不顯示(同 Sidebar IconCollapse baseline 的 Projects 群組)
          <SidebarGroup collapsible value="projects" defaultOpen={false} className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>專案</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ACME_PROJECTS.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton id={project.id} startIcon={FolderKanban} tooltip={project.label}>
                      {project.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      {/* Footer 只 primary-sidebar(帳號在 sidebar 底);primary-header 帳號改放 SidebarHeader 右(見上),
          Menu 浮層時也不放 footer(誤用他 mode 慣例)。 */}
      {includeUserFooter && (
        <SidebarFooter>
          <UserFooter />
        </SidebarFooter>
      )}
    </Sidebar>
  )
}

// ── AccountMenuItems(帳號選單內容;header AccountMenu + footer UserFooter 共用,M17 SSOT)──
// DropdownMenuLabel 兩行 = 名字 + 身份資訊(text-caption)——per sidebar.spec.md
// 「SidebarFooter user 區必單行」:身份資訊歸帳號選單頂部,不佔 footer 行第二行。
function AccountMenuItems() {
  return (
    <>
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
    </>
  )
}

// ── AccountMenu(primary-header mode 用,主標頭右側「個人設定入口」)──────────────
// 2026-06-17 加 per user directive「primary-header 不該把個人設定放 sidebar footer,該放主標頭右側 avatar」。
// 2026-07-30 F9 升 public:元件本體升級至 `components/AccountMenu/account-menu.tsx`(SSOT),
// demo 只留綁 Alan Chen 示範資料的薄 wrapper 消費之,不再重複實作(視覺 / 行為 / 放置 canonical 不變;
// 放置 SSOT 仍在 app-shell.spec.md「帳號入口(Account entry)放置 SSOT」段)。
export function AccountMenu() {
  return (
    <AccountMenuPrimitive
      user={{
        name: 'Alan Chen',
        avatar: { src: 'https://i.pravatar.cc/48?u=EMP-1001', color: 'blue' },
      }}
      onViewProfile={() => {}}
      onOpenSettings={() => {}}
      onSignOut={() => {}}
    />
  )
}

// ── GlobalHeader(primary-header mode 用,跨頁 chrome:WorkspaceBrand 左 + 帳號入口右)──
// 2026-05-21 加 per user clarification「primary-header = primary-sidebar + 一條 global header」。
// 對齊 GitHub top nav(logo 左 / search 中 / account 右)+ Slack workspace bar 慣例。
// 消費 ChromeHeader(per `header-canonical.spec.md` Element + Background ownership 段:
// top-level chrome → 自畫 bg-surface)。

export function GlobalHeader({ rightSlot }: { rightSlot?: React.ReactNode } = {}) {
  // 2026-05-21 v2 ship Option B(per user「primary header toggle 為了與 sidebar menu item
  // startIcon 水平對齊...container 寬度 = sidebar-width-icon」+ Issue 2 geometry formula 落地):
  // 用 ChromeHeader `leadingRail` slot(width = `--sidebar-width-icon` = 2*loose + icon-size)。
  // Toggle center x = rail 寬度中點 = sidebar collapsed icon center x = 完美 vertical 對齊。
  return (
    <ChromeHeader className="bg-surface" leadingRail={<SidebarTrigger />}>
      <WorkspaceBrand />
      <div className="flex-1" />
      {rightSlot ?? <AccountMenu />}
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

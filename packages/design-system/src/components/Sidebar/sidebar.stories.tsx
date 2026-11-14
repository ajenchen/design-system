// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @story-history: hasSizes / hasInteractiveStates / Default 由 anatomy.stories.tsx SizeMatrix + StateBehavior + Inspector auto-compile owns(2026-05-15 F-migration);showcase 層展示真實導覽 / 整合情境。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  LayoutDashboard, Inbox, Users, Settings, Folder, FileText, Plus, MoreVertical,
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
import { DataTable, type DataTableProps } from '@/design-system/components/DataTable/data-table'
import type { PersonData } from '@/design-system/components/PeoplePicker/person-display'
import { demoPersonData, demoPersonPhoto } from '@/design-system/stories-helpers/scene/person-card'

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
              <ItemAvatar src={demoPersonPhoto('Alan Chen', 48)} alt="Alan Chen" color="blue" />
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
 * 主區放真實頁面內容(D6 甲,user 10-21「D6 照你建議」:不做手刻指標卡、不亂造元件),而且**跟著選到的項目走**
 * (2026-11-06 #56 甲):資料夾 → 裡面的檔案清單;檔案 → 這個檔案的版本紀錄(2026-11-10 PR #172 留言起;原本是屬性清單);專案 → 這個專案的議題;Dashboard 等主導覽 →
 * 同範本 DashboardPage 的做法(DS 元件組成的真實內容:「今日待處理」DataTable;apps/template/src/App.tsx)。
 * 每一頁主區都只有一張表格、標頭標題已說明這頁是什麼,所以不在主區重複放區段標題與說明(app-shell.spec.md「Main 內塞什麼」,user 2026-11-11)。
 * dashboard 放什麼由產品決定,DS 不定義卡片 / 內容框架(app-shell.spec.md「Main 內塞什麼」),所以這裡不做成像 DS 規定的版型。
 * 每則的說明寫在 parameters.docs.description.story(story-rules「整頁情境」:畫布不放便條)。
 */
const PageContent = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <main className="flex-1 flex flex-col min-w-0 min-h-svh bg-canvas">
    <ChromeHeader className="bg-surface">
      {/* 不加 -ml-1(shadcn 原版的 offset 是補償 Button 的 px-3;我們 text iconOnly 是 p-0 無 padding,
          trigger 直接貼 loose 邊界即對齊) */}
      <SidebarTrigger />
      {/* Chrome typography:跟 workspace brand 同 `text-body-lg font-medium` (16px),
          平等 sibling。「當下在哪頁」的訊號由 sidebar active item 負責,不靠 title 字重 */}
      <h1 className="text-body-lg font-medium">{title}</h1>
    </ChromeHeader>
    <div className="flex-1 overflow-auto">{children}</div>
  </main>
)

// ── 主區內容(跟著選到的項目走)────────────────────────────────────────────
// 版面照 layoutSpace.spec.md「Page 情境(全頁 list / dashboard)」:每一頁主區都只有一張表格,直接接在標頭下(MainTable)——
// 左右 loose(規則 1)、標頭 → 有框的表格 loose(規則 2 bounded region)、表格 → 底 loose(規則 4 第 2 列)。
// 表格資料極簡、不開虛擬捲動 / 拖曳 / 篩選(story-rules「整頁情境」)。日期寫死(story-determinism-invariant)。

// 人員欄傳人員物件(字串只會顯示縮寫,person-display.tsx toPersonData);照片走照片名冊,同一個人全 DS 同一張臉
const TEAM = {
  林雅婷: demoPersonData('林雅婷', 48),
  陳柏翰: demoPersonData('陳柏翰', 48),
  張詠晴: demoPersonData('張詠晴', 48),
  王俊傑: demoPersonData('王俊傑', 48),
} as const

type IssueRow = { key: string; title: string; assignee: PersonData; due: string }
const ISSUE_COLUMNS: DataTableProps<IssueRow>['columns'] = [
  { accessorKey: 'key', header: '議題', meta: { type: 'string', width: 120 } },
  { accessorKey: 'title', header: '標題', meta: { type: 'string', width: 320 } },
  { accessorKey: 'assignee', header: '負責人', meta: { type: 'person', width: 160 } },
  { accessorKey: 'due', header: '截止日', meta: { type: 'date', width: 140 } },
]
const PENDING_ISSUES: IssueRow[] = [
  { key: 'ENG-1042', title: '結帳頁 Apple Pay 按鈕在 Safari 17 不出現', assignee: TEAM.林雅婷, due: '2026/11/10' },
  { key: 'ENG-1041', title: '退款成功後訂單狀態沒有更新', assignee: TEAM.陳柏翰, due: '2026/11/10' },
  { key: 'ENG-1037', title: '對帳報表匯出 CSV 金額少了千分位', assignee: TEAM.張詠晴, due: '2026/11/11' },
  { key: 'ENG-1029', title: '支付失敗通知信的重試連結過期', assignee: TEAM.王俊傑, due: '2026/11/12' },
]
// 專案 → 這個專案的議題(「群組動作」新建的專案還沒有議題 → DataTable 自己的空狀態)
const PROJECT_ISSUES: Record<string, IssueRow[]> = {
  結帳流程改版: [
    { key: 'ENG-1042', title: '結帳頁 Apple Pay 按鈕在 Safari 17 不出現', assignee: TEAM.林雅婷, due: '2026/11/10' },
    { key: 'ENG-1035', title: '運費試算在離島地址回傳錯誤', assignee: TEAM.陳柏翰, due: '2026/11/14' },
    { key: 'ENG-1031', title: '折扣碼欄位按 Enter 會直接送出訂單', assignee: TEAM.林雅婷, due: '2026/11/18' },
  ],
  對帳批次: [
    { key: 'ENG-1037', title: '對帳報表匯出 CSV 金額少了千分位', assignee: TEAM.張詠晴, due: '2026/11/11' },
    { key: 'ENG-1033', title: '跨日批次在 00:00 前後重複入帳', assignee: TEAM.張詠晴, due: '2026/11/15' },
  ],
  支付失敗通知: [
    { key: 'ENG-1029', title: '支付失敗通知信的重試連結過期', assignee: TEAM.王俊傑, due: '2026/11/12' },
    { key: 'ENG-1026', title: '簡訊通知在夜間時段不應發送', assignee: TEAM.王俊傑, due: '2026/11/20' },
  ],
}

type FileRow = { name: string; updatedAt: string; updatedBy: PersonData }
const FILE_COLUMNS: DataTableProps<FileRow>['columns'] = [
  { accessorKey: 'name', header: '名稱', meta: { type: 'string', width: 280 } },
  { accessorKey: 'updatedAt', header: '最後修改', meta: { type: 'date', width: 160 } },
  { accessorKey: 'updatedBy', header: '修改者', meta: { type: 'person', width: 180 } },
]
// 資料夾 → 裡面的檔案(「混合內容」專案樹的資料夾;有子節點的資料夾就是樹上那幾個子節點)
const FOLDER_FILES: Record<string, FileRow[]> = {
  web: [
    { name: 'frontend', updatedAt: '2026/11/09', updatedBy: TEAM.林雅婷 },
    { name: 'backend', updatedAt: '2026/11/08', updatedBy: TEAM.陳柏翰 },
    { name: 'README.md', updatedAt: '2026/10/30', updatedBy: TEAM.張詠晴 },
  ],
  frontend: [
    { name: 'src', updatedAt: '2026/11/09', updatedBy: TEAM.林雅婷 },
    { name: 'public', updatedAt: '2026/10/21', updatedBy: TEAM.林雅婷 },
    { name: 'package.json', updatedAt: '2026/11/06', updatedBy: TEAM.陳柏翰 },
    { name: 'vite.config.ts', updatedAt: '2026/10/15', updatedBy: TEAM.林雅婷 },
  ],
  backend: [
    { name: 'api', updatedAt: '2026/11/08', updatedBy: TEAM.陳柏翰 },
    { name: 'migrations', updatedAt: '2026/11/03', updatedBy: TEAM.王俊傑 },
    { name: 'Dockerfile', updatedAt: '2026/10/27', updatedBy: TEAM.王俊傑 },
  ],
  mobile: [
    { name: 'iOS', updatedAt: '2026/11/07', updatedBy: TEAM.張詠晴 },
    { name: 'Android', updatedAt: '2026/11/05', updatedBy: TEAM.王俊傑 },
  ],
  ios: [
    { name: 'Podfile', updatedAt: '2026/11/07', updatedBy: TEAM.張詠晴 },
    { name: 'Podfile.lock', updatedAt: '2026/11/07', updatedBy: TEAM.張詠晴 },
    { name: 'Info.plist', updatedAt: '2026/10/22', updatedBy: TEAM.王俊傑 },
  ],
  android: [
    { name: 'build.gradle', updatedAt: '2026/11/05', updatedBy: TEAM.王俊傑 },
    { name: 'gradle.properties', updatedAt: '2026/11/04', updatedBy: TEAM.王俊傑 },
    { name: 'proguard-rules.pro', updatedAt: '2026/10/24', updatedBy: TEAM.王俊傑 },
  ],
  docs: [
    { name: '上線檢查清單.md', updatedAt: '2026/11/04', updatedBy: TEAM.張詠晴 },
    { name: '付款流程說明.md', updatedAt: '2026/10/28', updatedBy: TEAM.林雅婷 },
  ],
  design: [
    { name: '色彩 token.fig', updatedAt: '2026/11/02', updatedBy: TEAM.林雅婷 },
    { name: '元件清單.fig', updatedAt: '2026/10/25', updatedBy: TEAM.林雅婷 },
  ],
  infra: [
    { name: 'terraform', updatedAt: '2026/11/01', updatedBy: TEAM.王俊傑 },
    { name: 'k8s', updatedAt: '2026/10/29', updatedBy: TEAM.王俊傑 },
  ],
  analytics: [
    { name: '每週營收.sql', updatedAt: '2026/11/03', updatedBy: TEAM.張詠晴 },
    { name: '轉換漏斗.sql', updatedAt: '2026/10/31', updatedBy: TEAM.張詠晴 },
  ],
}

/**
 * 主區只有一張表格:直接接在標頭下,不放區段標題 + 說明(app-shell.spec.md「Main 內塞什麼」;user 2026-11-11 留言(逐字)
 * 「此外我覺得其實大部分的情境根本不用在主內容區又放上標題和描述，因為通常的情境是標頭的標題就可以完整表示這個頁面要幹嘛了吧」)。
 * 表格的讀屏名稱用 aria-label(原本的區段標題文字)。間距照 layoutSpace.spec.md「Page 情境」:標頭 → 有框的 DataTable = bounded region
 * = loose(規則 2)、左右 loose(規則 1)、表格 → 底 loose(規則 4 第 2 列)—— 四邊同為 loose。閘 `scripts/header-first-gap-invariant.mjs`。
 * 2026-11-11 前 Dashboard / 專案兩處是 TableSection(區段標題 + 說明 + 表格,頂部 tight);資料夾 / 檔案兩處早就是表格直接接標頭。
 */
function MainTable<T>({ label, columns, data }: { label: string; columns: DataTableProps<T>['columns']; data: T[] }) {
  return (
    <div className="px-[var(--layout-space-loose)] pt-[var(--layout-space-loose)] pb-[var(--layout-space-loose)]">
      <DataTable columns={columns} data={data} height="auto" aria-label={label} />
    </div>
  )
}

/** Dashboard 等主導覽:同範本 DashboardPage 的做法 —— 一張 DataTable,不做 DS 規定的 dashboard 版型。 */
const PendingIssuesView = () => <MainTable label="今日待處理議題" columns={ISSUE_COLUMNS} data={PENDING_ISSUES} />

/** 專案 → 這個專案進行中的議題(標頭標題就是專案名)。 */
const ProjectIssuesView = ({ project }: { project: string }) => (
  <MainTable label="進行中的議題" columns={ISSUE_COLUMNS} data={PROJECT_ISSUES[project] ?? []} />
)

/**
 * 選到檔案 → 這個檔案的版本紀錄(DataTable:版本 / 說明 / 修改者 / 時間;GitHub 的檔案 History、Google Drive 的版本紀錄同類 ——【AI 推導】)。
 * 2026-11-10 前是 `max-w-2xl` 包一份 DescriptionList(位置 / 最後修改 / 修改者);那個寬度沿用自改版前「Sprint 42」摘要,
 * description-list.spec.md、layoutSpace.spec.md 都沒有依據。user 2026-11-10 PR #172 留言(逐字):
 * 「為何 description list 沒有撐滿容器寬度？設計原則是？而且我不想要提供主內容是 description list的範例，太浪費空間了」;
 * 同日補充(逐字):「我的意思是不想要看到description list類型的主內容，我建議改成table之類的」。
 * 版面同資料夾 → 檔案清單(layoutSpace「Page 情境」:表格直接接在標頭下,撐滿主區、只扣頁面左右 loose)。日期寫死(story-determinism-invariant)。
 */
type FileVersionRow = { version: string; note: string; author: PersonData; at: string }
const FILE_VERSION_COLUMNS: DataTableProps<FileVersionRow>['columns'] = [
  { accessorKey: 'version', header: '版本', meta: { type: 'string', width: 120 } },
  { accessorKey: 'note', header: '說明', meta: { type: 'string', width: 360 } },
  { accessorKey: 'author', header: '修改者', meta: { type: 'person', width: 180 } },
  { accessorKey: 'at', header: '時間', meta: { type: 'date', width: 160 } },
]
// 最新一筆 = 資料夾清單上 README.md 的「最後修改 2026/10/30、張詠晴」(FOLDER_FILES.web)
const FILE_VERSIONS: Record<string, FileVersionRow[]> = {
  readme: [
    { version: '第 12 版', note: '補上發版流程與上線檢查清單的位置', author: TEAM.張詠晴, at: '2026/10/30' },
    { version: '第 11 版', note: '本機開發改用 pnpm 9', author: TEAM.陳柏翰, at: '2026/10/18' },
    { version: '第 10 版', note: '加入測試環境金流金鑰的申請方式', author: TEAM.林雅婷, at: '2026/09/26' },
    { version: '第 9 版', note: '說明結帳流程改版的議題放在哪個專案', author: TEAM.林雅婷, at: '2026/09/12' },
    { version: '第 8 版', note: 'Node.js 版本需求改成 20', author: TEAM.陳柏翰, at: '2026/08/29' },
    { version: '第 7 版', note: '新增前端與 API 的資料夾說明', author: TEAM.王俊傑, at: '2026/08/14' },
  ],
}

/**
 * 專案樹:資料夾 → 檔案清單、檔案 → 這個檔案的版本紀錄(兩者都是 layoutSpace「Page 情境」:表格直接接在標頭下,同 MainTable)。
 * 頂部依 layoutSpace.spec.md 規則 2「標頭 → bounded region = loose」:標頭下第一個東西是有框的 DataTable(bounded region),
 * 所以 pt = loose(md 16 / lg 24),四邊同為 loose。
 * 閘 `scripts/header-first-gap-invariant.mjs`(2026-11-10 前兩處誤寫 tight —— 抄當時的 TableSection(第一個是區段標題 = element = tight)沒依第一個東西的角色重推規則 2)。
 */
function ProjectTreeView({ id }: { id: string }) {
  const node = PROJECTS_TREE.flatMap((p) => [p, ...(p.children ?? [])]).find((n) => n.id === id)
  if (!node) return null
  if (node.icon === Folder) return <MainTable label={`${node.label} 裡的檔案`} columns={FILE_COLUMNS} data={FOLDER_FILES[id] ?? []} />
  // 樹上唯一的檔案是 README.md(iOS / Android 是 Mobile App 底下的平台資料夾,見 PROJECTS_TREE)
  return <MainTable label={`${node.label} 的版本紀錄`} columns={FILE_VERSION_COLUMNS} data={FILE_VERSIONS[id] ?? []} />
}

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

        <PageContent title={MAIN_NAV.find((n) => n.id === activeId)?.label ?? 'Dashboard'}>
          <PendingIssuesView />
        </PageContent>
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
    const currentProject = projects.find((p) => p.id === activeId)
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
        <PageContent title={projects.find((p) => p.id === activeId)?.label ?? MAIN_NAV.find((n) => n.id === activeId)?.label ?? 'Dashboard'}>
          {currentProject ? <ProjectIssuesView project={currentProject.label} /> : <PendingIssuesView />}
        </PageContent>
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
  // iOS / Android = 兩個平台的資料夾(真實 repo 的 mobile/ios、mobile/android;2026-11-10 前畫成程式碼檔圖示、點了顯示屬性清單)
  { id: 'mobile', label: 'Mobile App', icon: Folder, children: [
    { id: 'ios', label: 'iOS', icon: Folder },
    { id: 'android', label: 'Android', icon: Folder },
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
    const currentFavorite = favorites.find((x) => x.id === activeId)

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

        <PageContent title={MAIN_NAV.find((n) => n.id === activeId)?.label ?? treeLabel(activeId) ?? favorites.find((x) => x.id === activeId)?.label ?? ''}>
          {isInMainNav ? <PendingIssuesView />
            : currentFavorite ? <ProjectIssuesView project={currentFavorite.label} />
            : <ProjectTreeView id={activeId} />}
        </PageContent>
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

        <PageContent title={MAIN_NAV.find((n) => n.id === activeId)?.label ?? 'Dashboard'}>
          <PendingIssuesView />
        </PageContent>
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

        <PageContent title={[...NAV_ITEMS, ...INTEGRATIONS].find((n) => n.id === activeId)?.label ?? 'Home'}>
          <PendingIssuesView />
        </PageContent>
      </SidebarProvider>
    )
  },
}

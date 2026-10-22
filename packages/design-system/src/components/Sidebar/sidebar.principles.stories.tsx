// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @principles-rationale: 使用指引固定三段(何時用 / 何時不用 / 和相近元件怎麼選,2026-10-20 T4);
// ContentTypeChoice(SidebarMenu vs TreeView 是元件內部的選擇,不屬「和相近元件怎麼選」)/
// GroupHeaderRules / SettingsScenario / IconModeRules / ActiveState 全保留。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  LayoutDashboard, Inbox, Users, Settings, Bell, Folder, FileText, FileCode,
} from 'lucide-react'
import {
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from './sidebar'
import { TreeView, TreeItem } from '@/design-system/components/TreeView/tree-view'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/Sidebar/設計原則',
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj

// ── Shared UI ─────────────────────────────────────────────────────────────

// 規則外框(標題 / 說明 / 規則之間的間距)= 共用教學頁元件;Do / Don't 一律是一則規則,✅ / ❌ 寫在規則標題
// (2026-10-20 T5:原本本頁自畫圓形 ✓ / ✕ 標記 + 小標的 DoDont 框與 Desc 說明元件,是第二套教學框)
const TutorialRule = createTutorialRule()

/** Mini sidebar demo (no full provider/layout) — 用 absolute inset 把 sidebar 塞在一個固定 demo box 內 */
const MiniSidebar = ({
  children,
  width = 260,
  activeId,
}: {
  children: React.ReactNode
  width?: number
  activeId?: string
}) => (
  <div
    className="relative border border-divider rounded-lg overflow-hidden bg-surface"
    style={{ width }}
  >
    <SidebarProvider defaultActiveId={activeId} style={{ minHeight: 'auto' }}>
      <div className="flex flex-col w-full">{children}</div>
    </SidebarProvider>
  </div>
)

const MAIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

const renderMainNav = (_activeId?: string) => (
  <SidebarMenu>
    {MAIN_NAV.map((item) => (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton id={item.id} startIcon={item.icon}>
          {item.label}
        </SidebarMenuButton>
      </SidebarMenuItem>
    ))}
  </SidebarMenu>
)

// ═══════════════════════════════════════════════════════════════════════════

// ── UsageGuidance — 何時用 / 何時不用 / 和相近元件怎麼選

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>產品主結構的垂直、常駐導覽:左側列出主要區域,在頁面之間切換時導覽一直在。</p>
        <TutorialList>
          <li>
            <StoryLink kind="Design System/Components/Sidebar/展示" name="完整佈局">Linear 式議題追蹤主導覽(完整佈局)</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/Sidebar/展示" name="混合內容">專案導覽混排群組、徽章與操作(混合內容)</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/Sidebar/展示" name="抽屜收合（離畫面外）">側欄整條滑出畫面外的內容優先工作區（抽屜收合）</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/Sidebar/展示" name="混合前綴">icon 導覽與 GitHub / Slack / Figma 整合並列對齊（混合前綴）</StoryLink>
          </li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialList>
          <li><strong>頁面頂部的水平導覽</strong> → 自訂頂部導覽。Netflix 的頂部導覽用自訂組件</li>
          <li><strong>同一層內容切換</strong> → Tabs。Slack 的頻道內容切換用 Tabs,不用 Sidebar</li>
          <li><strong>暫時性的側面板</strong> → Sheet。Notion 的篩選面板用 Sheet</li>
          <li><strong>跨頁搜尋 / 快速跳轉</strong> → 指令面板(Command)。Figma 的快速搜尋用 Command</li>
          <li><strong>不到 3 項的導覽</strong> → 頂部分頁列。Sidebar 對小型產品視覺成本過高</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>Tabs</strong> —— 同一頁裡切換平行內容;Sidebar 是跨頁面的常駐導覽</li>
          <li><strong>TreeView</strong> —— 使用者自建、可巢狀的資料(專案、資料夾),可以放進 Sidebar 的群組裡;怎麼選見「<StoryLink kind="Design System/Components/Sidebar/設計原則" name="SidebarMenu vs TreeView 的選擇">SidebarMenu vs TreeView 的選擇</StoryLink>」</li>
          <li><strong>AppShell</strong> —— 整頁的組合(側欄 + 主區 + 右側面板);Sidebar 是放進 AppShell 的導覽本身</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

export const ContentTypeChoice: Story = {
  name: 'SidebarMenu vs TreeView 的選擇',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="判斷規則"
        note={
          <>
            <strong>SidebarMenu</strong> 只接受「<strong>1 層 + designer 能在設計時列舉所有項目</strong>」。
            任何不符合的情況——深度 &gt; 1、數量不可列舉、使用者可 runtime 新增——一律用 <strong>TreeView</strong>。
          </>
        }
      />

      <TutorialRule
        title="✅ 設計好的 app 主導覽 → SidebarMenu"
        note="Dashboard / Inbox / Team / Settings——designer 定義好的固定項目,永遠是這 5 個,用 SidebarMenu。"
      >
        <MiniSidebar activeId="dashboard">
          <SidebarHeader>
            {/* Chrome header canonical:raw <Avatar size={24}> per header-canonical.spec.md:57-72 + text-body-lg per chrome typography */}
            {/* @layout-space-magic-ok: 頭像 ↔ 名稱(layoutSpace.spec.md:166 micro) */}
            <div className="flex items-center gap-2">
              <Avatar size={24} shape="square" color="blue" solid alt="Acme" />
              <span className="text-body-lg font-medium">Acme Inc</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>{renderMainNav()}</SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </MiniSidebar>
      </TutorialRule>

      <TutorialRule
        title="✅ 使用者自建資料 → TreeView"
        note="使用者自建的 projects——數量未知、可能有巢狀資料夾,用 TreeView。即使今天只有 3 個,未來會長。"
      >
        <MiniSidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Projects</SidebarGroupLabel>
              <SidebarGroupContent>
                <TreeView aria-label="Projects" defaultExpandedIds={['web']}>
                  <TreeItem id="web" icon={Folder} label="Web App">
                    <TreeItem id="fe" icon={Folder} label="frontend" />
                    <TreeItem id="be" icon={Folder} label="backend" />
                  </TreeItem>
                  <TreeItem id="mobile" icon={Folder} label="Mobile App" />
                  <TreeItem id="docs" icon={FileText} label="Docs" />
                </TreeView>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </MiniSidebar>
      </TutorialRule>

      <TutorialRule
        title="❌ 不要把使用者資料塞進 SidebarMenu"
        note="如果使用者可以自己新增 project,一律當使用者資料處理用 TreeView。強塞 SidebarMenu 會在數量膨脹時爆版。"
      />

      <TutorialRule
        title="混用:SidebarMenu + TreeView"
        note="Gmail / Linear 的標準版型——上方扁平主導覽(SidebarMenu),下方使用者資料(TreeView)。群組間自動分隔線(由 SidebarGroup 的 ::before 處理,不用手動放 separator)。"
      >
        <MiniSidebar activeId="inbox">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>{renderMainNav()}</SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Projects</SidebarGroupLabel>
              <SidebarGroupContent>
                <TreeView aria-label="Projects" defaultExpandedIds={['web']}>
                  <TreeItem id="web" icon={Folder} label="Web App">
                    <TreeItem id="fe" icon={Folder} label="frontend" />
                    <TreeItem id="be" icon={FileCode} label="backend" />
                  </TreeItem>
                  <TreeItem id="mobile" icon={Folder} label="Mobile App" />
                </TreeView>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </MiniSidebar>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ═══════════════════════════════════════════════════════════════════════════

export const GroupHeaderRules: Story = {
  name: '群組 / 標籤使用原則',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Label 必須在 group 內,且共用 item-layout row height"
        note={
          <>
            SidebarGroupLabel 和 SidebarMenuButton 用<strong>完全相同的 py 公式</strong>(<code>py-[calc((field-height-md-1lh)/2)]</code>),
            差別只在 font-muted + pointer-events-none。Label 和 first item 以自然的 item-layout 間距相鄰,<strong>沒有額外 gap</strong>。
          </>
        }
      />

      <TutorialRule title="✅ Label 和 items 緊貼,無額外 gap">
        <MiniSidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Projects</SidebarGroupLabel>
              <SidebarGroupContent>{renderMainNav()}</SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </MiniSidebar>
      </TutorialRule>

      <TutorialRule
        title="❌ 別用 margin / padding 製造多餘空隙"
        note={
          <>
            不要在 SidebarGroupContent 或 SidebarMenu 加 <code>mt-2</code> 等 margin,也不要在 SidebarGroup 加多餘 padding。
            Group 已有 <code>py-2</code>、label 和 items 共用 item-layout row——這就是設計好的節奏,別破壞。
          </>
        }
      />

      <TutorialRule
        title="群組之間的分隔線:由 SidebarGroup 自動處理"
        note={
          <>
            相鄰的 SidebarGroup 會透過 <code>::before</code> pseudo-element
            自動產生 loose token 內縮的分隔線。Consumer 不需要手動放 SidebarSeparator。
          </>
        }
      />

      <TutorialRule title="✅ 直接放兩個 SidebarGroup——分隔線自動出現">
        <MiniSidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>{renderMainNav()}</SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Projects</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton id="web-app" startIcon={Folder}>Web App</SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton id="mobile-app" startIcon={Folder}>Mobile App</SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </MiniSidebar>
      </TutorialRule>

      <TutorialRule
        title="❌ 別手動放 SidebarSeparator 在群組之間"
        note="手動放會導致雙重分隔線(group 自動 + 手動)。Group 之間的分隔是 group 自己的責任。SidebarSeparator 只用於結構邊界(例如 header ↔ content,但那個已由 SidebarHeader 的 border-b 處理)。"
      />
    </TutorialPage>
  ),
}

// ═══════════════════════════════════════════════════════════════════════════

export const SettingsScenario: Story = {
  name: '設定類有子頁的頁面',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="三條正確路徑,全部不用 SidebarMenuSub"
        note="Settings > General/Profile/Billing 是最常見的嘗試塞 2 層的誘惑。本 design system 不支援 SidebarMenuSub——強制 consumer 走以下三條路徑之一。"
      />

      <TutorialRule
        title="A. 頁內第二層導覽(推薦,最世界級)"
        note={
          <>
            Sidebar 只放一顆 Settings,點進去後在 Settings 頁面內部用 Tabs / 左側 rail 呈現子頁。
            代表:Linear、Notion、GitHub。<strong>子頁屬於 Settings 頁面的內部狀態,不佔 sidebar 位置。</strong>
          </>
        }
      />

      <TutorialRule
        title="B. SidebarGroup 扁平化"
        note="若子頁等重要且需一鍵直達,用 SidebarGroupLabel 當純視覺分段標題,子項全部是獨立頂層 SidebarMenuItem。少見,只在子項確實高頻使用時才用。"
      >
        {/* 導覽項必帶穩定 id(sidebar.spec.md「禁止:SidebarMenuButton 不傳 id」)—
            id 進 SidebarProvider 單一 activeId selection 模型,漏 id = 啞 item 無法 active。 */}
        <MiniSidebar activeId="settings-general">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem><SidebarMenuButton id="inbox" startIcon={Inbox}>Inbox</SidebarMenuButton></SidebarMenuItem>
                  <SidebarMenuItem><SidebarMenuButton id="projects" startIcon={Folder}>Projects</SidebarMenuButton></SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Settings</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem><SidebarMenuButton id="settings-general" startIcon={Settings}>General</SidebarMenuButton></SidebarMenuItem>
                  <SidebarMenuItem><SidebarMenuButton id="settings-team" startIcon={Users}>Team</SidebarMenuButton></SidebarMenuItem>
                  <SidebarMenuItem><SidebarMenuButton id="settings-billing" startIcon={FileText}>Billing</SidebarMenuButton></SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </MiniSidebar>
      </TutorialRule>

      <TutorialRule
        title="C. 使用者選單開設定"
        note={
          <>
            Settings 不在 sidebar,從 footer 的 user menu / avatar dropdown 觸發 modal 或快捷鍵(<code>Cmd+,</code>)。
            適合低頻操作。代表:Linear、Slack、Discord。
          </>
        }
      />

      <TutorialRule
        title="❌ 不要用 SidebarMenuSub 做巢狀 menu"
        note="本 design system 完全不 export SidebarMenuSub / SidebarMenuSubItem。需要「父項 + 多個子項」結構 → 用 A(頁內導覽)或 TreeView。"
      />
    </TutorialPage>
  ),
}

// ═══════════════════════════════════════════════════════════════════════════

export const IconModeRules: Story = {
  name: '圖示模式的 4 條鐵律',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="規則 1:icon rail 上的每顆 icon 必須可導覽"
        note="絕對不可有「點了沒反應」或「點了只是展開選單」的 icon。icon 列是收合狀態下唯一的導覽介面。"
      />

      <TutorialRule
        title="規則 2:純分組 header 不可用 SidebarMenuItem"
        note={
          <>
            只是用來分組下方 children 的項目(沒有自己的頁面),<strong>必須用 SidebarGroup + SidebarGroupLabel</strong>。
            SidebarGroupLabel 在 icon 模式自動隱藏(display:none),子 items 照常顯示;SidebarMenuItem 則會變成死 icon。
          </>
        }
      />

      <TutorialRule
        title="規則 3:TreeView 在 icon 模式整個隱藏"
        note="不做 icon 化、不做 flyout、不做 popover。Tree 無法壓縮成單排 icon,Gmail / Linear / Notion 一致採「隱藏」策略。"
      />

      <TutorialRule
        title="規則 4:重新看階層資料的唯一路徑 = 展開 sidebar"
        note={
          <>
            Sidebar 收合時若使用者想瀏覽隱藏的 tree,<strong>唯一方法是重新展開 sidebar</strong>(點 Trigger 或按 ⌘B)。
            不提供「點 icon 順便展開」的隱式副作用——那會讓 icon rail 的行為不可預測。
            逃生艙由應用層搭配 Command Palette(⌘K)提供,不是 Sidebar 的責任。
          </>
        }
      />

      <TutorialRule
        title="❌ 反模式:Hover 浮出 cascading menu"
        note={
          <>
            不要讓 icon hover 秀出完整的子項 flyout / popover menu——這是 2000 年代 cascading menu 的反模式,
            對 touch / 鍵盤 / accessibility 都失敗。NN/g 多年警告。
          </>
        }
      />
    </TutorialPage>
  ),
}

// ═══════════════════════════════════════════════════════════════════════════

export const ActiveState: Story = {
  name: '啟用狀態跨群組單一',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="整個 sidebar 同時只有一個 active item"
        note={
          <>
            跨 SidebarMenu 和 TreeView 都是。選中 tree node 時 menu 的 active 要取消,反之亦然。
            Consumer 用單一 <code>activeId</code> state 管理,不要各自維護。
          </>
        }
      />

      <TutorialRule
        title="✅ 單一 activeId,跨群組互斥"
        note={<>使用 <code>React.useState&lt;string&gt;()</code> 管理當前 active id,SidebarMenuButton 和 TreeView 都讀這個 state。</>}
      />

      <TutorialRule
        title="Active 視覺:bg-neutral-selected,字重不變"
        note={
          <>
            Selected 只變 background(<code>bg-neutral-selected</code>)和文字色(<code>fg-secondary</code> → <code>foreground</code>),
            <strong>字重維持 font-medium(500)</strong>——不加重以避免選中時文字突然跳動。
          </>
        }
      />
    </TutorialPage>
  ),
}



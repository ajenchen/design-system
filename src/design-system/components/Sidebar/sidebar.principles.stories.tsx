// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @principles-rationale: Merged WhenToUse + WhenNotToUse into a single
// `UsageGuidance` story (3 sections — 何時用 / 何時不用 + 替代 / vs 近親) per 2026-04-26
// user mandate. Sidebar has no formal Vs*Rule(ContentTypeChoice 為 internal taxonomy
// SidebarMenu vs TreeView,屬 component-specific principle 不歸 vs 近親);ContentTypeChoice /
// GroupHeaderRules / SettingsScenario / IconModeRules / ActiveState 全保留。
import * as React from 'react'
import LinkTo from '@storybook/addon-links/react'
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
import { ItemAvatar } from '@/design-system/patterns/element-anatomy/item-anatomy'

const meta: Meta = {
  title: 'Design System/Components/Sidebar/設計原則',
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj

// ── Shared UI ─────────────────────────────────────────────────────────────

const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-h6 font-semibold text-foreground">{children}</h3>
)
const Desc = ({ children }: { children: React.ReactNode }) => (
  <p className="text-caption text-fg-secondary max-w-[720px]">{children}</p>
)
const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-footnote font-medium text-fg-muted">{children}</span>
)

const Section = ({
  title,
  description,
  children,
}: {
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
}) => (
  <section className="flex flex-col gap-4 pb-10 border-b border-divider last:border-b-0">
    <div className="flex flex-col gap-1">
      <H3>{title}</H3>
      {description && <Desc>{description}</Desc>}
    </div>
    {children}
  </section>
)

const DoDont = ({
  type,
  title,
  children,
}: {
  type: 'do' | 'dont'
  title: string
  children: React.ReactNode
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold ${
          type === 'do'
            ? 'bg-success-subtle text-success-text'
            : 'bg-error-subtle text-error-text'
        }`}
      >
        {type === 'do' ? '✓' : '✕'}
      </span>
      <Label>{title}</Label>
    </div>
    {children}
  </div>
)

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

// ── WhenToUse — 何時使用 Sidebar ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Sidebar 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Sidebar/展示" name="完整佈局"><span className="text-primary hover:underline font-medium cursor-pointer">完整佈局</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Sidebar/展示" name="混合內容"><span className="text-primary hover:underline font-medium cursor-pointer">混合內容</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Sidebar/展示" name="Offcanvas 收合"><span className="text-primary hover:underline font-medium cursor-pointer">Offcanvas 收合</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Sidebar/展示" name="Mixed prefix"><span className="text-primary hover:underline font-medium cursor-pointer">Mixed prefix</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* 何時不用 / 替代元件 — 原 WhenNotToUse */}
      <div className="prose prose-sm max-w-prose space-y-4">
      <p>Sidebar 是垂直持久導覽,以下情境改用其他元件:</p>
      <ul className="list-disc list-inside space-y-1 text-fg-secondary">
        <li><strong>頁面頂部水平導覽</strong> → 自訂 Nav / NavigationMenu。Netflix 的頂部導覽用自訂組件</li>
        <li><strong>同層內容切換</strong> → Tabs。Slack 的 channel 內容切換用 Tabs，不用 Sidebar</li>
        <li><strong>暫時性側面板</strong> → Sheet / Drawer。Notion 的 filter panel 用 Sheet</li>
        <li><strong>跨頁搜尋 / 快速跳轉</strong> → Command palette。Figma 的快速搜尋用 Command</li>
        <li><strong>少於 3 項導覽</strong> → 頂部 tab bar。Sidebar 視覺成本對小 app 過高</li>
      </ul>
    </div>
    </div>
  ),
}

export const ContentTypeChoice: Story = {
  name: 'SidebarMenu vs TreeView 的選擇',
  render: () => (
    <div className="flex flex-col gap-10">
      <Section
        title="判斷規則"
        description={
          <>
            <strong>SidebarMenu</strong> 只接受「<strong>1 層 + designer 能在設計時列舉所有項目</strong>」。
            任何不符合的情況——深度 &gt; 1、數量不可列舉、使用者可 runtime 新增——一律用 <strong>TreeView</strong>。
          </>
        }
      >
        <div className="flex gap-6 items-start flex-wrap">
          <DoDont type="do" title="設計好的 app 主導覽 → SidebarMenu">
            <MiniSidebar activeId="dashboard">
              <SidebarHeader>
                <div className="flex items-center gap-2">
                  <ItemAvatar alt="Acme" shape="square" color="blue" solid />
                  <span className="text-body font-medium">Acme Inc</span>
                </div>
              </SidebarHeader>
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupContent>{renderMainNav()}</SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </MiniSidebar>
            <Desc>
              Dashboard / Inbox / Team / Settings——designer 定義好的固定項目,永遠是這 5 個,用 SidebarMenu。
            </Desc>
          </DoDont>

          <DoDont type="do" title="使用者自建資料 → TreeView">
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
            <Desc>
              使用者自建的 projects——數量未知、可能有巢狀資料夾,用 TreeView。即使今天只有 3 個,未來會長。
            </Desc>
          </DoDont>
        </div>

        <DoDont type="dont" title="不要把 user data 塞 SidebarMenu">
          <Desc>
            如果使用者可以自己新增 project,一律當 user data 處理用 TreeView。強塞 SidebarMenu 會在數量膨脹時爆版。
          </Desc>
        </DoDont>
      </Section>

      <Section
        title="混用:SidebarMenu + TreeView"
        description="Gmail / Linear 的標準版型——上方扁平主導覽(SidebarMenu),下方使用者資料(TreeView)。群組間自動分隔線(由 SidebarGroup 的 ::before 處理,不用手動放 separator)。"
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
      </Section>
    </div>
  ),
}

// ═══════════════════════════════════════════════════════════════════════════

export const GroupHeaderRules: Story = {
  name: '群組 / Label 使用原則',
  render: () => (
    <div className="flex flex-col gap-10">
      <Section
        title="Label 必須在 group 內,且共用 item-layout row height"
        description={
          <>
            SidebarGroupLabel 和 SidebarMenuButton 用<strong>完全相同的 py 公式</strong>(`py-[calc((field-height-md-1lh)/2)]`),
            差別只在 font-muted + pointer-events-none。Label 和 first item 以自然的 item-layout 間距相鄰,<strong>沒有額外 gap</strong>。
          </>
        }
      >
        <div className="flex gap-6 items-start flex-wrap">
          <DoDont type="do" title="Label 和 items 緊貼,無額外 gap">
            <MiniSidebar>
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupLabel>Projects</SidebarGroupLabel>
                  <SidebarGroupContent>{renderMainNav()}</SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </MiniSidebar>
          </DoDont>

          <DoDont type="dont" title="別用 margin / padding 製造多餘空隙">
            <Desc>
              不要在 SidebarGroupContent 或 SidebarMenu 加 `mt-2` 等 margin,也不要在 SidebarGroup 加多餘 padding。
              Group 已有 `py-2`、label 和 items 共用 item-layout row——這就是設計好的節奏,別破壞。
            </Desc>
          </DoDont>
        </div>
      </Section>

      <Section
        title="群組之間的分隔線:由 SidebarGroup 自動處理"
        description={
          <>
            相鄰的 SidebarGroup 會透過 <code className="text-caption bg-neutral-hover px-1 rounded">::before</code> pseudo-element
            自動產生**loose token 內縮的分隔線**。Consumer 不需要手動放 SidebarSeparator。
          </>
        }
      >
        <div className="flex gap-6 items-start flex-wrap">
          <DoDont type="do" title="直接放兩個 SidebarGroup——分隔線自動出現">
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
                        <SidebarMenuButton startIcon={Folder}>Project A</SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton startIcon={Folder}>Project B</SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </MiniSidebar>
          </DoDont>

          <DoDont type="dont" title="別手動放 SidebarSeparator 在群組之間">
            <Desc>
              手動放會導致雙重分隔線(group 自動 + 手動)。Group 之間的分隔是 group 自己的責任。
              SidebarSeparator 只用於**結構邊界**(例如 header ↔ content,但那個已由 SidebarHeader 的 border-b 處理)。
            </Desc>
          </DoDont>
        </div>
      </Section>
    </div>
  ),
}

// ═══════════════════════════════════════════════════════════════════════════

export const SettingsScenario: Story = {
  name: 'Settings 類有子頁的頁面',
  render: () => (
    <div className="flex flex-col gap-10">
      <Section
        title="三條正確路徑,全部不用 SidebarMenuSub"
        description="Settings > General/Profile/Billing 是最常見的嘗試塞 2 層的誘惑。本 design system 不支援 SidebarMenuSub——強制 consumer 走以下三條路徑之一。"
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label>A. In-page secondary nav(推薦,最世界級)</Label>
            <Desc>
              Sidebar 只放一顆 `Settings`,點進去後在 Settings 頁面內部用 Tabs / 左側 rail 呈現子頁。
              代表:Linear、Notion、GitHub。<strong>子頁屬於 Settings 頁面的內部狀態,不佔 sidebar 位置。</strong>
            </Desc>
          </div>

          <div className="flex flex-col gap-2">
            <Label>B. SidebarGroup 扁平化</Label>
            <Desc>
              若子頁等重要且需一鍵直達,用 SidebarGroupLabel 當純視覺分段標題,子項全部是獨立頂層 SidebarMenuItem。
              少見,只在子項確實高頻使用時才用。
            </Desc>
            <MiniSidebar>
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem><SidebarMenuButton startIcon={Inbox}>Inbox</SidebarMenuButton></SidebarMenuItem>
                      <SidebarMenuItem><SidebarMenuButton startIcon={Folder}>Projects</SidebarMenuButton></SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
                <SidebarGroup>
                  <SidebarGroupLabel>Settings</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem><SidebarMenuButton startIcon={Settings}>General</SidebarMenuButton></SidebarMenuItem>
                      <SidebarMenuItem><SidebarMenuButton startIcon={Users}>Team</SidebarMenuButton></SidebarMenuItem>
                      <SidebarMenuItem><SidebarMenuButton startIcon={FileText}>Billing</SidebarMenuButton></SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </MiniSidebar>
          </div>

          <div className="flex flex-col gap-2">
            <Label>C. User menu modal</Label>
            <Desc>
              Settings 不在 sidebar,從 footer 的 user menu / avatar dropdown 觸發 modal 或快捷鍵(`Cmd+,`)。
              適合低頻操作。代表:Linear、Slack、Discord。
            </Desc>
          </div>
        </div>

        <DoDont type="dont" title="不要用 SidebarMenuSub 做巢狀 menu">
          <Desc>
            本 design system 完全不 export SidebarMenuSub / SidebarMenuSubItem。
            需要「父項 + 多個子項」結構 → 用 path A(in-page nav)或 TreeView。
          </Desc>
        </DoDont>
      </Section>
    </div>
  ),
}

// ═══════════════════════════════════════════════════════════════════════════

export const IconModeRules: Story = {
  name: 'Icon 模式的 4 條鐵律',
  render: () => (
    <div className="flex flex-col gap-10">
      <Section
        title="規則 1:icon rail 上的每顆 icon 必須可導覽"
        description="絕對不可有「點了沒反應」或「點了只是展開選單」的 icon。icon 列是收合狀態下唯一的導覽介面。"
      />

      <Section
        title="規則 2:純分組 header 不可用 SidebarMenuItem"
        description={
          <>
            只是用來分組下方 children 的項目(沒有自己的頁面),<strong>必須用 SidebarGroup + SidebarGroupLabel</strong>。
            SidebarGroupLabel 在 icon 模式自動隱藏(display:none),子 items 照常顯示;SidebarMenuItem 則會變成死 icon。
          </>
        }
      />

      <Section
        title="規則 3:TreeView 在 icon 模式整個隱藏"
        description="不做 icon 化、不做 flyout、不做 popover。Tree 無法壓縮成單排 icon,Gmail / Linear / Notion 一致採「隱藏」策略。"
      />

      <Section
        title="規則 4:重新看階層資料的唯一路徑 = 展開 sidebar"
        description={
          <>
            Sidebar 收合時若使用者想瀏覽隱藏的 tree,<strong>唯一方法是重新展開 sidebar</strong>(點 Trigger 或按 ⌘B)。
            不提供「點 icon 順便展開」的隱式副作用——那會讓 icon rail 的行為不可預測。
            逃生艙由應用層搭配 Command Palette(⌘K)提供,不是 Sidebar 的責任。
          </>
        }
      />

      <Section
        title="❌ 反模式:Hover 浮出 cascading menu"
        description={
          <>
            不要讓 icon hover 秀出完整的子項 flyout / popover menu——這是 2000 年代 cascading menu 的反模式,
            對 touch / 鍵盤 / accessibility 都失敗。NN/g 多年警告。
          </>
        }
      />
    </div>
  ),
}

// ═══════════════════════════════════════════════════════════════════════════

export const ActiveState: Story = {
  name: 'Active state 跨群組單一',
  render: () => (
    <div className="flex flex-col gap-10">
      <Section
        title="整個 sidebar 同時只有一個 active item"
        description={
          <>
            跨 SidebarMenu 和 TreeView 都是。選中 tree node 時 menu 的 active 要取消,反之亦然。
            Consumer 用單一 `activeId` state 管理,不要各自維護。
          </>
        }
      >
        <DoDont type="do" title="單一 activeId,跨群組互斥">
          <Desc>
            使用 `React.useState&lt;string&gt;()` 管理當前 active id,SidebarMenuButton 和 TreeView 都讀這個 state。
          </Desc>
        </DoDont>
      </Section>

      <Section
        title="Active 視覺:bg-neutral-selected,字重不變"
        description={
          <>
            Selected 只變 background(`bg-neutral-selected`)和文字色(`fg-secondary` → `foreground`),
            <strong>字重維持 font-medium(500)</strong>——不加重以避免選中時文字突然跳動。
          </>
        }
      />
    </div>
  ),
}



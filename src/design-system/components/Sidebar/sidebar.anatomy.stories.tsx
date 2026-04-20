import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { LayoutDashboard, Inbox, Users, Settings, Bell } from 'lucide-react'
import {
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from './sidebar'
import { ItemAvatar } from '@/design-system/patterns/element-anatomy/item-anatomy'

const meta: Meta = {
  title: 'Design System/Components/Sidebar/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj

// ── Shared UI ─────────────────────────────────────────────────────────────
// NOTE: Kept local (not imported from `_anatomy/anatomy-utils`) because the
// Button-family inspector layout diverges visually (H3 `text-h6 font-semibold`,
// no Desc bottom margin, Th/Td `p-2 border-b divider`) and this file's Swatch
// signature differs (no `size` prop, includes `mr-1.5`) — used inline in
// token-chip displays throughout this anatomy.

const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-h6 font-semibold text-foreground">{children}</h3>
)
const Desc = ({ children }: { children: React.ReactNode }) => (
  <p className="text-caption text-fg-muted max-w-[720px]">{children}</p>
)
const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-footnote font-medium text-fg-muted">{children}</span>
)
const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left p-2 border-b border-divider text-fg-muted font-medium text-caption whitespace-nowrap">{children}</th>
)
const Td = ({ children, mono }: { children: React.ReactNode; mono?: boolean }) => (
  <td className={`p-2 border-b border-divider align-top text-caption ${mono ? 'font-mono' : ''}`}>{children}</td>
)

const TkVal = ({ token, value }: { token: string; value?: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="font-mono text-[12px] text-fg-secondary">{token}</span>
    {value && <span className="font-mono text-[10px] text-fg-muted">{value}</span>}
  </div>
)

const Swatch = ({ value }: { value: string }) => (
  <span
    className="inline-block w-3 h-3 rounded-md shrink-0 border border-black/10 align-middle mr-1.5"
    style={{ backgroundColor: `var(${value})` }}
  />
)

/** 縮小的 demo sidebar preview (inside padded story) */
const SidebarPreview = ({
  size = 'md',
  activeId = 'dashboard',
  width = 272,
}: {
  size?: 'sm' | 'md' | 'lg'
  activeId?: string
  width?: number
}) => {
  const MAIN_NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inbox', label: 'Inbox', icon: Inbox },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const

  return (
    <div
      className="relative border border-divider rounded-lg overflow-hidden bg-surface"
      style={{ width }}
    >
      <SidebarProvider size={size} defaultActiveId={activeId} style={{ minHeight: 'auto' }}>
        <div className="flex flex-col w-full">
          <SidebarHeader>
            <div className="flex items-center gap-2 min-w-0">
              <ItemAvatar alt="Acme Inc" shape="square" color="blue" solid />
              <span className="text-body-lg font-medium truncate">Acme Inc</span>
            </div>
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
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <button type="button">
                    <ItemAvatar alt="Alan Chen" color="blue" />
                    <span data-sidebar="menu-label" className="min-w-0 flex-1 truncate">Alan Chen</span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </div>
      </SidebarProvider>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. 元件總覽
// ═══════════════════════════════════════════════════════════════════════════

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <H3>結構（Anatomy）</H3>
        <Desc>
          Sidebar 是三段式結構——SidebarHeader（固定高）、SidebarContent（可捲動）、SidebarFooter（固定高）。
          Content 內放一或多個 SidebarGroup，每個 group 有 py-2 呼吸空間 + 自動內縮分隔線。
          Group 內放 SidebarMenu（扁平 row）或 TreeView（階層 row），兩者共用 item-layout row geometry。
        </Desc>
      </div>

      <div className="flex gap-8 items-start">
        <div className="flex flex-col gap-2">
          <Label>展開狀態</Label>
          <SidebarPreview />
        </div>
        <div className="flex flex-col gap-2 max-w-md">
          <Label>結構樹</Label>
          <pre className="text-caption font-mono text-fg-secondary bg-canvas p-4 rounded-md border border-divider leading-relaxed">{`SidebarProvider
  Sidebar
    SidebarHeader          ← h-[var(--chrome-header-height)]
    SidebarContent         ← flex-1 overflow-auto
      SidebarGroup         ← py-2 + ::before divider
        SidebarGroupLabel  ← item-layout row (header mode)
        SidebarGroupContent
          SidebarMenu        ← flex-col, no gap
            SidebarMenuItem
              SidebarMenuButton  ← item-layout row
    SidebarFooter          ← h-[var(--chrome-header-height)]
  SidebarTrigger           ← 放主內容 header
`}</pre>
        </div>
      </div>

      {/* Primary exports table */}
      <div className="flex flex-col gap-2">
        <H3>Primary exports</H3>
        <table className="min-w-full text-left border-collapse">
          <thead>
            <tr>
              <Th>Component</Th>
              <Th>類別</Th>
              <Th>Size variant?</Th>
              <Th>作用</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td mono>SidebarProvider</Td>
              <Td>Provider</Td>
              <Td mono>size (propagates)</Td>
              <Td>全域 context：open 狀態、size、cookie、Cmd+B</Td>
            </tr>
            <tr>
              <Td mono>Sidebar</Td>
              <Td>Container</Td>
              <Td>—</Td>
              <Td>主容器,collapsible = offcanvas / icon / none</Td>
            </tr>
            <tr>
              <Td mono>SidebarHeader</Td>
              <Td>Chrome slot</Td>
              <Td>—</Td>
              <Td>固定高度槽位(`--chrome-header-height`)</Td>
            </tr>
            <tr>
              <Td mono>SidebarFooter</Td>
              <Td>Chrome slot</Td>
              <Td>—</Td>
              <Td>同 Header</Td>
            </tr>
            <tr>
              <Td mono>SidebarContent</Td>
              <Td>Container</Td>
              <Td>—</Td>
              <Td>捲動容器,無 padding(由 group 處理)</Td>
            </tr>
            <tr>
              <Td mono>SidebarGroup</Td>
              <Td>Container</Td>
              <Td>—</Td>
              <Td>py-2 + [&+&]:::before 自動分隔線</Td>
            </tr>
            <tr>
              <Td mono>SidebarGroupLabel</Td>
              <Td>Row (header)</Td>
              <Td mono>sm / md / lg</Td>
              <Td>群組標題,對齊 MenuItem header</Td>
            </tr>
            <tr>
              <Td mono>SidebarMenuButton</Td>
              <Td>Row (interactive)</Td>
              <Td mono>sm / md / lg</Td>
              <Td>主 menu item,item-layout + hover/active</Td>
            </tr>
            <tr>
              <Td mono>SidebarMenuBadge</Td>
              <Td>Row suffix</Td>
              <Td>—</Td>
              <Td>wrap 專案 `Badge` 元件,絕對定位</Td>
            </tr>
            <tr>
              <Td mono>SidebarMenuSkeleton</Td>
              <Td>Loading</Td>
              <Td mono>sm / md / lg</Td>
              <Td>跟 MenuButton 同 row height 的 loading 狀態</Td>
            </tr>
            <tr>
              <Td mono>SidebarTrigger</Td>
              <Td>Control</Td>
              <Td>—</Td>
              <Td>切換收合的 Button(text + iconOnly)</Td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  ),
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Size 對照
// ═══════════════════════════════════════════════════════════════════════════

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <H3>Row size 變體</H3>
        <Desc>
          SidebarMenuButton 和 SidebarGroupLabel 共用 item-layout 公式,sm/md/lg 三種尺寸跟 TreeView / MenuItem 完全對齊。
          `SidebarProvider` 的 size prop 會自動 propagate 到所有 row 元件,不用每個 button 各自傳。
        </Desc>
      </div>

      <div className="flex gap-6 items-start flex-wrap">
        {(['sm', 'md', 'lg'] as const).map((s) => (
          <div key={s} className="flex flex-col gap-2">
            <Label>size = &quot;{s}&quot;</Label>
            <SidebarPreview size={s} />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <H3>Token 公式</H3>
        <table className="min-w-full text-left border-collapse">
          <thead>
            <tr>
              <Th>Property</Th>
              <Th>sm</Th>
              <Th>md</Th>
              <Th>lg</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>Row height (field-height)</Td>
              <Td mono>--field-height-sm</Td>
              <Td mono>--field-height-md</Td>
              <Td mono>--field-height-lg</Td>
            </tr>
            <tr>
              <Td>Horizontal padding</Td>
              <Td mono>var(--layout-space-loose)</Td>
              <Td mono>var(--layout-space-loose)</Td>
              <Td mono>var(--layout-space-loose)</Td>
            </tr>
            <tr>
              <Td>Vertical padding formula</Td>
              <Td mono>calc((sm-1lh)/2)</Td>
              <Td mono>calc((md-1lh)/2)</Td>
              <Td mono>calc((lg-1lh)/2)</Td>
            </tr>
            <tr>
              <Td>Text</Td>
              <Td mono>text-body (14px)</Td>
              <Td mono>text-body (14px)</Td>
              <Td mono>text-body-lg (16px)</Td>
            </tr>
            <tr>
              <Td>Icon</Td>
              <Td mono>size-4 (16px)</Td>
              <Td mono>size-4 (16px)</Td>
              <Td mono>size-5 (20px)</Td>
            </tr>
            <tr>
              <Td>Font weight</Td>
              <Td mono>font-medium</Td>
              <Td mono>font-medium</Td>
              <Td mono>font-medium</Td>
            </tr>
          </tbody>
        </table>
        <p className="text-caption text-fg-muted">
          Token 的 md / lg density 解析值見 `tokens/uiSize/uiSize.spec.md`。
        </p>
      </div>
    </div>
  ),
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. 色彩 / 狀態對照
// ═══════════════════════════════════════════════════════════════════════════

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <H3>SidebarMenuButton 狀態</H3>
        <Desc>
          跟 TreeItem / MenuItem 共用同一組 semantic token。Default → hover → active → selected 的色彩都一致。
        </Desc>
        <table className="min-w-full text-left border-collapse">
          <thead>
            <tr>
              <Th>State</Th>
              <Th>Background</Th>
              <Th>Foreground (text + icon)</Th>
              <Th>Font weight</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>default</Td>
              <Td><Swatch value="--background" />transparent</Td>
              <Td><Swatch value="--fg-secondary" />text-fg-secondary (neutral-8)</Td>
              <Td mono>500</Td>
            </tr>
            <tr>
              <Td>hover</Td>
              <Td><Swatch value="--neutral-hover" />bg-neutral-hover</Td>
              <Td><Swatch value="--foreground" />text-foreground (neutral-9)</Td>
              <Td mono>500</Td>
            </tr>
            <tr>
              <Td>active (press)</Td>
              <Td><Swatch value="--neutral-active" />bg-neutral-active</Td>
              <Td><Swatch value="--foreground" />text-foreground</Td>
              <Td mono>500</Td>
            </tr>
            <tr>
              <Td>selected (`data-active`)</Td>
              <Td><Swatch value="--neutral-selected" />bg-neutral-selected</Td>
              <Td><Swatch value="--foreground" />text-foreground</Td>
              <Td mono>500 (不加重)</Td>
            </tr>
            <tr>
              <Td>disabled</Td>
              <Td><Swatch value="--background" />transparent</Td>
              <Td><Swatch value="--fg-disabled" />text-fg-disabled</Td>
              <Td mono>500</Td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2">
        <H3>SidebarGroupLabel</H3>
        <table className="min-w-full text-left border-collapse">
          <thead>
            <tr>
              <Th>Property</Th>
              <Th>Value</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>Background</Td>
              <Td>transparent(無 hover / active)</Td>
            </tr>
            <tr>
              <Td>Foreground</Td>
              <Td><Swatch value="--fg-muted" />text-fg-muted</Td>
            </tr>
            <tr>
              <Td>Font weight</Td>
              <Td mono>font-medium (500)</Td>
            </tr>
            <tr>
              <Td>Interactive</Td>
              <Td mono>pointer-events-none</Td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  ),
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. 尺寸 / 寬度 token
// ═══════════════════════════════════════════════════════════════════════════

export const ChromeTokens: Story = {
  name: '寬度與 Chrome Token',
  render: () => (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <H3>Sidebar 寬度 tokens</H3>
        <table className="min-w-full text-left border-collapse">
          <thead>
            <tr>
              <Th>Token</Th>
              <Th>預設值</Th>
              <Th>用途</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td><TkVal token="--sidebar-width" value="17rem (272px)" /></Td>
              <Td mono>17rem</Td>
              <Td>展開寬度</Td>
            </tr>
            <tr>
              <Td><TkVal token="--sidebar-width-min" value="240px" /></Td>
              <Td mono>240px</Td>
              <Td>最小寬度限制(即使 consumer 覆寫也不可低於此值)</Td>
            </tr>
            <tr>
              <Td><TkVal token="--sidebar-width-icon" value="3rem (48px)" /></Td>
              <Td mono>3rem</Td>
              <Td>icon 收合模式寬度</Td>
            </tr>
            <tr>
              <Td><TkVal token="--sidebar-width-mobile" value="18rem (288px)" /></Td>
              <Td mono>18rem</Td>
              <Td>Mobile Sheet 寬度</Td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2">
        <H3>Chrome header token(共享)</H3>
        <Desc>
          SidebarHeader / SidebarFooter / 主內容 page header 都用這個 token,確保跨元件同高對齊。Density-responsive。
        </Desc>
        <table className="min-w-full text-left border-collapse">
          <thead>
            <tr>
              <Th>Token</Th>
              <Th>Purpose</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td mono>--chrome-header-height</Td>
              <Td>Sidebar header / footer 固定高度；density 解析值見 uiSize.spec.md</Td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  ),
}

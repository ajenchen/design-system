// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { LayoutDashboard, Inbox, Users, Settings, Bell, Folder, Plus } from 'lucide-react'
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
  SidebarTrigger,
  Sidebar,
} from './sidebar'
import { ItemAvatar } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { Avatar } from '@/design-system/components/Avatar/avatar'

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
  width = 240,
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
            {/* Chrome header canonical:raw <Avatar size={24}> per header-canonical.spec.md:57-72 */}
            <div className="flex items-center gap-2 min-w-0">
              <Avatar size={24} shape="square" color="blue" solid alt="Acme Inc" />
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
    SidebarContent         ← flex-1 + ScrollArea 捲動
      SidebarGroup         ← py-2 + ::before divider
        SidebarGroupLabel  ← item-layout row (header mode)
        SidebarGroupContent
          SidebarMenu        ← flex-col, no gap
            SidebarMenuItem
              SidebarMenuButton  ← item-layout row
    SidebarFooter          ← shrink-0 py-2 border-t (高度由內容決定)
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
              <Td>Container</Td>
              <Td>—</Td>
              <Td>靠底 menu group 容器(shrink-0 + border-t),高度由內容決定</Td>
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
// 2. 元件檢閱器
// ═══════════════════════════════════════════════════════════════════════════

interface InspectorArgs {
  size: 'sm' | 'md' | 'lg'
  activeId: 'dashboard' | 'inbox' | 'team' | 'notifications' | 'settings'
  width: number
}

export const Inspector: Story = {
  name: '元件檢閱器',
  parameters: {
    docs: {
      description: {
        story:
          '右側 Controls 切 SidebarProvider props 即時 render,取代 Figma inspect。切 `size` 看 row height tier(sm / md / lg 對齊 item-layout);切 `activeId` 觀察不同 active 位置的 neutral-selected 底色;調 `width` 看寬度調整(min 240px)。',
      },
    },
  },
  args: {
    size: 'md',
    activeId: 'dashboard',
    width: 240,
  },
  argTypes: {
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
      description: 'propagate 到所有 row 元件(SidebarMenuButton / SidebarGroupLabel / ...)',
    },
    activeId: {
      control: 'radio',
      options: ['dashboard', 'inbox', 'team', 'notifications', 'settings'],
      description: '當前 active item(router-driven 時從 URL 算出)',
    },
    width: {
      control: { type: 'range', min: 240, max: 360, step: 8 },
      description: '展開寬度(預設 240 / 最小 240)',
    },
  },
  render: (args) => {
    const { size, activeId, width } = args as InspectorArgs
    return <SidebarPreview size={size} activeId={activeId} width={width} />
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Size 對照
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
// 4. 色彩 / 狀態對照
// ═══════════════════════════════════════════════════════════════════════════

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <H3>SidebarMenuButton 狀態</H3>
        <Desc>
          跟 TreeItem / MenuItem 共用同一組 semantic token。Default → hover → selected 的色彩都一致。
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
// 5. 狀態行為 — Collapse modes / Mobile offcanvas / Active restoration
// ═══════════════════════════════════════════════════════════════════════════

/** Static visual frame showing Sidebar at specific collapsible state */
const CollapsedFrame = ({
  variant,
  label,
  width,
  collapsed,
}: {
  variant: 'expanded' | 'icon' | 'offcanvas'
  label: string
  width: number
  collapsed?: boolean
}) => {
  return (
    <div className="flex flex-col gap-2 items-start">
      <span className="text-[11px] text-fg-muted font-mono">{label}</span>
      <div className="relative border border-divider rounded-lg overflow-hidden bg-canvas" style={{ width: 420, height: 220 }}>
        {/* Sidebar shell */}
        <div
          className="absolute top-0 bottom-0 left-0 border-r border-divider bg-surface transition-all duration-200"
          style={{
            width: collapsed && variant === 'offcanvas' ? 0 : width,
            opacity: collapsed && variant === 'offcanvas' ? 0 : 1,
          }}
        >
          <div className="h-10 border-b border-divider flex items-center px-3">
            <div className="w-6 h-6 rounded-md bg-primary shrink-0" />
            {!collapsed && variant !== 'icon' && <div className="ml-2 text-caption font-medium truncate">Acme Inc</div>}
            {variant === 'icon' && !collapsed && <div className="ml-2 text-caption font-medium truncate">Acme Inc</div>}
          </div>
          <div className="flex flex-col px-2 py-2 gap-0.5">
            {['Dashboard', 'Inbox', 'Team', 'Settings'].map((l, i) => (
              <div key={l} className="flex items-center h-8 px-2 gap-2 rounded-md"
                style={{
                  backgroundColor: i === 0 ? 'var(--neutral-selected)' : 'transparent',
                  color: i === 0 ? 'var(--foreground)' : 'var(--fg-secondary)',
                }}
              >
                <div className="w-4 h-4 rounded bg-current opacity-60 shrink-0" />
                {variant !== 'icon' && !collapsed && <span className="text-caption truncate">{l}</span>}
              </div>
            ))}
          </div>
        </div>
        {/* Main */}
        <div
          className="absolute top-0 bottom-0 right-0 left-0 px-4 py-3"
          style={{ left: collapsed && variant === 'offcanvas' ? 0 : width }}
        >
          <div className="h-10 border-b border-divider mb-3 flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-neutral-hover shrink-0" />
            <span className="text-caption text-fg-muted">page header</span>
          </div>
          <div className="text-[11px] text-fg-muted">主內容區域</div>
        </div>
      </div>
    </div>
  )
}

// 2026-05-17 ship per audit Dim 45 strict re-run — cva variant matrix codify
// SidebarMenuButton cva 有 variant: { default, meta } 兩個值,本 story 展示 default vs meta 區別
export const VariantMatrix: Story = {
  name: '變體對照（預設 vs 次要）',
  // 2026-06-11:改用真 SidebarMenuButton 渲染(原為手繪灰塊 mock row,違 production-grade composition fidelity)
  render: () => (
    <div className="flex flex-col gap-6 max-w-md">
      <div className="flex flex-col gap-2">
        <H3>variant=&quot;default&quot;(導覽 item)</H3>
        <Desc>正常導覽目的地。文字 <code>text-fg-secondary</code> + <code>font-medium</code>,參與 single-selection,可 active。</Desc>
        <div className="border border-border rounded-md p-3 bg-surface">
          <SidebarProvider defaultActiveId="dashboard" style={{ minHeight: 'auto' }}>
            <div className="flex flex-col w-full">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton id="dashboard" startIcon={LayoutDashboard}>Dashboard</SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton id="inbox" startIcon={Inbox}>Inbox</SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </div>
          </SidebarProvider>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <H3>variant=&quot;meta&quot;(命令 row,非導覽目的地)</H3>
        <Desc>
          section 底部的命令(「查看更多 / 載入更多 / + 新增專案」)。文字退到 <code>text-fg-muted</code> + <code>font-normal</code>,
          視覺重量下沉。<strong>不參與 single-selection</strong>(誤傳 isActive 也不啟動)。對齊 Linear「Show N more」/ Notion「Show more」/ Slack「Show more」/ Gmail Labels「More」共識。
        </Desc>
        <div className="border border-border rounded-md p-3 bg-surface">
          <SidebarProvider style={{ minHeight: 'auto' }}>
            <div className="flex flex-col w-full">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton id="checkout" startIcon={Folder}>Checkout Revamp</SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton id="billing" startIcon={Folder}>Billing Migration</SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton variant="meta" startIcon={Plus}>新增專案</SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton variant="meta">查看更多</SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </div>
          </SidebarProvider>
        </div>
      </div>
    </div>
  )
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <H3>狀態行為</H3>
        <Desc>
          Sidebar 層級特有的狀態:collapse / expand 三種模式、mobile offcanvas、active item single-selection、open state cookie 持久化。
          Item-level default / hover / active / selected / disabled **色彩**由 `ColorMatrix` 作為 state-driven 矩陣完整呈現(共用 item-anatomy row primitive 主檔);本 story 展示 container 層的結構狀態切換。
        </Desc>
      </div>

      {/* Collapse modes */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">行為 1:三種 collapsible 模式</span>
        <Desc>
          `collapsible` prop 控制收合策略:`offcanvas`(預設)= 整條 sidebar 滑出視窗外 / `icon` = 收縮到 48px 只留 icon / `none` = 永遠展開。選擇依使用情境:Linear / Figma / Notion 等「深度導覽」app 用 `icon`(使用者常切 section);Stripe Dashboard / Intercom 等「主內容為主」用 `offcanvas`(sidebar 只是啟動器)。
        </Desc>
        <div className="flex flex-wrap gap-6">
          <CollapsedFrame variant="expanded" label='collapsible="icon" · expanded' width={240} collapsed={false} />
          <CollapsedFrame variant="icon" label='collapsible="icon" · collapsed(icon mode)' width={48} collapsed />
          <CollapsedFrame variant="offcanvas" label='collapsible="offcanvas" · collapsed(hidden)' width={240} collapsed />
        </div>
      </div>

      {/* Live toggle demo */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">行為 2:Cmd+B / SidebarTrigger 切換 open state</span>
        <Desc>
          SidebarProvider 內建 Cmd+B (Mac) / Ctrl+B (Win) 全域快捷鍵,同時 SidebarTrigger iconOnly Button 作為視覺 toggle。open state 寫入 cookie(7 天);跨 session 還原需 consumer 讀 cookie 後傳 defaultOpen(詳 spec「持久化與快捷鍵」)。
        </Desc>
        <div className="border border-divider rounded-lg overflow-hidden bg-surface" style={{ width: 480, height: 280 }}>
          <SidebarProvider style={{ minHeight: 'auto', height: '100%' }}>
            <div className="flex w-full h-full">
              <Sidebar side="left" collapsible="icon">
                <SidebarHeader>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-md bg-primary shrink-0" />
                    <span className="text-body font-medium truncate">Acme Inc</span>
                  </div>
                </SidebarHeader>
                <SidebarContent>
                  <SidebarGroup>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {[
                          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                          { id: 'inbox', label: 'Inbox', icon: Inbox },
                          { id: 'team', label: 'Team', icon: Users },
                          { id: 'settings', label: 'Settings', icon: Settings },
                        ].map((item) => (
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
              </Sidebar>
              <div className="flex-1 flex flex-col">
                <div className="h-10 border-b border-divider flex items-center px-3 gap-2">
                  <SidebarTrigger />
                  <span className="text-caption text-fg-muted">Dashboard</span>
                </div>
                <div className="flex-1 px-4 py-3 text-caption text-fg-muted">
                  點 SidebarTrigger 或按 Cmd/Ctrl+B,觀察 sidebar 縮到 48px(icon mode)。再按一次展開。
                </div>
              </div>
            </div>
          </SidebarProvider>
        </div>
      </div>

      {/* Icon mode — tooltip for item labels */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">行為 3:Icon mode 時 label 隱藏 → Tooltip 代償</span>
        <Desc>
          collapse 到 icon mode 時 label 文字隱藏,滑鼠 hover menu button 自動出現 Tooltip(顯示 label)補償 — 對齊 Linear / GitHub 慣例,避免 icon-only 狀態讓使用者忘記每個 icon 的含義。SidebarMenuButton 內建此行為(`tooltip` prop)。
        </Desc>
      </div>

      {/* Rule notes */}
      <div className="flex flex-col gap-2 pt-4 border-t border-divider">
        <span className="text-caption font-medium text-fg-secondary">行為規則</span>
        <ul className="text-caption text-fg-secondary space-y-1.5 ml-4 list-disc">
          <li>`collapsible="offcanvas"` 用於主內容為主的 app(sidebar 是啟動器,使用者常關);`collapsible="icon"` 用於深度導覽 app(sidebar 是常駐工作區)。</li>
          <li>open state 寫 cookie `sidebar_state`(7 天 max-age);Provider 只寫不讀,還原由 consumer 讀 cookie 傳 `defaultOpen`(避免 SSR hydration flash)。</li>
          <li>Mobile(&lt;768px)一律走 Sheet overlay,不受 `collapsible` prop 影響——小螢幕 sidebar 永遠不佔固定空間。</li>
          <li>Icon mode 下 active item 的 `bg-neutral-selected` 仍然顯示,但 label 不可見——提供最小視覺指引讓使用者知道「當前在哪」。</li>
          <li>Cmd+B / Ctrl+B 全域快捷鍵由 SidebarProvider 監聽,任何 focus 位置都可觸發——目前未排除文字輸入框,在 input / textarea 內按下仍會 toggle 並攔掉預設行為(無 disableShortcut opt-out)。</li>
        </ul>
      </div>
    </div>
  ),
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. 尺寸 / 寬度 token
// ═══════════════════════════════════════════════════════════════════════════

export const ChromeTokens: Story = {
  name: '寬度與框架設計變數',
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
              <Td><TkVal token="--sidebar-width" value="15rem (240px)" /></Td>
              <Td mono>15rem</Td>
              <Td>展開寬度</Td>
            </tr>
            <tr>
              <Td><TkVal token="--sidebar-width-min" value="240px" /></Td>
              <Td mono>240px</Td>
              <Td>最小寬度限制(即使 consumer 覆寫也不可低於此值)</Td>
            </tr>
            <tr>
              <Td><TkVal token="--sidebar-width-icon" value="calc(2 × loose + icon)" /></Td>
              <Td mono>calc()</Td>
              <Td>icon 收合模式寬度(2026-05-21 v3 改 geometry formula;md=48 / lg=64,保證 icon center x 展開/收合一致)</Td>
            </tr>
            <tr>
              <Td><TkVal token="--sidebar-menu-icon-size" value="1rem (16px)" /></Td>
              <Td mono>1rem</Td>
              <Td>menu icon 大小(per ICON_SIZE.sm/md=16);size=lg 罕見 case override</Td>
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

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"-   收合切換鍵：Cmd+B(Mac)/ Ctrl+B(Windows)是業界慣例(VS Code / Linear / shadcn 都用),Sidebar 內建並會攔下這組鍵,避免穿透到瀏覽器書籤列。任何焦點位置都能觸發;目前未排除文字輸入框——在 input / textarea 內按下仍會 toggle(無 disableShortcut opt-out)。\n\n-   收合按鈕:SidebarTrigger 內建 aria-label「Toggle Sidebar」,讓螢幕報讀使用者知道按鈕用途;consumer 可傳 aria-label 覆寫(i18n)。SidebarGroupLabel 的收合 chevron 另有 toggleAriaLabel prop(預設「展開或收合」)。\n\n-   當前項目:選中的 menu item 帶 data-active,呈現選取底色(bg-neutral-selected)作為視覺指引;即使收合成 icon-only 模式,選取底色仍然保留,使用者一眼知道現在在哪一頁。\n\n-   手機尺寸:768px 以下自動切換成從旁滑出的抽屜(Sheet),內建焦點鎖定、Esc 關閉、關閉後焦點回到觸發按鈕。"}</p>
    </div>
  ),
}

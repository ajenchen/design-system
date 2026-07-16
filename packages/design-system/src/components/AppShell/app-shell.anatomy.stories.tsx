// @anatomy-rationale: Inspector + ColorMatrix N/A — AppShell 是 page-level layout composite
// (sidebar+header+main+aside 組合),無 cva color variant → ColorMatrix N/A;
// 無 interactive prop control(slots 全 ReactNode 組合)→ Inspector N/A(Dim 13 例外 marker)。
// @benchmark-cited: anatomy 6-canonical 對齊 Polaris / Material anatomy spec
// @story-baseline: packages/design-system/src/components/Sidebar/sidebar.stories.tsx#IconCollapse
// (透過 ./_demo-helpers AcmeSidebar / PageHeader / WorkspaceBrand / UserFooter 共用 baseline,
//  避免 anatomy stories 跟 showcase + Sidebar 既有完整佈局 範例視覺偏移)
import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { AppShell, AppShellAside } from './app-shell'
import { AcmeSidebar, PageHeader } from './_demo-helpers'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'
import { SidebarProvider, SidebarTrigger } from '@/design-system/components/Sidebar/sidebar'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta<typeof AppShell> = {
  title: 'Design System/Components/AppShell/設計規格',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof AppShell>

/** Slot 結構 + landmark role 對照(使用 baseline AcmeSidebar / PageHeader 完整 production-grade)。 */
export const Overview: Story = {
  name: '槽位結構總覽',
  render: () => {
    const [activeId, setActiveId] = React.useState<string>('dashboard')
    const [asideOpen, setAsideOpen] = React.useState(true)
    return (
      <SidebarProvider activeId={activeId} onActiveChange={setActiveId}>
        <AppShell
          layout="primary-sidebar"
          sidebar={<AcmeSidebar />}
          header={<PageHeader title="Dashboard" />}
          aside={
            <AppShellAside title="Detail panel" width={320}>
              <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
                <p className="text-body">Aside 內容(留白由使用此面板的內容自行管理)</p>
              </div>
            </AppShellAside>
          }
          asideOpen={asideOpen}
          onAsideOpenChange={setAsideOpen}
        >
          <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
            <h2 className="text-h4 mb-3">Main &lt;main&gt; landmark + padding=0</h2>
            <p className="text-body text-fg-secondary">
              主內容區自身不加任何留白,留白由內容決定:自帶邊框的卡片或表格自己帶內距、
              純排版容器由外層父層統一管理、有 hover 效果的列表則每一列各自帶內距。三種情況並存。
            </p>
          </div>
        </AppShell>
      </SidebarProvider>
    )
  },
}

/** Layout mode diagram:純文字 2 mode 對照(非 nested live demo,避 Sidebar fixed inset 衝突)。 */
export const LayoutModeDiagram: Story = {
  name: '兩種布局模式對照圖',
  render: () => (
    <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] space-y-6 text-body">
      <h2 className="text-h4">兩 mode 對照</h2>
      <section className="space-y-2">
        <h3 className="text-h5">primary-sidebar(Linear / Notion / Figma 派)</h3>
        <div className="flex gap-px bg-divider border border-divider rounded overflow-hidden text-caption">
          <div className="w-32 bg-surface-strong px-2 py-8 text-center">Sidebar<br/>頂天立地</div>
          <div className="flex-1 flex flex-col">
            <div className="bg-surface-strong px-2 py-1">Header(在 main col 內,當前頁 toolbar)</div>
            <div className="bg-canvas flex-1 px-2 py-6 text-fg-muted">Main content</div>
          </div>
          <div className="w-24 bg-surface-strong px-2 py-8 text-center text-fg-muted">Aside<br/>頂天</div>
        </div>
        <p className="text-fg-muted">Header scope = <strong>local toolbar</strong>(當前頁 actions / breadcrumb / page-level filter)。Workspace 多寡無關,Notion / Linear 多 workspace 也用 primary-sidebar。</p>
      </section>
      <section className="space-y-2">
        <h3 className="text-h5">primary-header(GitHub / Slack / Gmail 派)</h3>
        <div className="flex flex-col gap-px bg-divider border border-divider rounded overflow-hidden text-caption">
          <div className="bg-surface-strong px-2 py-1 text-center">Header(global bar,橫跨整 viewport)</div>
          <div className="flex">
            <div className="w-32 bg-surface-strong px-2 py-8 text-center">Sidebar<br/>(在 header 下)</div>
            <div className="flex-1 bg-canvas px-2 py-6 text-fg-muted">Main content</div>
            <div className="w-24 bg-surface-strong px-2 py-8 text-center text-fg-muted">Aside</div>
          </div>
        </div>
        <p className="text-fg-muted">
          Header scope = <strong>global bar</strong>(account / workspace switcher / notifications / 跨頁導覽)。
          Workspace 多寡無關 — GitHub / Gmail multi account 也用此 layout,真正的 distinguisher 是 header 是「local 還是 global」。
        </p>
      </section>
    </div>
  ),
}

/** Aside 2-mode state behavior(toggle + breakpoint 切換)— 用完整 baseline。 */
export const StateBehavior: Story = {
  name: '右側面板開合行為(兩種模式)',
  render: () => {
    const [activeId, setActiveId] = React.useState<string>('dashboard')
    const [open, setOpen] = React.useState(false)
    return (
      <SidebarProvider activeId={activeId} onActiveChange={setActiveId}>
        <AppShell
          layout="primary-sidebar"
          sidebar={<AcmeSidebar />}
          header={
            <ChromeHeader className="bg-surface">
              <SidebarTrigger />
              <h1 className="text-body-lg font-medium flex-1 truncate">Toggle Aside demo</h1>
              <Button size="sm" variant="primary" onClick={() => setOpen(!open)}>
                {open ? 'Close' : 'Open'} Aside (cmd+.)
              </Button>
            </ChromeHeader>
          }
          aside={
            <AppShellAside title="Detail panel" width={320}>
              <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
                <p className="text-body">Aside 內容</p>
              </div>
            </AppShellAside>
          }
          asideOpen={open}
          onAsideOpenChange={setOpen}
        >
          <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] text-body">
            <p>Aside open:{String(open)}</p>
            <p>Desktop ≥ 768px → inline standard mode(右側 panel,不蓋 mask)</p>
            <p>Mobile &lt; 768px → modal mode(Sheet from right,蓋 mask)</p>
          </div>
        </AppShell>
      </SidebarProvider>
    )
  },
}

/** A11y landmark 文字說明(非 live render,避無謂 nested shell)。 */
export const Accessibility: Story = {
  name: '無障礙(地標標記 + 跳轉連結 + 鍵盤導覽)',
  render: () => (
    <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
      <h2 className="text-h4 mb-3">A11y 機制</h2>
      <ul className="text-body space-y-2 list-disc pl-5">
        <li>
          <strong>Landmark</strong>:`&lt;header&gt;` / `&lt;aside&gt;` / `&lt;main&gt;` 各自有對應的無障礙地標角色。
          `&lt;header&gt;`(ChromeHeader)在兩種模式下都只被 `&lt;div&gt;` 包覆
          (body-scoped、與 `&lt;main&gt;` 並排而非子層),依 W3C HTML-AAM 都得到 implicit `role=banner`
          (整站層級標頭)——`&lt;div&gt;` 外層不會 scope out banner,只有 `main/article/aside/nav/section` 才會。
        </li>
        <li>
          <strong>Sidebar 導覽地標</strong>:`&lt;Sidebar&gt;` 自身渲染 `&lt;div&gt;`(不自帶 `&lt;nav&gt;` / `role=navigation`),
          navigation landmark 責任 delegate 給 consumer——需自行用 `&lt;nav aria-label="Main"&gt;` 包住 `&lt;Sidebar&gt;`(per `sidebar.spec.md` A11y 預設)。
        </li>
        <li><strong>Skip to main</strong>:`Tab` 第一站 focus skip-link → jump 到 `#app-shell-main`(WCAG 2.4.1)</li>
        <li><strong>Keyboard shortcuts</strong>:`⌘B` / `Ctrl+B` toggle sidebar(消費 Sidebar SSOT)/ `⌘.` / `Ctrl+.` toggle aside</li>
        <li><strong>Modal Aside title</strong>:title 是必填 prop → 行動裝置上以 Sheet 形式開啟時,自動連結 `aria-labelledby`,讓螢幕報讀器讀得到面板名稱</li>
        <li><strong>Focus trap</strong>:Sheet open 時 focus 在 Aside 內;Esc 關閉後回焦 opener——controlled Sheet 無 SheetTrigger,Radix 內建回焦失效,由 AppShellAside 自建 opener snapshot + onCloseAutoFocus 手動還原(app-shell.tsx,2026-07-14)</li>
      </ul>
    </div>
  ),
}

/** Size matrix:Aside width clamp 文字對照(非 rendered case,因 width 是 number prop)。 */
export const SizeMatrix: Story = {
  name: '右側面板寬度範圍(240-640)',
  render: () => (
    <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] space-y-3 text-body">
      <h2 className="text-h4">Aside width clamp</h2>
      <ul className="space-y-2 list-disc pl-5">
        <li>不傳 width → 320px(default)</li>
        <li>width={'{'}200{'}'} → 240px(clamp 下限,避免過窄無法閱讀)</li>
        <li>width={'{'}400{'}'} → 400px(自訂值落在 [240, 640] 內)</li>
        <li>width={'{'}800{'}'} → 640px(clamp 上限,避免過寬擠 main)</li>
        <li>width={'{{'} md: 320, xl: 480 {'}}'} → desktop=320 / xl(≥1280px)=480 breakpoint-keyed</li>
      </ul>
      <p className="text-caption text-fg-muted">DS 不發明 width token,consumer 自決 + clamp 保護。</p>
    </div>
  ),
}

// @anatomy-rationale: Inspector + ColorMatrix N/A — AppShell 是 page-level layout composite
// (Menu + header + Main + Right panel + AI agent 組合),無 cva color variant → ColorMatrix N/A;
// 無 interactive prop control(slots 全 ReactNode 組合)→ Inspector N/A(Dim 13 例外 marker)。
// @benchmark-cited: anatomy 6-canonical 對齊 Polaris / Material anatomy spec
// @story-baseline: packages/design-system/src/components/Sidebar/sidebar.stories.tsx#IconCollapse
// (透過 ./_demo-helpers AcmeSidebar / PageHeader / WorkspaceBrand / UserFooter 共用 baseline,
//  避免 anatomy stories 跟 showcase + Sidebar 既有完整佈局 範例視覺偏移)
import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { AppShell, AppShellAside, useAppShell, type PanelDisplay, type PanelWidthRange } from './app-shell'
import { AcmeSidebar, PageHeader } from './_demo-helpers'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'
import { SidebarProvider, SidebarTrigger } from '@/design-system/components/Sidebar/sidebar'
import { Button } from '@/design-system/components/Button/button'
import { DescriptionList, DescriptionItem } from '@/design-system/components/DescriptionList/description-list'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogClose,
} from '@/design-system/components/Dialog/dialog'
import {
  AgentPanel,
  AgentPanelHeader,
  AgentConversation,
  AgentMessage,
  AgentPromptInput,
} from '@/design-system/components/AgentPanel/agent-panel'
import { AgentPanelDock } from '@/design-system/components/AgentPanel/agent-panel-fab'

const meta: Meta<typeof AppShell> = {
  title: 'Design System/Components/AppShell/設計規格',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof AppShell>

/** 訂單詳情這種內容的寬度(示範產品的值;規則 app-shell.spec.md「版面規則」§1)。 */
const ORDER_DETAIL_WIDTH: PanelWidthRange = { min: 280, initial: 320, max: 480 }

/** Slot 結構 + landmark role 對照(使用 baseline AcmeSidebar / PageHeader 完整 production-grade)。 */
export const Overview: Story = {
  name: '元件總覽',
  render: () => {
    const [activeId, setActiveId] = React.useState<string>('dashboard')
    const [asideOpen, setAsideOpen] = React.useState(true)
    return (
      <SidebarProvider activeId={activeId} onActiveChange={setActiveId}>
        <AppShell
          layout="primary-sidebar"
          mainMinWidth={600}
          sidebar={<AcmeSidebar />}
          header={<PageHeader title="Dashboard" />}
          aside={
            <AppShellAside title="訂單詳情" contentType="order-detail" widthRange={ORDER_DETAIL_WIDTH}>
              {/* 面板內容自帶留白(px/py),示範 aside slot 不強制內距、由內容自管 */}
              <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] space-y-3 text-body">
                <div className="flex justify-between"><span className="text-fg-muted">訂單編號</span><span className="font-medium">#SO-20481</span></div>
                <div className="flex justify-between"><span className="text-fg-muted">客戶</span><span className="font-medium">陳怡君</span></div>
                <div className="flex justify-between"><span className="text-fg-muted">付款狀態</span><span className="font-medium">已付款</span></div>
                <div className="flex justify-between"><span className="text-fg-muted">金額</span><span className="font-medium">NT$ 12,800</span></div>
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

/** Layout mode diagram:純文字 2 mode 對照(非 nested live demo:一頁只能有一個 AppShell 整頁框架)。 */
export const LayoutModeDiagram: Story = {
  name: '兩種布局模式對照圖',
  render: () => (
    <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] space-y-6 text-body">
      <h2 className="text-h4">兩 mode 對照</h2>
      <section className="space-y-2">
        <h3 className="text-h5">primary-sidebar(Linear / Notion / Figma 派)</h3>
        <div className="flex gap-px bg-divider border border-divider rounded overflow-hidden text-caption">
          <div className="w-32 bg-surface-strong px-2 py-8 text-center">Menu<br/>頂天立地</div>
          <div className="flex-1 flex flex-col">
            <div className="bg-surface-strong px-2 py-1">Header(在 main col 內,當前頁 toolbar)</div>
            <div className="bg-canvas flex-1 px-2 py-6 text-fg-muted">Main content</div>
          </div>
          <div className="w-24 bg-surface-strong px-2 py-8 text-center text-fg-muted">Right panel<br/>頂天</div>
          <div className="w-24 bg-surface-strong px-2 py-8 text-center text-fg-muted">AI agent<br/>頂天</div>
        </div>
        <p className="text-fg-muted">Header scope = <strong>local toolbar</strong>(當前頁 actions / breadcrumb / page-level filter)。Workspace 多寡無關,Notion / Linear 多 workspace 也用 primary-sidebar。</p>
      </section>
      <section className="space-y-2">
        <h3 className="text-h5">primary-header(GitHub / Slack / Gmail 派)</h3>
        <div className="flex flex-col gap-px bg-divider border border-divider rounded overflow-hidden text-caption">
          <div className="bg-surface-strong px-2 py-1 text-center">Header(global bar,橫跨整 viewport)</div>
          <div className="flex">
            <div className="w-32 bg-surface-strong px-2 py-8 text-center">Menu<br/>(在 header 下)</div>
            <div className="flex-1 bg-canvas px-2 py-6 text-fg-muted">Main content</div>
            <div className="w-24 bg-surface-strong px-2 py-8 text-center text-fg-muted">Right panel</div>
            <div className="w-24 bg-surface-strong px-2 py-8 text-center text-fg-muted">AI agent</div>
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

// ── 狀態行為:四區版面規則(user 2026-10-14 規格的數字)────────────────────────────

/** 「版面規則」示範頁的設定(args;URL `&args=` 也吃得到,機械閘用它換成規格裡的另一組數字)。 */
interface LayoutRuleArgs {
  mainMinWidth: number
  menuMin: number
  menuInitial: number
  menuMax: number
  rightMin: number
  rightInitial: number
  rightMax: number
  agentMin: number
  agentInitial: number
  agentMax: number
  /** Menu 有細列(`collapsible="icon"`)。 */
  rail: boolean
  menuOpen: boolean
  rightOpen: boolean
  agentOpen: boolean
}

const DISPLAY_LABEL: Record<PanelDisplay, string> = {
  'side-by-side': '並排',
  overlay: '浮層',
  hidden: '暫藏(開關紀錄仍是開)',
  closed: '關閉',
}

/**
 * Main 的頁面動作「結束 Sprint 42」→ 確認框(一般 modal,層級表第 6 列 `z-50`)。示範「浮層可以同時存在多個」(「版面規則」§9):
 * AI agent 並排時打開確認框、再把視窗縮窄讓 AI agent 變浮層 —— 確認框畫在浮層上面,照樣可以按。
 */
function CompleteSprintAction() {
  const [open, setOpen] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">結束 Sprint 42</Button>
      </DialogTrigger>
      {/* 確認框:開啟到關閉內容高度不變 → hug;寬度取確認框那一檔 400(dialog.spec.md「高度軸」「maxWidth」) */}
      <DialogContent maxWidth={400} height="hug">
        <DialogHeader>
          <DialogTitle>結束 Sprint 42?</DialogTitle>
        </DialogHeader>
        <DialogBody>還有 3 筆議題沒完成,結束後會移到 Sprint 43。</DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">取消</Button>
          </DialogClose>
          <Button variant="primary" onClick={() => setOpen(false)}>結束 Sprint</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Main 裡的即時讀數:各區此刻的顯示方式(`useAppShell().display`)+ 頁面動作。 */
function LayoutReadout() {
  const { display } = useAppShell()
  return (
    <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] space-y-[var(--layout-space-tight)]">
      <DescriptionList orientation="horizontal" divided>
        <DescriptionItem label="Menu"><span data-readout="menu">{DISPLAY_LABEL[display.menu]}</span></DescriptionItem>
        <DescriptionItem label="Right panel"><span data-readout="right">{DISPLAY_LABEL[display.right]}</span></DescriptionItem>
        <DescriptionItem label="AI agent"><span data-readout="agent">{DISPLAY_LABEL[display.agent]}</span></DescriptionItem>
      </DescriptionList>
      <CompleteSprintAction />
    </div>
  )
}

/** 頁首:Menu 開關(⌘B)+ 頁名 + 「詳情」(= 使用者要求 Right panel 顯示內容,⌘. 同一條)。module 層定義(story-rules「元件一律定義在 module 層」)。 */
function RuleDemoHeader() {
  const { asideOpen, setAsideOpen } = useAppShell()
  return (
    <ChromeHeader className="bg-surface">
      <SidebarTrigger />
      <h1 className="text-body-lg font-medium flex-1 truncate">Sprint 42 議題</h1>
      <Button size="sm" variant="tertiary" aria-expanded={asideOpen} onClick={() => setAsideOpen(!asideOpen)}>
        {asideOpen ? '隱藏詳情' : '顯示詳情'}
      </Button>
    </ChromeHeader>
  )
}

function LayoutRuleDemo(raw: LayoutRuleArgs) {
  // URL args 可能帶字串,一律轉數字
  const n = (v: unknown) => Number(v)
  const args = {
    ...raw,
    mainMinWidth: n(raw.mainMinWidth),
    menu: { min: n(raw.menuMin), initial: n(raw.menuInitial), max: n(raw.menuMax) },
    right: { min: n(raw.rightMin), initial: n(raw.rightInitial), max: n(raw.rightMax) },
    agent: { min: n(raw.agentMin), initial: n(raw.agentInitial), max: n(raw.agentMax) },
  }
  const [asideOpen, setAsideOpen] = React.useState(String(raw.rightOpen) !== 'false')
  return (
    <SidebarProvider defaultOpen={String(raw.menuOpen) !== 'false'}>
      <AppShell
        layout="primary-sidebar"
        mainMinWidth={args.mainMinWidth}
        sidebar={<AcmeSidebar widthRange={args.menu} collapsible={String(raw.rail) === 'false' ? 'offcanvas' : 'icon'} includeProjects />}
        header={<RuleDemoHeader />}
        aside={
          <AppShellAside title="ENG-1042" contentType="issue-detail" widthRange={args.right}>
            <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] text-body">登入後 redirect 失敗 —— Alan Chen 處理中,週五到期</div>
          </AppShellAside>
        }
        asideOpen={asideOpen}
        onAsideOpenChange={setAsideOpen}
        agent={
          <AgentPanelDock defaultOpen={String(raw.agentOpen) !== 'false'} logoState="still">
            {({ close }) => (
              <AgentPanel onClose={close} widthRange={args.agent}>
                <AgentPanelHeader title="本週 P0 議題整理" onNewConversation={() => {}} onClose={close} />
                <AgentConversation>
                  <AgentMessage role="agent">還有兩筆 P0 沒處理完,ENG-1041 建議今天先指派。</AgentMessage>
                </AgentConversation>
                <AgentPromptInput value="" onValueChange={() => {}} onSubmit={() => {}} onRemoveAttachment={() => {}} onAddAttachment={() => {}} attachments={[]} />
              </AgentPanel>
            )}
          </AgentPanelDock>
        }
      >
        <LayoutReadout />
      </AppShell>
    </SidebarProvider>
  )
}

/**
 * 四區版面的狀態行為(app-shell.spec.md「版面規則」;數字照 user 2026-10-14 規格的例子:Main 最小 600、Menu 200–240、Right panel 250–500、
 * AI agent 350–700;初始寬 220 / 320 / 400 是示範用的假設)。拖拉視窗寬度、按頁首的 Menu 開關(⌘B)與「顯示詳情」(⌘.)、按 AI agent 的 ×
 * 或右下角入口鈕,Main 裡的讀數即時顯示各區此刻是並排、浮層、暫藏還是關閉:
 * - 依 Right panel → AI agent → Menu 的順序,每一步只看最小寬:放得下就並排;放不下時 Right 仍並排、AI agent 變右側浮層、Menu 暫藏(只剩細列)。
 * - 1600 寬三個都開時,可拉上限是 Menu 240 / Right 330 / AI agent 430,全部拉到上限時 Main 剛好剩 600。
 * - AI agent 開著時按「顯示詳情」,Main + 詳情 + AI agent 的最小寬(+ 細列)合計超過版面寬 → AI agent 被關閉(唯一的連帶關閉);
 *   只是視窗縮小則 AI agent 改成浮層、不關閉。
 * - Main + 並排面板的最小寬合計超過版面寬時,各自維持最小寬、整個殼水平捲動;按「顯示詳情」打開的 Right 一定捲到整個看得到。
 * - Menu 的「專案」群組在浮層裡展開,收回、放寬回並排後仍是展開的(浮層與版面上兩份共用狀態)。
 * - 「結束 Sprint 42」的確認框開著時把視窗縮窄、AI agent 變浮層,確認框仍在最上面可以按。
 * 機械閘 `scripts/app-shell-layout-invariant.mjs` 用這一頁在真實視窗寬度下逐條比對可執行模型 `layout-model.ts`。
 */
export const StateBehavior: StoryObj<LayoutRuleArgs> = {
  name: '狀態行為',
  args: {
    mainMinWidth: 600,
    menuMin: 200,
    menuInitial: 220,
    menuMax: 240,
    rightMin: 250,
    rightInitial: 320,
    rightMax: 500,
    agentMin: 350,
    agentInitial: 400,
    agentMax: 700,
    rail: true,
    menuOpen: true,
    rightOpen: true,
    agentOpen: true,
  },
  render: (args) => <LayoutRuleDemo {...args} />,
}

/** A11y landmark 文字說明(非 live render,避無謂 nested shell)。 */
export const Accessibility: Story = {
  name: '無障礙與鍵盤',
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
          <strong>Menu 導覽地標</strong>:`&lt;Sidebar&gt;` 自身渲染 `&lt;div&gt;`(不自帶 `&lt;nav&gt;` / `role=navigation`),
          navigation landmark 責任 delegate 給 consumer——需自行用 `&lt;nav aria-label="Main"&gt;` 包住 `&lt;Sidebar&gt;`(per `sidebar.spec.md` A11y 預設)。
        </li>
        <li><strong>Skip to main</strong>:`Tab` 第一站 focus skip-link → jump 到 `#app-shell-main`(WCAG 2.4.1)</li>
        <li><strong>Keyboard shortcuts</strong>:`⌘B` / `Ctrl+B` = 按 Menu 開關(消費 Sidebar SSOT)/ `⌘.` / `Ctrl+.` = 按 Right panel 開關(打開算使用者主動要求)</li>
        <li><strong>開關的展開狀態</strong>:Menu 開關帶 `aria-expanded`(展開的 Menu 看得到 = true,只剩細列或收掉 = false)與 `aria-controls` 指向 Menu</li>
        <li><strong>Esc</strong>:Menu 浮層 → 收回細列;AI agent 是浮層時,焦點在面板裡按 Esc 先關面板裡最內層的選單,沒有了就關閉面板;並排的 AI agent 不因 Esc 關閉</li>
        <li><strong>焦點後備</strong>:焦點所在的面板因為版面被收起、或被「要求詳情」連帶關閉 → 焦點回 `#app-shell-main`</li>
        <li><strong>拖寬把手</strong>:Menu 右緣、Right panel 與 AI agent 左緣都是 `role=separator`,←/→ 每步 16、Home / End 到最窄 / 最寬;`aria-valuemax` = 此刻真的拉得到的上限;名稱分得出是哪一區(「調整選單寬度」/「調整 Right panel 的標題 寬度」,例:調整 ENG-1042 寬度/「調整智慧代理寬度」),並以 `aria-controls` 指向自己調整的那一區</li>
        <li><strong>Right panel 標題</strong>:`title` 必填 → `&lt;aside aria-label&gt;`,讓螢幕報讀器讀得到面板名稱</li>
      </ul>
    </div>
  ),
}

/** Size matrix:各區寬度設定的對照(DS 預設 vs 產品設定 + 可拉上限算例)。 */
export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] space-y-3 text-body">
      <h2 className="text-h4">各區寬度設定(依內容類型:最小 / 初始 / 最大)</h2>
      <ul className="space-y-2 list-disc pl-5">
        <li>Main:只有最小寬,AppShell 的 `mainMinWidth` 必填(DS 不替產品挑);填滿其他並排面板沒用到的空間</li>
        <li>Menu:產品沒設時最小 / 初始 240(`--sidebar-width-min` / `--sidebar-width`);最大寬產品必給</li>
        <li>Right panel:產品沒設時 240 / 320 / 640(`AppShellAside` `widthRange`)</li>
        <li>AI agent:產品沒設時 360 / 400 / 640(`AGENT_PANEL_WIDTH_MIN / DEFAULT / MAX`)</li>
        <li>Menu 細列:`--sidebar-width-icon`(標準密度 48 / 寬鬆密度 68),不能拖</li>
      </ul>
      <h2 className="text-h4">可拉上限算例(Main 600、Menu 200–240、Right 250–500、AI agent 350–700)</h2>
      <ul className="space-y-2 list-disc pl-5">
        <li>版面寬 1600:剩餘 200 先均分,Menu 到 240 停,其餘兩個各再加 80 → 上限 240 / 330 / 430,全部拉滿時 Main 剛好 600</li>
        <li>版面寬 2200:三個都到最大寬 240 / 500 / 700,多出的 760 留給 Main</li>
        <li>浮層:最小寬 ~ min(最大寬, 版面寬 − 48);版面寬 320、最小 300 → 暫時顯示 272,寬度紀錄不變</li>
      </ul>
      <p className="text-caption text-fg-muted">DS 不再硬夾任何寬度、不依視窗挑寬(2026-10-14 前的 240 / 640 硬夾與 `{'{'} md, xl {'}'}` 退場);上限不取整。</p>
    </div>
  ),
}

// @benchmark-cited: Sidebar full-layout baseline + DataTable toolbar pattern + Linear real-product 場景。
// @story-baseline: packages/design-system/src/components/Sidebar/sidebar.stories.tsx#IconCollapse (Sidebar 完整佈局)
// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#WithBulkActions (Toolbar + DataTable)
import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { userEvent, within } from '@storybook/test'
import { createColumnHelper } from '@tanstack/react-table'
import { Search, Filter, ArrowUpDown, Info } from 'lucide-react'
import { AppShell, AppShellAside, useAppShell, type PanelWidthRange } from './app-shell'
import { AcmeSidebar, PageHeader, GlobalHeader, InsightsView, MAIN_NAV } from './_demo-helpers'
import { SidebarProvider } from '@/design-system/components/Sidebar/sidebar'
import {
  AgentPanel,
  AgentPanelHeader,
  AgentPromptInput,
} from '@/design-system/components/AgentPanel/agent-panel'
import { AgentPanelDock } from '@/design-system/components/AgentPanel/agent-panel-fab'
import { Button } from '@/design-system/components/Button/button'
import { Input } from '@/design-system/components/Input/input'
import { Tag } from '@/design-system/components/Tag/tag'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import { DataTableFilterPanel, createEmptyFilterTree, isFilterTreeActive, type FilterTree } from '@/design-system/components/DataTable/data-table-filter-panel'
import { DataTableSortManager } from '@/design-system/components/DataTable/data-table-sort-manager'
import { Popover, PopoverContent, PopoverTrigger } from '@/design-system/components/Popover/popover'
import { DescriptionList, DescriptionItem } from '@/design-system/components/DescriptionList/description-list'
import { DataToolbar } from '@/design-system/stories-helpers/scene/data-toolbar'
import { SimulatedBrowser } from '@/design-system/stories-helpers/scene/simulated-browser'
import { openOverlayDocsStory } from '@/design-system/stories-helpers/overlay/open-overlay-docs'
import { useAgentDemo, DemoConversation } from '@/design-system/stories-helpers/scene/agent-demo'
import { ItemContent } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/design-system/components/Tabs/tabs'
import type { SortingState } from '@tanstack/react-table'

const meta: Meta<typeof AppShell> = {
  title: 'Design System/Components/AppShell/展示',
  tags: ['autodocs'],
  component: AppShell,
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: '組合全域標頭、Menu(側欄)、主內容、Right panel(詳情面板)與 AI agent 的應用程式骨架:放得下就並排、放不下時 AI agent 變右側浮層、Menu 收起或變左側浮層,沒有固定斷點;統一 landmark 與鍵盤。建立多頁產品的頂層 chrome 時使用,不拿來包單一局部區塊。' } },
  },
}
export default meta
type Story = StoryObj<typeof AppShell>

// Helpers(AcmeSidebar / PageHeader / WorkspaceBrand / UserFooter / MAIN_NAV)從 ./_demo-helpers
// import,跟 anatomy stories 共用 single baseline source(避免 anatomy 跟 showcase 自分歧)。

// ── Mock data — Linear-style issue tracker ────────────────────────────────

type Issue = {
  id: string
  title: string
  status: 'In Progress' | 'Backlog' | 'In Review' | 'Done'
  assignee: string
  priority: 'P0' | 'P1' | 'P2'
  due: string
}

const ISSUES: Issue[] = [
  { id: 'ENG-1042', title: '登入後 redirect 失敗',         status: 'In Progress', assignee: 'Alan Chen',   priority: 'P0', due: '2026-05-22' },
  { id: 'ENG-1041', title: 'Stripe webhook timeout > 10s', status: 'Backlog',     assignee: 'Jamie Lin',   priority: 'P0', due: '2026-05-25' },
  { id: 'ENG-1038', title: 'PeoplePicker multi-select bug', status: 'In Review',  assignee: 'Sophia Wang', priority: 'P1', due: '2026-05-26' },
  { id: 'ENG-1035', title: 'DataTable Safari scroll jitter', status: 'Done',      assignee: 'Marco Tsai',  priority: 'P1', due: '2026-05-20' },
  { id: 'ENG-1031', title: '匯出 CSV 漏特殊字元',           status: 'In Progress', assignee: 'Sophia Wang', priority: 'P2', due: '2026-05-28' },
  { id: 'ENG-1028', title: 'Onboarding 第 3 步無 a11y',     status: 'Backlog',     assignee: 'Jamie Lin',   priority: 'P2', due: '2026-06-02' },
]

// ── 版面寬度設定(示範產品的值;規則見 app-shell.spec.md「版面規則」§1:Main 最小寬必填、各區依內容類型給最小 / 初始 / 最大)──
/**
 * Main 最小寬(示範值)= 600:user 規格兩個例子都用 600(U:13、U:35),下方 AgentOverlay / MenuOverlay 的算式照它算。
 * 它**不是**議題表的寬(六欄合計 840):Main 比表窄時,表格在自己裡面水平捲(`../DataTable/data-table.spec.md`「Center 區:flex-1,水平 overflow 自行處理」),
 * 不撐開 AppShell。2026-10-14 這裡寫「議題表 6 欄的可讀下限」是 AI 編的理由(與欄寬宣告矛盾;2026-10-15 r1b 複驗 F6,M36(a)),已改正。
 */
const MAIN_MIN_WIDTH = 600
/** Right panel「議題詳情」這種內容的寬度(示範值:最小 320 放得下欄位標籤 + 值兩欄,最大 560 免得留言行過長)。 */
const ISSUE_DETAIL_WIDTH: PanelWidthRange = { min: 320, initial: 360, max: 560 }

const ch = createColumnHelper<Issue>()
const ISSUE_COLUMNS = [
  ch.accessor('id',       { header: 'ID',       meta: { width: 100 } }),
  ch.accessor('title',    { header: 'Issue',    meta: { width: 280, minWidth: 160 } }),
  ch.accessor('status',   { header: 'Status',   meta: { width: 120 } }),
  ch.accessor('assignee', { header: 'Assignee', meta: { width: 140 } }),
  ch.accessor('priority', { header: 'Priority', meta: { width: 90 } }),
  ch.accessor('due',      { header: 'Due',      meta: { width: 110 } }),
]

/**
 * Main content:Toolbar(search + filter + sort)+ DataTable + Row actions trigger Aside。
 * @usage-ref: data-table.stories.tsx#WithBulkActions
 * @usage-consumes: Popover + DataTableFilterPanel + DataTableSortManager + Button text iconOnly pressed + rowActions
 *
 * Per codex Layer B D3(2026-05-20):row-driven Aside trigger 才符合 Linear/Notion/Jira/Airtable
 * production 真實情境。row 右側 dedicated action button(`Button variant="text" size="xs" iconOnly`
 * per data-table.spec L153 rowActions canonical)→ click 開 Aside + 被選 issue active visual(pressed prop)。
 * AppShell header toggle 降級為 secondary show/hide 不是主入口。
 */
/** 分頁的篩選條件:全部 / 未完成(狀態不是 Done)/ 已完成(狀態是 Done)。 */
type IssueScope = 'all' | 'open' | 'done'
const inScope = (issue: Issue, scope: IssueScope) => scope === 'all' || (scope === 'done' ? issue.status === 'Done' : issue.status !== 'Done')

function IssuesView({ selectedId, onSelectIssue, scope = 'all' }: { selectedId?: string; onSelectIssue: (issue: Issue) => void; scope?: IssueScope }) {
  // 點列上的「詳情」= 使用者主動要求 Right panel 顯示內容(app-shell.spec.md「版面規則」§4):關著就打開、開著就換看這一筆
  const { asideOpen, requestAside } = useAppShell()
  const [search, setSearch] = React.useState('')
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [filterTree, setFilterTree] = React.useState<FilterTree>(() => createEmptyFilterTree('flat'))
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [sortOpen, setSortOpen] = React.useState(false)

  const filtered = React.useMemo(
    () => {
      const scoped = ISSUES.filter((i) => inScope(i, scope))
      return search
        ? scoped.filter(
            (i) =>
              i.title.toLowerCase().includes(search.toLowerCase()) ||
              i.id.toLowerCase().includes(search.toLowerCase()),
          )
        : scoped
    },
    [search, scope],
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {/* Toolbar:對齊 data-table.stories.tsx#WithBulkActions「左 search / 右 ops」idiom + action-bar canonical;
          幾何住在 stories-helpers/scene/data-toolbar.tsx(搜尋框唯一可壓縮、下限 160px;提示字縮短到下限內放得下,2026-09-16)*/}
      <DataToolbar
        search={
          <Input
            size="sm"
            placeholder="搜尋 issue"
            startIcon={Search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
      >
        {/* Filter:tertiary iconOnly + Popover wrap real DataTableFilterPanel + pressed prop active state */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="text"
              size="sm"
              iconOnly
              startIcon={Filter}
              aria-label="篩選"
              pressed={isFilterTreeActive(filterTree)}
            />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <DataTableFilterPanel
              columns={ISSUE_COLUMNS as any}
              value={filterTree}
              onChange={setFilterTree}
              onClose={() => setFilterOpen(false)}
            />
          </PopoverContent>
        </Popover>
        {/* Sort:tertiary iconOnly + Popover wrap real DataTableSortManager + pressed active state */}
        <Popover open={sortOpen} onOpenChange={setSortOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="text"
              size="sm"
              iconOnly
              startIcon={ArrowUpDown}
              aria-label="排序"
              pressed={sorting.length > 0}
            />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <DataTableSortManager
              columns={ISSUE_COLUMNS as any}
              sorting={sorting}
              onSortingChange={setSorting}
              onClose={() => setSortOpen(false)}
            />
          </PopoverContent>
        </Popover>
      </DataToolbar>
      {/* DataTable:naked structure,layoutSpace 規則 1B 父層 mx 對齊 chrome 內容左右邊界。
          rowActions:per data-table.spec L153 rowActions canonical(Button text xs iconOnly,固定 24px)+
          pressed={row.id === selectedId} 顯示當前選中(per codex D3 active visual)。 */}
      <div className="flex-1 min-h-0 mx-[var(--layout-space-loose)] mb-[var(--layout-space-loose)]">
        <DataTable
          columns={ISSUE_COLUMNS as any}
          data={filtered}
          height="100%"
          bordered
          rowActions={(row: Issue) => (
            <Button
              variant="text"
              size="xs"
              iconOnly
              startIcon={Info}
              aria-label={`開啟 ${row.id} 詳情`}
              pressed={row.id === selectedId && asideOpen}
              onClick={() => {
                onSelectIssue(row)
                requestAside('issue-detail')
              }}
            />
          )}
        />
      </div>
    </div>
  )
}

// Status / Priority → Tag color mapping(per Tag spec status marker canonical)
const STATUS_COLOR = {
  'In Progress': 'blue',
  'Backlog': 'neutral',
  'In Review': 'yellow',
  'Done': 'green',
} as const

const PRIORITY_COLOR = {
  P0: 'red',
  P1: 'yellow',
  P2: 'neutral',
} as const

/**
 * Aside content:Issue detail panel。
 * @usage-ref: packages/design-system/src/components/DescriptionList/description-list.stories.tsx
 * @usage-consumes: ItemContent(entity identity)+ Tag(status/priority)+ DescriptionList(metadata)
 *
 * Per codex Layer B D1+D2(2026-05-20):
 * - Entity identity(title + id 副標)→ ItemContent(item-anatomy Family 2 subtitle pattern,非 ProfileCard 因 scope 是 people only)
 * - Status / Priority marker → Tag color-coded(per tag.spec.md status use case)
 * - Metadata fields → DescriptionList + DescriptionItem(per description-list.spec.md「Profile / detail panel 的屬性列表」use case)
 *
 * 2026-10-28:原本面板底部還有「分派給我」「標記完成」兩顆按鈕 —— 沒有規格依據、按了沒反應,user 訊息裡也查無「分派 / 標記完成」;
 * 詳情面板該放哪些動作是產品內容,範例不替產品決定,拿掉(稽核 M057;ssot PA5)。面板只示範內容。
 */
function IssueDetail({ issue }: { issue: Issue | null }) {
  if (!issue) {
    return (
      <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] text-fg-muted">
        選一個 issue 看詳情
      </div>
    )
  }
  return (
    <div className="flex flex-col px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
      <div className="flex flex-col gap-[var(--layout-space-loose)]">
        <div className="flex flex-col gap-[var(--layout-space-tight)]">
          <ItemContent
            size="lg"
            label={issue.title}
            description={issue.id}
            descriptionTone="muted"
            labelTruncate={false}
            labelClassName="font-medium text-foreground"
          />
          {/* @layout-space-magic-ok: Tag 與 Tag 之間 gap 4px(tag.spec.md:230)(layoutSpace.spec.md:113 同範疇 spec-own) */}
          <div className="flex flex-wrap gap-1">
            <Tag size="sm" color={STATUS_COLOR[issue.status]}>{issue.status}</Tag>
            <Tag size="sm" color={PRIORITY_COLOR[issue.priority]}>{issue.priority}</Tag>
          </div>
        </div>
        <DescriptionList orientation="horizontal" divided>
          <DescriptionItem label="Assignee">{issue.assignee}</DescriptionItem>
          <DescriptionItem label="Due">{issue.due}</DescriptionItem>
        </DescriptionList>
      </div>
    </div>
  )
}

// ── Stories ──────────────────────────────────────────────────────────────────

// primary-sidebar mode(Linear / Notion / Figma 派)— Linear-style issue tracker:
// - Sidebar 完整佈局(WorkspaceBrand + SidebarFooter avatar HoverCard,對齊 sidebar.stories baseline)
// - Header SidebarTrigger + 當前頁 title 緊鄰 + 右 toggle Aside button
// - Main:Toolbar(search + filter + sort)+ DataTable(對齊 data-table.stories WithBulkActions)
// - Aside:always-on header + close X + issue detail content
// (開發備忘用一般註解,不進 docs —— 稽核 L136;讀者看的說明在 docs.description)
export const PrimarySidebar: Story = {
  name: '主側欄佈局 — Linear 式議題追蹤',
  parameters: {
    docs: { description: { story: 'Linear 式議題追蹤:左側 Menu 頂天立地,頁首在主內容欄裡;點列尾的「詳情」鈕,右側打開那一筆議題的詳情。' } },
  },
  render: () => {
    const [activeId, setActiveId] = React.useState<string>('inbox')
    const [asideOpen, setAsideOpen] = React.useState(true)
    const [selected, setSelected] = React.useState<Issue | null>(ISSUES[0])

    return (
      <SidebarProvider activeId={activeId} onActiveChange={setActiveId}>
        <AppShell
          layout="primary-sidebar"
          mainMinWidth={MAIN_MIN_WIDTH}
          sidebar={<AcmeSidebar />}
          header={
            <PageHeader
              title={MAIN_NAV.find((n) => n.id === activeId)?.label ?? 'Inbox'}
            />
          }
          aside={
            <AppShellAside title={selected ? selected.id : '詳情'} contentType="issue-detail" widthRange={ISSUE_DETAIL_WIDTH}>
              <IssueDetail issue={selected} />
            </AppShellAside>
          }
          asideOpen={asideOpen}
          onAsideOpenChange={setAsideOpen}
        >
          <IssuesView
            selectedId={selected?.id}
            onSelectIssue={setSelected}
          />
        </AppShell>
      </SidebarProvider>
    )
  },
}

// primary-sidebar + header tabs(W1-W6 canonical 落地範例)。
// @usage-ref: patterns/header-canonical/header-canonical.spec.md(W1-W6 + Background ownership)
// @usage-consumes: ChromeHeader tabsSlot + Tabs + TabsList + TabsTrigger + TabsContent
// 對齊 GitHub Issues / Linear / Notion 派「頁面內 status filter 走 header tabs」idiom:
// - Tabs root wrap 整 AppShell(Radix TabsList ↔ TabsContent 必同 Tabs root)
// - PageHeader 接 tabsSlot → ChromeHeader 自動 column mode:row 1 = title / row 2 = tabs
// - W1 border auto-suppress(header 不畫 border,TabsList 接管)/ W2 tabs padding 對齊 header(px-loose)/ W3 tabs size = sm / W4 flush stack
// - TabsContent 放 AppShell children 內,自動 Tabs context binding
// - 每個分頁真的篩選:未完成 = 狀態不是 Done、已完成 = 狀態是 Done(稽核 H13:原本三個分頁放同一份沒篩選的清單,點「已完成」照樣列出全部)
// - 分頁內容撐滿主內容區、四邊貼著捲動容器 → 焦點框往內(focus-canonical.md「框怎麼畫」:撐滿容器寬度的區塊)
// (開發備忘用一般註解,不進 docs —— 稽核 L136;讀者看的說明在 docs.description)
const ISSUE_TABS: { value: IssueScope; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'open', label: '未完成' },
  { value: 'done', label: '已完成' },
]

export const PrimarySidebarWithTabs: Story = {
  name: '主側欄佈局 + 頁面分頁',
  parameters: {
    docs: { description: { story: '頁首帶分頁的主側欄佈局:頁名下面一列分頁(全部 / 未完成 / 已完成),切換分頁就篩選下面的議題清單。' } },
  },
  render: () => {
    const [activeId, setActiveId] = React.useState<string>('inbox')
    const [asideOpen, setAsideOpen] = React.useState(true)
    const [selected, setSelected] = React.useState<Issue | null>(ISSUES[0])

    return (
      <Tabs defaultValue="all">
        <SidebarProvider activeId={activeId} onActiveChange={setActiveId}>
          <AppShell
            layout="primary-sidebar"
            mainMinWidth={MAIN_MIN_WIDTH}
            sidebar={<AcmeSidebar />}
            header={
              <PageHeader
                title={MAIN_NAV.find((n) => n.id === activeId)?.label ?? 'Inbox'}
                tabsSlot={
                  <TabsList size="sm">
                    {ISSUE_TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
                  </TabsList>
                }
              />
            }
            aside={
              <AppShellAside title={selected ? selected.id : '詳情'} contentType="issue-detail" widthRange={ISSUE_DETAIL_WIDTH}>
                <IssueDetail issue={selected} />
              </AppShellAside>
            }
            asideOpen={asideOpen}
            onAsideOpenChange={setAsideOpen}
          >
            {ISSUE_TABS.map((t) => (
              <TabsContent key={t.value} value={t.value} className="mt-0 flex-1 min-h-0 flex flex-col focus-visible:focus-ring-inset">
                <IssuesView
                  scope={t.value}
                  selectedId={selected?.id}
                  onSelectIssue={setSelected}
                />
              </TabsContent>
            ))}
          </AppShell>
        </SidebarProvider>
      </Tabs>
    )
  },
}

// 
// primary-header mode(GitHub / Gmail / Slack 派)— global header 橫跨頂部 + local header 仍在 main col 頂。
//
// @usage-ref: app-shell.spec.md「primary-header = primary-sidebar + 一條 global header」段(2-layer model)
// @usage-consumes: ChromeHeader + Sidebar + GlobalHeader + PageHeader + IssuesView
//
// 2026-05-21 v2 per user clarification「primary-header = primary-sidebar + 一條 global header」:
// - **Row 1 globalHeader**:跨頁 chrome(WorkspaceBrand 左 + account / search 右),對齊
//   GitHub top nav / Slack workspace bar / Gmail logo bar
// - **Row 2 [Menu][Main][Right panel]**:版面列在 globalHeader 下方,Menu 的高度由版面列給、不蓋 globalHeader
//   (2026-10-14 起;`viewportInsetTop` 只對不在 AppShell 裡的 Sidebar 有作用,這裡不傳)
// - **Main col 仍有 local header(PageHeader)** — 當前頁 title / breadcrumb / page actions
//   對齊 GitHub repo header / Slack channel header / Gmail email-list toolbar 2-layer 慣例
// - Sidebar 內**不 render WorkspaceBrand**(`includeWorkspaceBrand={false}`),avoid 重複(已在 globalHeader)
// - **Menu 放不下時**(沒有固定斷點,用各區最小寬現算):按開關叫出的 Menu 左側浮層從視窗頂端起、蓋住 globalHeader →
//   AcmeSidebar 讀 `useSidebarSurface()`(這一份畫在浮層裡)+ `useAppShell().layout`,只在**浮層那一份**把整條 globalHeader 搬進 SidebarHeader
//   (brand 左 + 帳號 avatar 右,鏡像桌面 global bar;SidebarHeader = ChromeHeader 基底 → 結構 SSOT、非手刻);被浮層蓋住的細列那一份不補、不跳。
//   **不放 SidebarFooter**(primary-header 帳號家在 header 右,非 footer — footer 是 primary-sidebar 慣例)。
//   Menu 並排時維持無 header/footer。見 app-shell.spec.md「帳號入口(Account entry)放置 SSOT」的「浮層精修」子句。
//   (把 Storybook 視窗縮到 Menu 放不下、再按 globalHeader 最左的開關,即可見浮層頂排一排品牌 + 帳號。)
// (開發備忘用一般註解,不進 docs —— 稽核 L136;讀者看的說明在 docs.description)
export const PrimaryHeader: Story = {
  name: '主標頭佈局 — 全域+本地兩層(GitHub/Gmail/Slack 派)',
  parameters: {
    docs: { description: { story: 'GitHub / Gmail / Slack 式:全域標頭橫跨頂部(品牌、帳號),Menu 與主內容在它下方,主內容欄仍有自己的頁首。視窗窄到 Menu 放不下時,按全域標頭最左的開關叫出 Menu 浮層,浮層頂排會補上品牌與帳號。' } },
  },
  render: () => {
    const [activeId, setActiveId] = React.useState<string>('inbox')
    const [asideOpen, setAsideOpen] = React.useState(true)
    const [selected, setSelected] = React.useState<Issue | null>(ISSUES[0])

    return (
      <SidebarProvider activeId={activeId} onActiveChange={setActiveId}>
        <AppShell
          layout="primary-header"
          mainMinWidth={MAIN_MIN_WIDTH}
          sidebar={
            <AcmeSidebar
              includeWorkspaceBrand={false}
              includeUserFooter={false}
            />
          }
          globalHeader={<GlobalHeader />}
          header={
            <PageHeader
              title={MAIN_NAV.find((n) => n.id === activeId)?.label ?? 'Inbox'}
              includeSidebarTrigger={false}
            />
          }
          aside={
            <AppShellAside title={selected ? selected.id : '詳情'} contentType="issue-detail" widthRange={ISSUE_DETAIL_WIDTH}>
              <IssueDetail issue={selected} />
            </AppShellAside>
          }
          asideOpen={asideOpen}
          onAsideOpenChange={setAsideOpen}
        >
          <IssuesView
            selectedId={selected?.id}
            onSelectIssue={setSelected}
          />
        </AppShell>
      </SidebarProvider>
    )
  },
}



// ── AI agent(第四區)──────────────────────────────────────────────────────────

/** 議題助理回覆裡的「Insights」連結要做的事(換頁由示範產品給;收起浮層由 AppShell 給)—— 經 context 交給回覆那一則 */
const OpenInsightsContext = React.createContext<() => void>(() => undefined)

/**
 * 議題助理的回覆:「Insights」連結 = 從 AI agent 導向 Main(app-shell.spec.md「版面規則」§4 末條):產品自己的導航(換到 Insights 頁)
 * 與 `useAppShell().navigateFromAgent()` 放在同一個事件裡 —— AI agent 是浮層時收起、讓 Main 的目標端到眼前;並排時維持開著。
 */
function TriageReply() {
  const onOpenInsights = React.useContext(OpenInsightsContext)
  const { navigateFromAgent } = useAppShell()
  return (
    <>
      有兩筆:ENG-1042「登入後 redirect 失敗」由 Alan Chen 處理中,週五到期;ENG-1041「Stripe webhook timeout」還在 Backlog、
      下週一到期,建議今天先指派給 Jamie Lin。本週燃盡進度在{' '}
      <a
        href="#insights"
        data-agent-link="insights"
        onClick={(event) => {
          event.preventDefault()
          onOpenInsights()
          navigateFromAgent()
        }}
      >
        Insights
      </a>
      。
    </>
  )
}

/**
 * 議題助理:AI agent 面板的示範內容(AgentPanel 家族,`agent-panel.stories.tsx` 同一組元件)。
 * 面板關閉時右下角入口鈕接手(`AgentPanelDock`);寬度用 DS 預設(最小 360 / 初始 400 / 最大 640)。
 * 輸入盒、送出、加附件、標題列的歷史與 + 都接上真的行為(共用對話模型 stories-helpers/scene/agent-demo.tsx;
 * 稽核 M058:原本 + 與加附件接空函式,按了沒反應)。
 */
function IssueAssistant({ onOpenInsights, persistentElements }: { onOpenInsights: () => void; persistentElements?: () => Element[] }) {
  const demo = useAgentDemo({
    sessions: [
      {
        id: 'triage',
        title: '本週 P0 議題整理',
        group: '今天',
        messages: [
          { role: 'user', content: '這週還有哪些 P0 沒處理完?' },
          { role: 'agent', content: <TriageReply /> },
        ],
      },
    ],
  })
  return (
    <OpenInsightsContext.Provider value={onOpenInsights}>
      <AgentPanelDock defaultOpen logoState="still">
        {({ close, logoState }) => (
          <AgentPanel onClose={close} persistentElements={persistentElements}>
            <AgentPanelHeader {...demo.header} logoState={logoState} onClose={close} />
            <DemoConversation messages={demo.messages} />
            <AgentPromptInput {...demo.prompt} placeholder="問我或指派工作…" />
          </AgentPanel>
        )}
      </AgentPanelDock>
    </OpenInsightsContext.Provider>
  )
}

/**
 * 四區都在的整頁(Menu + Main + Right panel + AI agent)。
 * `frameWidth`:放進**模擬瀏覽器**(`stories-helpers/scene/simulated-browser.tsx`,story-rules.md「整頁情境」),畫布寬 = `frameWidth` ——
 * 不用縮視窗就看得到「放不下」的樣子,而且畫布邊框標出這個瀏覽器視窗的範圍。AppShell 撐滿畫布(`h-full`),AI agent 浮層本來就以 AppShell 根節點定位;
 * Menu 浮層(Sheet)以 `portalContainer` 傳送進帶 transform 的畫布,側板與遮罩不跑出視窗。2026-10-14 版用裸 `<div style={{ width }}>` 釘殼寬:
 * AI agent 浮層停在畫面中段、右側一大片空白,Menu 浮層的遮罩蓋到殼外(2026-10-15 r1b 複驗 F10)。
 * `agent`:AI agent 由 story 自己給(拿到換頁函式與「浮層時仍要可用的節點」,回傳 AgentPanelDock)—— 有沒有預設開著的 AI agent 寫在 story 上看得到,
 * docs 隔離閘(`scripts/dialog-coexistence-invariant.mjs` D 靜態)也才判得出來;沒給 = 沒有 AI agent。
 * `keep` = 模擬瀏覽器的工具列:它不是宿主(`stories-helpers/scene/simulated-browser.tsx` 檔頭契約),AI agent 浮層開著時網址列仍要點得到 →
 * 傳進 AgentPanel 的 `persistentElements`(同 agent-panel / file-viewer 展示的寫法;2026-10-20 r1b 複核 D3:漏傳時工具列整條被設成 inert)。
 * 沒有網址的 modal(Menu 浮層是 Sheet)照既有做法蓋住一切、不保留工具列(agent-panel 展示的刪除確認框同理)。
 */
function FourRegionShell({ frameWidth, agent }: { frameWidth?: number; agent?: (navigate: (id: string) => void, keep: () => Element[]) => React.ReactNode }) {
  const [activeId, setActiveId] = React.useState<string>('inbox')
  const [asideOpen, setAsideOpen] = React.useState(true)
  const [selected, setSelected] = React.useState<Issue | null>(ISSUES[0])
  const [canvas, setCanvas] = React.useState<HTMLDivElement | null>(null)
  const toolbarRef = React.useRef<HTMLDivElement | null>(null)
  const keep = React.useCallback(() => [toolbarRef.current].filter((el): el is HTMLDivElement => !!el), [])
  // 換頁(示範產品的導航邏輯,不是 AppShell 規則):Insights 是自己的一頁,右側的議題詳情跟它無關 → 一起收起
  // (Linear 換頁時議題 peek 一起收;2026-10-15 r1b 複驗 F11:原本 Main 換到 Insights,右側仍掛著 ENG-1042)。其餘選單項示範仍是議題清單,詳情保留。
  const navigate = React.useCallback((id: string) => {
    setActiveId(id)
    if (id === 'insights') setAsideOpen(false)
  }, [])
  const shell = (
    // 放進畫布時:SidebarProvider 預設 `min-h-svh` 會把殼撐到整個視窗高、超出畫布 → 取消並撐滿畫布(先例 sidebar.anatomy.stories.tsx「狀態行為」)
    <SidebarProvider activeId={activeId} onActiveChange={navigate} style={frameWidth ? { minHeight: 'auto', height: '100%' } : undefined}>
      <AppShell
        layout="primary-sidebar"
        mainMinWidth={MAIN_MIN_WIDTH}
        className={frameWidth ? 'h-full' : undefined}
        portalContainer={frameWidth ? canvas : undefined}
        sidebar={<AcmeSidebar />}
        header={<PageHeader title={MAIN_NAV.find((n) => n.id === activeId)?.label ?? 'Inbox'} />}
        aside={
          <AppShellAside title={selected ? selected.id : '詳情'} contentType="issue-detail" widthRange={ISSUE_DETAIL_WIDTH}>
            <IssueDetail issue={selected} />
          </AppShellAside>
        }
        asideOpen={asideOpen}
        onAsideOpenChange={setAsideOpen}
        agent={agent?.(navigate, keep)}
      >
        {activeId === 'insights' ? <InsightsView /> : <IssuesView selectedId={selected?.id} onSelectIssue={setSelected} />}
      </AppShell>
    </SidebarProvider>
  )
  if (!frameWidth) return shell
  return (
    <div className="flex h-dvh flex-col p-[var(--layout-space-loose)]">
      {/* 畫布左右各 1px 邊框:外框寬 = frameWidth + 2,畫布(= 這個瀏覽器視窗)剛好 frameWidth */}
      <FitToWidth width={frameWidth + 2}>
        <SimulatedBrowser url={`/${activeId}`} height="fill" canvasRef={setCanvas} toolbarRef={toolbarRef}>
          {shell}
        </SimulatedBrowser>
      </FitToWidth>
    </div>
  )
}

/**
 * 固定寬的模擬瀏覽器放不下時,整個外框等比縮小到剛好放得下(只會縮、不會放大)—— 文件頁的故事區只有約 1000px,
 * 「任務助理放不下時」(1100)「Menu 放不下時」(1000)兩則原本要往右捲 120 / 20px 才看得到右緣(ssot「只知會」① / B-24 丙:
 * 文件頁也進小框、縮小顯示;示範的寬度與算式不變)。放得下時(單則 story 頁)不套任何 transform,畫面與原本相同。
 * 縮放用 transform,版面量的是縮放前的寬(AppShell 照 frameWidth 排版),所以示範的「視窗只有這麼寬」不受影響。
 */
function FitToWidth({ width, children }: { width: number; children: React.ReactNode }) {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null)
  React.useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const measure = () => setBox({ w: host.clientWidth, h: host.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    return () => ro.disconnect()
  }, [])
  const scale = box && box.w < width ? box.w / width : 1
  return (
    <div ref={hostRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        className="flex min-h-0 flex-col"
        style={
          scale < 1 && box
            ? { width, height: box.h / scale, transform: `scale(${scale})`, transformOrigin: 'top left' }
            : { width, flex: '1 1 0%' }
        }
      >
        {children}
      </div>
    </div>
  )
}

// 2026-10-15 r1b 複驗 N5:原說明寫「一般桌機寬度下四區並存」,實測 1520 才四區並排(1440 只有細列 + 三區)→ 改寫成算式;F3:載入即浮層 → docs 隔離。
// 四區版面:由左至右 Menu、Main、Right panel、AI agent(app-shell.spec.md「版面規則」;user 2026-10-14 規格)。
// 依 Right → AI agent → Menu 的順序,每一步只看各區最小寬:放得下就並排,放不下時 Right 仍並排、AI agent 變右側浮層、Menu 收成細列。
// 四區同時並排要 Main 600 + 詳情 320 + 任務助理 360 + Menu 240 = 1520 以上(Menu 展開時取代細列);窄一點先收起 Menu(只剩細列),
// 再窄到 Main + 細列 + 詳情 + 任務助理的最小寬也放不下(細列 48 時是 1328)AI agent 變浮層。沒有任何固定斷點。
// AI agent 回覆裡的「Insights」連結 = 從 AI agent 導向 Main:並排時 Main 換到 Insights 頁、AI agent 維持開著(§4 末條);右側的議題詳情跟著換頁收起。
// 文件頁的畫布比 1328 窄,這一則載入時 AI agent 就是浮層(遮罩 + 底下不可操作),所以在文件頁各自進 iframe(story-rules.md「預設開啟的模態浮層 story」)。
// (開發備忘用一般註解,不進 docs —— 稽核 L136;讀者看的說明在 docs.description)
export const FourRegions: Story = {
  name: '四區版面 — 議題追蹤 + 詳情 + 任務助理',
  parameters: {
    docs: {
      story: openOverlayDocsStory('720px'),
      description: { story: '由左至右 Menu、Main、Right panel、AI agent。依 Right → AI agent → Menu 的順序看各區最小寬:放得下就並排,放不下時 Right 仍並排、AI agent 變右側浮層、Menu 收成細列,沒有固定斷點。四區同時並排要 Main 600 + 詳情 320 + 任務助理 360 + Menu 240 = 1520 以上。點任務助理回覆裡的「Insights」,Main 換到 Insights 頁、任務助理維持開著,右側詳情跟著換頁收起。' },
    },
  },
  render: () => <FourRegionShell agent={(navigate, keep) => <IssueAssistant onOpenInsights={() => navigate('insights')} persistentElements={keep} />} />,
}

// 2026-10-15 r1b 複驗 F3(docs 頁互相 inert 卡死 → docs 隔離)、F10(裸 div 釘寬 → 模擬瀏覽器)。
// AI agent 放不下時變右側浮層(OpenSnapshot,M15):模擬瀏覽器的視窗寬 1100px —— Main 最小 600 + 細列 48 + 詳情最小 320 之後,只剩 132px,
// 放不下 AI agent 的最小寬 360 → AI agent 改成蓋在右側的浮層:寬度照紀錄(沒調過 = 初始 400)、左側至少留 48px、底下鋪遮罩、
// 底下其餘區域暫時不能操作;點遮罩、按 ×、或焦點在面板裡按 Esc 都會收起(對話與草稿保留,入口鈕接手)。Menu 也放不下,只剩細列。
// 點回覆裡的「Insights」連結 → Main 換到 Insights 頁,浮層的 AI agent 自己收起、焦點交給 Main(使用者要看的目標端到眼前;§4 末條)。
// 2026-10-14 前這個狀態由「容器 < 960」決定(agent-panel 展示的「窄畫布:蓋板與遮罩」),現在每次用各區最小寬現算。
// 載入就是浮層(遮罩 + 底下不可操作、焦點進面板)→ 文件頁各自進 iframe(story-rules.md「預設開啟的模態浮層 story」)。
// (開發備忘用一般註解,不進 docs —— 稽核 L136;讀者看的說明在 docs.description)
export const AgentOverlay: Story = {
  name: '任務助理放不下時 — 右側浮層',
  parameters: {
    docs: {
      story: openOverlayDocsStory('720px'),
      description: { story: '模擬瀏覽器的視窗寬 1100px:Main 最小 600 + 細列 48 + 詳情最小 320 之後只剩 132px,放不下任務助理的最小寬 360,任務助理改成蓋在右側的浮層(寬度照紀錄、左側至少留 48px、底下鋪遮罩),點遮罩、按 × 或在面板裡按 Esc 都會收起。點回覆裡的「Insights」,Main 換到 Insights 頁、浮層自己收起。文件頁比 1100 窄,這一則等比縮小顯示。' },
    },
  },
  render: () => <FourRegionShell frameWidth={1100} agent={(navigate, keep) => <IssueAssistant onOpenInsights={() => navigate('insights')} persistentElements={keep} />} />,
}

// 2026-10-15 r1b 複驗 F7(原寫「600 + 細列 48 + 320 之後只剩 80」,字面相減是 32;模型比的是 available − reserved + 細列)、F10(模擬瀏覽器 + 浮層傳送進畫布)。
// Menu 放不下時按開關 → 左側浮層(OpenSnapshot,M15):模擬瀏覽器的視窗寬 1000px、詳情開著 —— Main 600 + 詳情 320 之後剩 80px
// (Menu 展開時取代細列,所以細列不另扣),
// Menu(最小 240)放不下,收成細列(開關紀錄仍是「開」,這叫「暫藏」)。這時按開關(或 ⌘B)叫出左側浮層:從版面左緣蓋住細列、
// 寬度照紀錄、可拖寬、右側至少留 48px;再按開關、按 Esc 或點浮層外 → 收回細列,之後視窗放寬放得下時 Menu 自己回來並排。
// (開發備忘用一般註解,不進 docs —— 稽核 L136;讀者看的說明在 docs.description)
export const MenuOverlay: Story = {
  name: 'Menu 放不下時 — 按開關出左側浮層',
  parameters: {
    docs: { description: { story: '模擬瀏覽器的視窗寬 1000px、詳情開著:Main 600 + 詳情 320 之後剩 80px,Menu(最小 240)放不下,收成細列。按開關(或 ⌘B)叫出左側浮層:蓋住細列、寬度照紀錄、可拖寬、右側至少留 48px;再按開關、按 Esc 或點浮層外就收回細列。文件頁比 1000 窄,這一則等比縮小顯示。' } },
  },
  render: () => <FourRegionShell frameWidth={1000} />,
  play: async ({ canvasElement }) => {
    // Menu 此刻是暫藏(只剩細列);按一下 Main 頁首最左的開關 = 叫出左側浮層
    await userEvent.click(within(canvasElement).getByRole('button', { name: '切換側邊欄' }))
  },
}

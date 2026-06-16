// CPIM | Customer Product Information Master — Product information (table view)
// Figma: https://www.figma.com/design/4bdr1ztsdNkm7IFGgBSxMZ/CPIM (node 6918:295847)
//
// ── 消費的 SSOT ──
// - components: [AppShell(primary-header), Sidebar(collapsible=icon), ChromeHeader,
//   SegmentedControl, DataTable, Breadcrumb, Avatar, Badge, Button, Select, Sheet]
// - patterns: [header-canonical(ChromeHeader), AppShellAside(inline right panel)]
// - spec refs: AppShell primary-header layout(app-shell.tsx:205-238), Sidebar
//   collapsible="icon"(sidebar.stories.tsx#IconCollapse baseline), Tabs underline-only
//   (tabs.tsx — no rounded/pill variant exists) → rounded pill row + icon-only view
//   switcher both map to existing SegmentedControl primitive (no new component needed,
//   per M21 — Figma's "tabs--rounded" visual reads as TSMC-kit naming for what this DS
//   already models as SegmentedControl, not a Tabs variant).

import { useMemo, useState } from 'react'
import {
  AppShell,
  AppShellAside,
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  ChromeHeader,
  TooltipProvider,
  Avatar,
  Badge,
  Tag,
  Button,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  SegmentedControl,
  SegmentedControlItem,
  DataTable,
  Select,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@qijenchen/design-system'
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
import {
  LayoutGrid,
  Boxes,
  GitMerge,
  Menu,
  Bell,
  ChevronDown,
  Upload,
  Plus,
  List,
  GitBranch,
  Pencil,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'

// ── Sample PIM data(inferred from Figma node names — plausible CPIM product master fields) ──

interface ProductCombinationRow {
  id: string
  familyName: string
  groupName: string
  customerProductName: string
  combinationStatus: 'Active' | 'Pending' | 'EOL'
  topDieTm6: string
  topDieUsage: string
  lsiTm6: string
  lsiUsage: string
  ipdTm6: string
  ipdUsage: string
  memoryGeneration: string
}

const STATUS: ProductCombinationRow['combinationStatus'][] = ['Active', 'Pending', 'EOL']
const MEMORY_GEN = ['LPDDR4X', 'LPDDR5', 'LPDDR5X', 'HBM3']

function generateRows(count: number): ProductCombinationRow[] {
  return Array.from({ length: count }, (_, i) => {
    const n = 100 + i
    return {
      id: `GB${n}`,
      familyName: `Good burger ${n}`,
      groupName: `GB-Group-${String(n).slice(-3)}`,
      customerProductName: `GB${1000 + i * 2}N8`,
      combinationStatus: STATUS[i % STATUS.length],
      topDieTm6: `TM6-${100 + (i % 7)}`,
      topDieUsage: `${60 + (i % 30)}%`,
      lsiTm6: `TM6-${200 + (i % 5)}`,
      lsiUsage: `${40 + (i % 40)}%`,
      ipdTm6: `TM6-${300 + (i % 9)}`,
      ipdUsage: `${50 + (i % 35)}%`,
      memoryGeneration: MEMORY_GEN[i % MEMORY_GEN.length],
    }
  })
}

const ALL_ROWS = generateRows(50)
const PAGE_SIZE = 20

const statusTagColor: Record<ProductCombinationRow['combinationStatus'], 'green' | 'amber' | 'neutral'> = {
  Active: 'green',
  Pending: 'amber',
  EOL: 'neutral',
}

const colHelper = createColumnHelper<ProductCombinationRow>()

const columns: ColumnDef<ProductCombinationRow, any>[] = [
  colHelper.accessor('familyName', { header: 'Product Family Name', meta: { type: 'string', width: 140, minWidth: 120 } }),
  colHelper.accessor('groupName', { header: 'Product Group Name', meta: { type: 'string', width: 130, minWidth: 110 } }),
  colHelper.accessor('customerProductName', { header: 'Customer Product Name', meta: { type: 'string', width: 150, minWidth: 130 } }),
  colHelper.accessor('combinationStatus', {
    header: 'Product Combination Status',
    meta: { type: 'select', width: 160 },
    cell: (ctx) => <Tag color={statusTagColor[ctx.getValue()]} size="sm">{ctx.getValue()}</Tag>,
  }),
  colHelper.accessor('topDieTm6', { header: 'Top Die TM6', meta: { type: 'string', width: 120 } }),
  colHelper.accessor('topDieUsage', { header: 'Top Die Usage', meta: { type: 'string', width: 110 } }),
  colHelper.accessor('lsiTm6', { header: 'LSI TM6', meta: { type: 'string', width: 110 } }),
  colHelper.accessor('lsiUsage', { header: 'LSI Usage', meta: { type: 'string', width: 110 } }),
  colHelper.accessor('ipdTm6', { header: 'IPD TM6', meta: { type: 'string', width: 110 } }),
  colHelper.accessor('ipdUsage', { header: 'IPD Usage', meta: { type: 'string', width: 110 } }),
  colHelper.accessor('memoryGeneration', { header: 'Memory Generation', meta: { type: 'select', width: 140 } }),
  {
    id: 'action',
    header: 'Action',
    meta: { width: 80 },
    cell: ({ row, table }) => (
      // @layout-space-magic-ok: gap-1(4px) icon-button cluster — non-spacing context, same role as item-anatomy inline-action group
      <div className="flex items-center gap-1">
        <Button
          variant="text"
          size="sm"
          iconOnly
          startIcon={Pencil}
          aria-label="編輯"
          onClick={() => (table.options.meta as { onEditRow?: (id: string) => void } | undefined)?.onEditRow?.(row.original.id)}
        />
        <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多操作" />
      </div>
    ),
  },
]

// ── Sidebar(icon-collapsed rail — 3 nav items, Product Information active) ──

const NAV = [
  { id: 'family', label: 'Product Family', icon: LayoutGrid },
  { id: 'info', label: 'Product Information', icon: Boxes },
  { id: 'combination', label: 'Product Combination', icon: GitMerge },
] as const

function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarMenu>
          {NAV.map(({ id, label, icon }) => (
            <SidebarMenuItem key={id}>
              <SidebarMenuButton id={id} startIcon={icon} tooltip={label}>
                {label}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  )
}

// ── Global header(top bar — hamburger + CPIM logo + title + bell + avatar) ──

function GlobalHeader() {
  return (
    <ChromeHeader className="bg-surface">
      <Button variant="text" size="sm" iconOnly startIcon={Menu} aria-label="切換選單" />
      {/* @layout-space-magic-ok: gap-2(8px) 規則 5 — avatar+title 同組 value 緊密度 */}
      <div className="flex items-center gap-2 min-w-0">
        <Avatar alt="CPIM" size={28} shape="square" color="indigo" solid>
          CP
        </Avatar>
        <h1 className="text-body-lg font-medium truncate">Customer Product Information Master</h1>
      </div>
      <div className="flex-1" />
      <div className="relative">
        <Button variant="text" size="sm" iconOnly startIcon={Bell} aria-label="通知" />
        <Badge variant="critical" className="absolute -top-0.5 -right-0.5" />
      </div>
      {/* @layout-space-magic-ok: gap-2(8px) 規則 5 — avatar+name+chevron 同組 value 緊密度 */}
      <div className="flex items-center gap-2">
        <Avatar alt="Jake Thompson" size={28} color="blue" />
        <span className="text-body truncate">Jake Thompson</span>
        <ChevronDown size={16} aria-hidden />
      </div>
    </ChromeHeader>
  )
}

// ── Page header(breadcrumb + title + actions + list/tree view switcher) ──

function PageHeader({ view, onViewChange }: { view: string; onViewChange: (v: string) => void }) {
  return (
    <ChromeHeader className="bg-surface">
      <SidebarTrigger />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#">Customer List</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>U337 | U337_ShortName</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex-1" />
      <SegmentedControl iconOnly size="sm" value={view} onValueChange={onViewChange}>
        <SegmentedControlItem value="list" startIcon={List} aria-label="列表視圖" />
        <SegmentedControlItem value="tree" startIcon={GitBranch} aria-label="樹狀視圖" />
      </SegmentedControl>
      <Button variant="secondary" size="sm" startIcon={Upload}>
        Upload
      </Button>
      <Button variant="primary" size="sm" startIcon={Plus}>
        Add New
      </Button>
    </ChromeHeader>
  )
}

// ── Pagination footer(no DS pagination component exists — hand-built from Button + Select) ──

function PaginationFooter({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] border-t border-divider">
      <span className="text-body text-fg-secondary">
        {from} - {to} of {total}
      </span>
      {/* @layout-space-magic-ok: gap-1(4px) pagination control cluster — non-spacing context, page pills hug like inline-action group */}
      <div className="flex items-center gap-1">
        <Button
          variant="text"
          size="sm"
          iconOnly
          startIcon={ChevronLeft}
          aria-label="上一頁"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        />
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
          <Button
            key={p}
            variant={p === page ? 'primary' : 'text'}
            size="sm"
            onClick={() => onPageChange(p)}
          >
            {p}
          </Button>
        ))}
        <Button
          variant="text"
          size="sm"
          iconOnly
          startIcon={ChevronRight}
          aria-label="下一頁"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
      <Select
        size="sm"
        className="w-[140px]"
        aria-label="每頁項目數"
        value={String(pageSize)}
        onChange={(v) => onPageSizeChange(Number(v))}
        options={[10, 20, 50].map((size) => ({ value: String(size), label: `${size} Items/Page` }))}
      />
    </div>
  )
}

// ── Right detail panel(inline AppShellAside — Product group information / edit form) ──

function ProductGroupPanel({ row, onClose }: { row: ProductCombinationRow; onClose: () => void }) {
  return (
    <AppShellAside title="Product group">
      <div className="flex items-center justify-between px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] border-b border-divider">
        <h2 className="text-body-lg font-medium">Product group</h2>
        <Button variant="text" size="sm" iconOnly startIcon={X} aria-label="關閉" onClick={onClose} />
      </div>
      <Tabs defaultValue="information">
        <TabsList className="px-[var(--layout-space-loose)]">
          <TabsTrigger value="information">Information</TabsTrigger>
          <TabsTrigger value="history">Change History</TabsTrigger>
        </TabsList>
        {/* space-y → 規則 3 跨範疇 parallel(兩獨立 form section)= loose(24px) */}
        <TabsContent value="information" className="px-[var(--layout-space-loose)] space-y-[var(--layout-space-loose)]">
          {/* space-y → 規則 3 跨範疇直接 functional(heading → labeled content)= tight(12px) */}
          <section className="space-y-[var(--layout-space-tight)]">
            {/* @layout-space-magic-ok: gap-2(8px) 規則 5 — accent-bar+heading+link 同組 value 緊密度 */}
            <div className="flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-[var(--color-primary-3)]" />
              <h3 className="text-body font-medium">Product family</h3>
              <Button variant="link" size="sm" className="ml-auto">
                View detail
              </Button>
            </div>
            {/* @layout-space-magic-ok: gap-3(12px) 規則 5 — dl grid 同組欄位緊密度,等同 layout-space-tight 數值 */}
            <dl className="grid grid-cols-2 gap-3 text-body">
              <div>
                <dt className="text-fg-secondary text-caption">Family name</dt>
                <dd>{row.familyName}</dd>
              </div>
              <div>
                <dt className="text-fg-secondary text-caption">Status</dt>
                <dd>
                  <Tag color={statusTagColor[row.combinationStatus]} size="sm">{row.combinationStatus}</Tag>
                </dd>
              </div>
            </dl>
          </section>
          <section className="space-y-[var(--layout-space-tight)]">
            {/* @layout-space-magic-ok: gap-2(8px) 規則 5 — accent-bar+heading+link 同組 value 緊密度 */}
            <div className="flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-[var(--color-primary-3)]" />
              <h3 className="text-body font-medium">Product group</h3>
              <Button variant="link" size="sm" className="ml-auto">
                View detail
              </Button>
            </div>
            {/* @layout-space-magic-ok: gap-3(12px) 規則 5 — dl grid 同組欄位緊密度,等同 layout-space-tight 數值 */}
            <dl className="grid grid-cols-2 gap-3 text-body">
              <div>
                <dt className="text-fg-secondary text-caption">Group name</dt>
                <dd>{row.groupName}</dd>
              </div>
              <div>
                <dt className="text-fg-secondary text-caption">Customer product name</dt>
                <dd>{row.customerProductName}</dd>
              </div>
              <div>
                <dt className="text-fg-secondary text-caption">Memory generation</dt>
                <dd>{row.memoryGeneration}</dd>
              </div>
            </dl>
          </section>
          {/* 規則 4:最後內容 → 容器底,後接 action button → bottom(48px) */}
          {/* @layout-space-magic-ok: gap-2(8px) 規則 5 — Reset/Submit button pair 同組 value 緊密度 */}
          <div className="flex justify-end gap-2 pt-[var(--layout-space-bottom)] border-t border-divider">
            <Button variant="secondary" size="md">
              Reset
            </Button>
            <Button variant="primary" size="md">
              Submit Change
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="history" className="px-[var(--layout-space-loose)]">
          <p className="text-body text-fg-secondary">No change history yet.</p>
        </TabsContent>
      </Tabs>
    </AppShellAside>
  )
}

// ── Page content(rounded-pill segmented tab row + DataTable + pagination) ──

const SCOPE_TABS = [
  { value: 'family', label: 'Product Family' },
  { value: 'group', label: 'Product Group' },
  { value: 'combination', label: 'Product Combination' },
] as const

function ProductInformationPage() {
  const [scope, setScope] = useState<string>('combination')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [selectedRow, setSelectedRow] = useState<ProductCombinationRow | null>(null)

  const pageCount = Math.ceil(ALL_ROWS.length / pageSize)
  const pageRows = useMemo(
    () => ALL_ROWS.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize]
  )

  return (
    <div className="flex h-full flex-col">
      <div className="px-[var(--layout-space-loose)] pt-[var(--layout-space-tight)]">
        <SegmentedControl value={scope} onValueChange={setScope}>
          {SCOPE_TABS.map((t) => (
            <SegmentedControlItem key={t.value} value={t.value}>
              {t.label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </div>
      <div className="flex-1 min-h-0 px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
        <DataTable
          columns={columns}
          data={pageRows}
          height="auto"
          getRowId={(row) => row.id}
          pinnedLeftColumns={['familyName', 'groupName', 'customerProductName']}
          pinnedRightColumns={['action']}
          selectable="single"
          selection={selectedRow ? [selectedRow.id] : []}
          onSelectionChange={(ids) => setSelectedRow(ALL_ROWS.find((r) => r.id === ids[0]) ?? null)}
          tableOptions={{ meta: { onEditRow: (id: string) => setSelectedRow(ALL_ROWS.find((r) => r.id === id) ?? null) } }}
        />
      </div>
      <PaginationFooter
        page={page}
        pageCount={pageCount}
        total={ALL_ROWS.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
      />
      {selectedRow && <ProductGroupPanel row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </div>
  )
}

export default function App() {
  const [activeId, setActiveId] = useState('info')
  const [view, setView] = useState('list')

  return (
    <TooltipProvider delayDuration={500} skipDelayDuration={300}>
      <SidebarProvider activeId={activeId} onActiveChange={setActiveId}>
        <AppShell
          layout="primary-header"
          globalHeader={<GlobalHeader />}
          sidebar={<AppSidebar />}
          header={<PageHeader view={view} onViewChange={setView} />}
        >
          <ProductInformationPage />
        </AppShell>
      </SidebarProvider>
    </TooltipProvider>
  )
}

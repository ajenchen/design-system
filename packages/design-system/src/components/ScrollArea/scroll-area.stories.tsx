// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#NumberAlignment
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { ScrollArea, ScrollBar } from './scroll-area'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types' // ColumnMeta declaration merging

const meta: Meta = {
  title: 'Design System/Components/ScrollArea/展示',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Data ──────────────────────────────────────────────────────────────────────

// Linear-style issue list
const LINEAR_ISSUES: Array<{ id: string; title: string; status: string; assignee: string }> = [
  { id: 'ENG-1204', title: 'DataTable 水平捲動在 Windows 跑版 17px', status: 'In Progress', assignee: 'Alice Chen' },
  { id: 'ENG-1203', title: 'Sheet body 長內容捲動時標題浮動行為不一致', status: 'In Review', assignee: 'Bob Liu' },
  { id: 'DES-872', title: 'Sidebar 深色模式 hover 色與 active 色太接近', status: 'Todo', assignee: 'Carol Wang' },
  { id: 'ENG-1199', title: 'PeoplePicker 選中多人後換行邏輯錯誤', status: 'In Progress', assignee: 'David Kuo' },
  { id: 'ENG-1198', title: 'Combobox 鍵盤 arrow 導覽跳過 disabled option', status: 'Done', assignee: 'Eve Lin' },
  { id: 'DES-870', title: 'Toast 在 dark mode 與 Dialog 疊層時色階不夠', status: 'Todo', assignee: 'Frank Ho' },
  { id: 'ENG-1195', title: 'DatePicker 時區 UTC+0 下一日顯示錯誤', status: 'Backlog', assignee: 'Grace Tsai' },
  { id: 'ENG-1192', title: 'Tabs 在小螢幕水平溢出時箭頭 hit area 太窄', status: 'In Progress', assignee: 'Henry Wu' },
  { id: 'DES-865', title: 'Typography scale 在 1.2x 密度下 body-lg 與 h3 過近', status: 'In Review', assignee: 'Ivy Chang' },
  { id: 'ENG-1188', title: 'Tooltip delay 全站預設值從 0ms 調回 300ms', status: 'Done', assignee: 'Jack Lee' },
  { id: 'ENG-1185', title: 'DropdownMenu nested submenu 在 RTL 定位錯誤', status: 'Todo', assignee: 'Kate Lin' },
  { id: 'ENG-1183', title: 'Slider 拖曳時 thumb 偏移半個像素(視覺毛邊)', status: 'In Progress', assignee: 'Leo Hsu' },
]

// Notion-style sidebar nav
const NOTION_NAV = [
  { section: 'Private', items: ['Getting Started', 'Daily journal', 'Reading list', 'Recipes', 'Weekend projects', 'Japan 2026 trip'] },
  { section: 'Workspace', items: ['Engineering wiki', 'Design system spec', 'Meeting notes', 'Roadmap Q2', 'Incident retrospectives', 'Onboarding docs'] },
  { section: 'Shared', items: ['Product handbook', 'Brand guidelines', 'Customer interviews', 'Competitive analysis', 'Press & media kit'] },
]

// Stripe-style wide product table (triggers horizontal scroll)
const STRIPE_PRODUCTS: Array<{ sku: string; name: string; category: string; stock: number; price: string; margin: string; channel: string; status: string }> = [
  { sku: 'PRO-001', name: 'Stripe Atlas 新創設立方案', category: 'Incorporation', stock: 128, price: '$500.00', margin: '42%', channel: 'Direct', status: 'Active' },
  { sku: 'PRO-002', name: 'Stripe Radar 詐欺偵測加購', category: 'Add-on',        stock: 256, price: '$0.05/tx', margin: '78%', channel: 'Direct', status: 'Active' },
  { sku: 'PRO-003', name: 'Stripe Tax 自動稅額計算',     category: 'Compliance',   stock: 64,  price: '$0.50/tx', margin: '65%', channel: 'Partner', status: 'Active' },
  { sku: 'PRO-004', name: 'Stripe Connect 分潤平台帳號',   category: 'Platform',     stock: 32,  price: '$2/acct',  margin: '55%', channel: 'Direct', status: 'Beta'   },
  { sku: 'PRO-005', name: 'Stripe Issuing 實體卡發行',     category: 'Cards',        stock: 16,  price: '$3/card',  margin: '38%', channel: 'Partner', status: 'Active' },
  { sku: 'PRO-006', name: 'Stripe Climate 碳移除貢獻',     category: 'Sustainability', stock: 8,  price: '1% gross', margin: '—',  channel: 'Direct', status: 'Active' },
]

const STATUS_COLORS: Record<string, string> = {
  'In Progress': 'var(--info)',
  'In Review':   'var(--warning)',
  'Todo':        'var(--fg-muted)',
  'Done':        'var(--success)',
  'Backlog':     'var(--fg-muted)',
  'Active':      'var(--success)',
  'Beta':        'var(--info)',
}

// ── DataTable columns ─────────────────────────────────────────────────────────
// 消費真 <DataTable>(per data-table.spec.md「簡單展示場景也用 DataTable,不另外維護靜態 Table」)。
// ScrollArea 包 height="auto" DataTable = scroll-area.spec.md「Orientation」段 canonical 組合:
// 捲動完全由 ScrollArea own(DataTable 無高度約束 + min-w-max 不啟內部捲軸)。

type StripeProduct = (typeof STRIPE_PRODUCTS)[number]
const productCol = createColumnHelper<StripeProduct>()

const PRODUCT_COLUMNS = [
  productCol.accessor('sku', { header: 'SKU', meta: { type: 'string', width: 100 } }),
  productCol.accessor('name', { header: 'Product', meta: { type: 'string', width: 240 } }),
  productCol.accessor('category', { header: 'Category', meta: { type: 'string', width: 130 } }),
  productCol.accessor('stock', { header: 'Stock', meta: { type: 'number', width: 90 } }),
  productCol.accessor('price', { header: 'Price', meta: { type: 'string', align: 'right', width: 110 } }),
  productCol.accessor('margin', { header: 'Margin', meta: { type: 'string', align: 'right', width: 90 } }),
  productCol.accessor('channel', { header: 'Channel', meta: { type: 'string', width: 100 } }),
  productCol.accessor('status', {
    header: 'Status',
    meta: { width: 110 },
    cell: (info) => (
      <span className="inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[info.getValue()] }} />
        {info.getValue()}
      </span>
    ),
  }),
]

interface PullRequest {
  id: string
  title: string
  author: string
  reviewer: string
  base: string
  compare: string
  checks: string
  additions: number
  deletions: number
}

const PR_TITLES = [
  'feat: ScrollArea overlay scrollbar for cross-OS consistency',
  'fix: DataTable pinned column shadow on horizontal scroll',
  'refactor: extract drag-visual SSOT for row + column reorder',
  'docs: clarify density vs size boundary in tokens README',
  'fix: Sheet body scroll chain forwards flex-col h-full',
  'feat: Combobox keyboard navigation skips disabled options',
]

const PR_AUTHORS = ['@alice-chen', '@bob-liu', '@carol-wang', '@david-kuo', '@eve-lin', '@frank-ho']

const PULL_REQUESTS: PullRequest[] = Array.from({ length: 18 }, (_, i) => ({
  id: `#${4210 - i}`,
  title: PR_TITLES[i % PR_TITLES.length],
  author: PR_AUTHORS[i % PR_AUTHORS.length],
  reviewer: `${PR_AUTHORS[(i + 1) % PR_AUTHORS.length]}, ${PR_AUTHORS[(i + 2) % PR_AUTHORS.length]}`,
  base: 'main',
  compare: 'feat/scroll-area',
  checks: '12 / 12 passing',
  additions: 128 + i * 7,
  deletions: 24 + i * 3,
}))

const prCol = createColumnHelper<PullRequest>()

const PR_COLUMNS = [
  prCol.accessor('id', { header: '#', meta: { type: 'string', width: 90 } }),
  prCol.accessor('title', { header: 'Title', meta: { type: 'string', width: 360 } }),
  prCol.accessor('author', { header: 'Author', meta: { type: 'string', width: 130 } }),
  prCol.accessor('reviewer', { header: 'Reviewer', meta: { type: 'string', width: 190 } }),
  prCol.accessor('base', { header: 'Base', meta: { type: 'string', width: 90 } }),
  prCol.accessor('compare', { header: 'Compare', meta: { type: 'string', width: 150 } }),
  prCol.accessor('checks', {
    header: 'Checks',
    meta: { width: 140 },
    cell: (info) => (
      <span className="inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
        {info.getValue()}
      </span>
    ),
  }),
  prCol.accessor('additions', {
    header: 'Additions',
    meta: { width: 110, align: 'right' },
    cell: (info) => <span className="text-success">+{info.getValue()}</span>,
  }),
  prCol.accessor('deletions', {
    header: 'Deletions',
    meta: { width: 110, align: 'right' },
    cell: (info) => <span className="text-error">-{info.getValue()}</span>,
  }),
]

// ── Stories ───────────────────────────────────────────────────────────────────

export const VerticalIssueList: Story = {
  name: '垂直捲動 — Linear 議題清單',
  render: () => (
    <div className="max-w-xl">
      <p className="text-caption text-fg-muted mb-3">
        長 issue 清單(12 筆),容器固定 320px 高。macOS / Windows 呈現一致,不吃寬度。
      </p>
      <ScrollArea className="h-[320px] border border-border rounded-lg">
        <div className="p-2">
          {LINEAR_ISSUES.map((issue) => (
            <div key={issue.id} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-neutral-hover cursor-pointer">
              <span className="text-caption font-mono text-fg-muted shrink-0 w-20">{issue.id}</span>
              <span className="text-body flex-1 truncate">{issue.title}</span>
              <span className="inline-flex items-center gap-1.5 text-footnote shrink-0">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[issue.status] }} />
                <span className="text-fg-secondary">{issue.status}</span>
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  ),
}

export const SidebarNav: Story = {
  name: '垂直捲動 — Notion 側欄 導覽',
  render: () => (
    <div className="w-[260px]">
      <p className="text-caption text-fg-muted mb-3">
        Sidebar 導覽區,多個群組項目超過可見高度。
      </p>
      <ScrollArea className="h-[400px] border border-border rounded-lg bg-canvas">
        <div className="p-3">
          {NOTION_NAV.map((group) => (
            <div key={group.section} className="mb-4">
              <div className="px-2 py-1 text-footnote text-fg-muted font-medium">{group.section}</div>
              {group.items.map((item) => (
                <div key={item} className="px-2 py-1.5 rounded-md text-body hover:bg-neutral-hover cursor-pointer truncate">
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  ),
}

export const HorizontalProductTable: Story = {
  name: '水平捲動 — Stripe 寬欄位商品表',
  render: () => (
    <div className="max-w-[640px]">
      <p className="text-caption text-fg-muted mb-3">
        8 欄商品表(SKU / Name / Category / Stock / Price / Margin / Channel / Status)欄寬總和超出
        640px 容器 → 用 <code className="font-mono text-footnote bg-muted px-1 rounded">orientation=&quot;horizontal&quot;</code> scrollbar。
        比 native 的優勢:Windows 不吃 17px,右邊 Status 欄不被裁切。
        表格本體消費真 DataTable(height=&quot;auto&quot; 無高度約束,捲動由 ScrollArea own)。
      </p>
      <ScrollArea className="border border-border rounded-lg">
        <div className="min-w-max">
          <DataTable columns={PRODUCT_COLUMNS} data={STRIPE_PRODUCTS} getRowId={(p) => p.sku} height="auto" bordered={false} />
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  ),
}

export const BothDirections: Story = {
  name: '雙向捲動 — GitHub PR 大型檢閱表',
  render: () => (
    <div className="max-w-[560px]">
      <p className="text-caption text-fg-muted mb-3">
        容器 560×280px、內容寬 &gt; 560、高 &gt; 280,同時渲染 vertical + horizontal scrollbar
        (wrapper 已內建 vertical,consumer 只需再渲染一個 horizontal,見 scroll-area.spec.md「Orientation」)。
        表格本體消費真 DataTable(height=&quot;auto&quot;,雙向捲動完全由 ScrollArea own)。
      </p>
      <ScrollArea className="h-[280px] border border-border rounded-lg">
        <div className="min-w-max">
          <DataTable columns={PR_COLUMNS} data={PULL_REQUESTS} getRowId={(pr) => pr.id} height="auto" bordered={false} />
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  ),
}

// @story-baseline: packages/design-system/src/components/DataTable/data-table.anatomy.stories.tsx#AlignmentRule
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import React from 'react'
import { ScrollArea, ScrollBar } from './scroll-area'
import {
  SidebarProvider,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/design-system/components/Sidebar/sidebar'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types' // ColumnMeta declaration merging
import { STRIPE_PRODUCTS, PRODUCT_COLUMNS } from '@/design-system/stories-helpers/data/stripe-products'

const meta: Meta = {
  title: 'Design System/Components/ScrollArea/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: '為受限尺寸內容提供一致的自訂捲軸與可存取捲動區域。面板、選單或資料區必須在固定邊界內捲動時使用；整頁瀏覽仍交給瀏覽器。' } },
  },
}
export default meta
type Story = StoryObj

// ── Data ──────────────────────────────────────────────────────────────────────
// 稽核 L094 / M090:議題 / PR 改成一般產品的真實內容(原本全是這套 DS 自己的 bug);狀態欄改用 DataTable 的 select 欄 + Tag
//(column-types.ts `display: 'tag'`),不再手刻圓點 + inline 色;商品表與設計規格 / 設計原則頁共用 stories-helpers 那一份。

// 議題追蹤工具式 issue list
const LINEAR_ISSUES: Array<{ id: string; title: string; status: string }> = [
  { id: 'ENG-1204', title: '結帳頁信用卡欄位在 Safari 自動填入失效', status: 'In Progress' },
  { id: 'ENG-1203', title: '匯出 CSV 時中文欄名變成亂碼', status: 'In Review' },
  { id: 'DES-872', title: '儀表板圖表載入超過 5 秒,沒有載入狀態', status: 'Todo' },
  { id: 'ENG-1199', title: '邀請成員的信件被 Gmail 歸到垃圾郵件', status: 'In Progress' },
  { id: 'ENG-1198', title: '發票 PDF 金額沒有千分位', status: 'Done' },
  { id: 'DES-870', title: '訂閱方案降級後仍看得到進階報表', status: 'Todo' },
  { id: 'ENG-1195', title: '搜尋結果翻到第 2 頁後排序被重設', status: 'Backlog' },
  { id: 'ENG-1192', title: '密碼重設連結 24 小時才過期(應為 1 小時)', status: 'In Progress' },
  { id: 'DES-865', title: '切換工作區後通知鈴鐺的未讀數沒有更新', status: 'In Review' },
  { id: 'ENG-1188', title: 'SSO 登入後回到首頁,不是原本要開的頁面', status: 'Done' },
  { id: 'ENG-1185', title: '附件超過 25 MB 時沒有任何錯誤提示', status: 'Todo' },
  { id: 'ENG-1183', title: '時區設為 UTC+0 時排程日期少一天', status: 'In Progress' },
]

const ISSUE_STATUS_OPTIONS = [
  { value: 'Backlog', label: 'Backlog', tagVariant: 'neutral' },
  { value: 'Todo', label: 'Todo', tagVariant: 'neutral' },
  { value: 'In Progress', label: 'In Progress', tagVariant: 'blue' },
  { value: 'In Review', label: 'In Review', tagVariant: 'yellow' },
  { value: 'Done', label: 'Done', tagVariant: 'green' },
]

type Issue = (typeof LINEAR_ISSUES)[number]
const issueCol = createColumnHelper<Issue>()

const ISSUE_COLUMNS = [
  issueCol.accessor('id', { header: 'ID', meta: { type: 'string', width: 100 } }),
  issueCol.accessor('title', { header: 'Title', meta: { type: 'string', width: 330 } }),
  issueCol.accessor('status', { header: 'Status', meta: { type: 'select', options: ISSUE_STATUS_OPTIONS, display: 'tag', width: 130 } }),
]

// 文件工具式 sidebar nav
const NOTION_NAV = [
  { section: 'Private', items: ['Getting Started', 'Daily journal', 'Reading list', 'Recipes', 'Weekend projects', 'Japan 2026 trip'] },
  { section: 'Workspace', items: ['Engineering wiki', 'Design system spec', 'Meeting notes', 'Roadmap Q2', 'Incident retrospectives', 'Onboarding docs'] },
  { section: 'Shared', items: ['Product handbook', 'Brand guidelines', 'Customer interviews', 'Competitive analysis', 'Press & media kit'] },
]

// ── DataTable columns ─────────────────────────────────────────────────────────
// 消費真 <DataTable>(per data-table.spec.md「簡單展示也用 DataTable」:不維護第二個靜態 Table 元件)。
// ScrollArea 包 height="auto" DataTable = scroll-area.spec.md「Orientation」段 canonical 組合:
// 捲動完全由 ScrollArea own(DataTable 無高度約束 + min-w-max 不啟內部捲軸)。

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

const PR_SAMPLES = [
  { title: 'feat: 結帳頁支援 Apple Pay', branch: 'feat/checkout-apple-pay' },
  { title: 'fix: 匯出 CSV 中文欄名亂碼', branch: 'fix/csv-utf8-bom' },
  { title: 'refactor: 抽出訂單金額計算的共用函式', branch: 'refactor/order-total' },
  { title: 'docs: 補上 Webhook 重送機制說明', branch: 'docs/webhook-retry' },
  { title: 'fix: 搜尋翻頁後保留排序', branch: 'fix/search-sort-persist' },
  { title: 'feat: 邀請成員時可以指定預設角色', branch: 'feat/invite-default-role' },
]

const PR_AUTHORS = ['@alice-chen', '@bob-liu', '@carol-wang', '@david-kuo', '@eve-lin', '@frank-ho']

// CI 檢查結果:大多數通過,每 6 筆有 1 筆失敗、1 筆還在跑
const PR_CHECKS = ['passing', 'passing', 'failing', 'passing', 'pending', 'passing']

const PULL_REQUESTS: PullRequest[] = Array.from({ length: 18 }, (_, i) => ({
  id: `#${4210 - i}`,
  title: PR_SAMPLES[i % PR_SAMPLES.length].title,
  author: PR_AUTHORS[i % PR_AUTHORS.length],
  reviewer: `${PR_AUTHORS[(i + 1) % PR_AUTHORS.length]}, ${PR_AUTHORS[(i + 2) % PR_AUTHORS.length]}`,
  base: 'main',
  compare: PR_SAMPLES[i % PR_SAMPLES.length].branch,
  checks: PR_CHECKS[i % PR_CHECKS.length],
  additions: 128 + i * 7,
  deletions: 24 + i * 3,
}))

const CHECK_OPTIONS = [
  { value: 'passing', label: '12 / 12 passing', tagVariant: 'green' },
  { value: 'failing', label: '1 failing', tagVariant: 'red' },
  { value: 'pending', label: 'Running', tagVariant: 'yellow' },
]

const prCol = createColumnHelper<PullRequest>()

const PR_COLUMNS = [
  prCol.accessor('id', { header: '#', meta: { type: 'string', width: 90 } }),
  prCol.accessor('title', { header: 'Title', meta: { type: 'string', width: 360 } }),
  prCol.accessor('author', { header: 'Author', meta: { type: 'string', width: 130 } }),
  prCol.accessor('reviewer', { header: 'Reviewer', meta: { type: 'string', width: 190 } }),
  prCol.accessor('base', { header: 'Base', meta: { type: 'string', width: 90 } }),
  prCol.accessor('compare', { header: 'Compare', meta: { type: 'string', width: 200 } }),
  prCol.accessor('checks', { header: 'Checks', meta: { type: 'select', options: CHECK_OPTIONS, display: 'tag', width: 160 } }),
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
      <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">
        長 issue 清單(12 筆),容器固定 320px 高。macOS / Windows 呈現一致,不吃寬度。
      </p>
      {/* 議題清單直接用 DataTable(稽核 M090:原本每一列都是手刻 div + 手刻狀態圓點);捲動由外層 ScrollArea 擁有 */}
      <ScrollArea className="h-[320px] border border-border rounded-lg">
        <DataTable columns={ISSUE_COLUMNS} data={LINEAR_ISSUES} getRowId={(issue) => issue.id} height="auto" bordered={false} />
      </ScrollArea>
    </div>
  ),
}

export const SidebarNav: Story = {
  name: '垂直捲動 — Notion 側欄導覽',
  render: function SidebarNavStory() {
    const [activeId, setActiveId] = React.useState('Engineering wiki')
    return (
      <div className="w-[260px]">
        <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">
          Sidebar 導覽區,多個群組項目超過可見高度。
        </p>
        {/* 列是真的 Sidebar 列元件(SidebarGroup / SidebarMenu):群組間距、分隔線、列高都由元件擁有,不手抄列幾何。
            Sidebar 自己的 SidebarContent 內建的就是同一個 ScrollArea;這裡把同一組列放進獨立的 ScrollArea 示範捲動。
            SidebarProvider 只為了列元件需要的 context(作用中項目 / 列尺寸);它預設撐滿視窗高(min-h-svh,app 外殼用),這裡高度交給 ScrollArea */}
        <SidebarProvider activeId={activeId} onActiveChange={setActiveId} className="min-h-0">
          {/* 內容是一串自帶方向鍵的 SidebarMenu,捲動區本身不當 Tab 停靠點(scroll-area.spec.md:103,同 SidebarContent) */}
          <ScrollArea className="h-[400px] w-full border border-border rounded-lg bg-canvas" viewportTabIndex={-1}>
            {NOTION_NAV.map((group) => (
              <SidebarGroup key={group.section}>
                <SidebarGroupLabel>{group.section}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item}>
                        <SidebarMenuButton id={item}>{item}</SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </ScrollArea>
        </SidebarProvider>
      </div>
    )
  },
}

export const HorizontalProductTable: Story = {
  name: '水平捲動 — Stripe 寬欄位商品表',
  render: () => (
    <div className="max-w-[640px]">
      <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">
        8 欄商品表(SKU / Name / Category / Stock / Price / Margin / Channel / Status)欄寬總和超出
        640px 容器 → 用{' '}
        {/* @layout-space-magic-ok: 句子裡的行內 code 左右 4px —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 同值) */}
        <code className="font-mono text-footnote bg-muted px-1 rounded">orientation=&quot;horizontal&quot;</code> scrollbar。
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
      <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">
        容器 560×280px、內容寬 &gt; 560、高 &gt; 280,同時渲染 vertical + horizontal scrollbar
        (wrapper 已內建 vertical,consumer 只需再渲染一個 horizontal)。
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

// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable } from './data-table'
import './column-types'

const meta: Meta = {
  title: 'Design System/Components/DataTable/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3 max-w-4xl">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

interface Product {
  name: string
  category: string
  stock: string
  price: number
  available: boolean
  launchDate: string
}

const SAMPLE_DATA: Product[] = [
  { name: 'Wireless Headphones', category: 'electronics', stock: 'in_stock', price: 2490, available: true, launchDate: '2026-01-15' },
  { name: 'Office Chair', category: 'furniture', stock: 'low_stock', price: 8900, available: true, launchDate: '2025-11-02' },
  { name: 'Green Tea 100 Bags', category: 'food', stock: 'in_stock', price: 350, available: true, launchDate: '2026-03-20' },
  { name: 'USB-C Hub', category: 'electronics', stock: 'out_of_stock', price: 1290, available: false, launchDate: '2025-12-01' },
]

const STATUS_OPTIONS = [
  { value: 'in_stock', label: 'In stock', tagVariant: 'green' },
  { value: 'low_stock', label: 'Low stock', tagVariant: 'yellow' },
  { value: 'out_of_stock', label: 'Out of stock', tagVariant: 'red' },
]

const CATEGORY_OPTIONS = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'food', label: 'Food' },
]

// ── WhenToUse — 何時使用 DataTable ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 DataTable 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/DataTable/展示" name="數字靠右對齊"><span className="text-primary hover:underline font-medium cursor-pointer">商品庫存後台 — 單價 / 金額數字靠右對齊</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/DataTable/展示" name="自動行高"><span className="text-primary hover:underline font-medium cursor-pointer">商品備註長短不一 — 自動行高撐開列高</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/DataTable/展示" name="空狀態"><span className="text-primary hover:underline font-medium cursor-pointer">目錄尚無商品 — 空狀態引導新增</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* 何時不用 / 替代元件 — 原 WhenNotToUse */}
      <div>
      <Rule
        title="❌ 不用 DataTable 顯示 key-value 屬性列表"
        note="DataTable 是多 row 集合語義。單一實體的屬性應用 DescriptionList（如用戶詳情頁面）。Jira issue detail page 的 5 個屬性用 DescriptionList，不用 Table"
      >
        <Label warn>改用 DescriptionList：項目名 / 狀態 / 優先級 / 指派人 / 建立日期</Label>
      </Rule>

      <Rule
        title="❌ 不用 DataTable 表達階層結構（部門 / 資料夾）"
        note="DataTable 是平面 row。階層結構（可展開收合）改用 TreeView。Notion 的資料庫可以 expand row，但階層樹用 TreeView"
      >
        <Label warn>階層結構用 TreeView，支援無限深度展開 / 收合</Label>
      </Rule>

      <Rule
        title="❌ 不用 DataTable 做超過 3 層的巢狀分組"
        note="DataTable 的分組能力有限。需要複雜群組 header + 合併 cell → 用自訂 grid 或引入 AG Grid。Stripe billing 的 invoices 表最多 2 層分組"
      >
        <Label warn>複雜分組用自訂 layout 或專門 grid library</Label>
      </Rule>

      <Rule
        title="❌ 不用 DataTable 做試算表（公式、跨 cell 選取）"
        note="DataTable 是資料展示，不支援 Excel 功能。需要試算表能力 → AG Grid Enterprise / Handsontable。Airtable 確實像表，但 DataTable 不是設計來做這個"
      >
        <Label warn>試算表功能用專門 library，不往 DataTable 塞</Label>
      </Rule>
    </div>
    </div>
  ),
}

export const ColumnTypeRule: Story = {
  name: '用 欄類型 自動渲染,不手寫 儲存格',
  render: () => {
    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'Product', meta: { type: 'string', width: 180 } }),
      col.accessor('category', { header: 'Category', meta: { type: 'select', options: CATEGORY_OPTIONS, width: 140 } }),
      col.accessor('stock', { header: 'Stock', meta: { type: 'select', options: STATUS_OPTIONS, width: 140 } }),
      col.accessor('price', { header: 'Price', meta: { type: 'currency', prefix: '$', width: 120 } }),
      col.accessor('available', { header: 'Available', meta: { type: 'boolean', width: 100 } }),
      col.accessor('launchDate', { header: 'Launch', meta: { type: 'date', width: 130 } }),
    ]
    return (
      <div>
        <Rule
          title="✅ 宣告 `meta.type`,DataTable 自動選對應 Display"
          note="每個 Field Control 的 `mode='display'` 渲染(`<Input mode='display'>` / `<NumberInput mode='display'>` / `<Checkbox mode='display'>` 等)是該資料類型的唯一真實來源——format 邏輯、對齊、null 顯示都住一份。Consumer 只需宣告 type,不需重複造輪子"
        >
          <DataTable columns={columns} data={SAMPLE_DATA} height="auto" />
        </Rule>

        <Rule
          title="❌ 手寫 cell render 自訂格式化"
          note="每 column 自己寫 `cell: (info) => ...` 會繞過 `mode='display'` 系統——**格式化邏輯會漂移**。一個 table 的 price 顯示「$2,490」,另一個 table 的 price 顯示「2490」,一個 boolean 顯示「✓」,另一個 boolean 顯示「是」——整個系統 format 失去一致性"
        >
          <Label warn>除非真的需要 `mode='display'` 無法提供的客製視覺,否則一律走 meta.type 系統。客製化時完全跳過 type 讓 display 渲染不要干預</Label>
        </Rule>

        <Rule
          title="擴充新 type:到 column-types.ts 註冊"
          note="新增資料類型(如 `percentage`、`relative-time`)在 `column-types.ts` 註冊 renderDisplay + align,自動跟所有 DataTable 整合。不在單一 table 硬寫"
        >
          <Label>讓 column type 系統成為 single source of truth,所有 table 受惠同一次更新</Label>
        </Rule>
      </div>
    )
  },
}

// Retired 2026-05-16 audit Dim 24:`AlignmentRule` 跟 anatomy.stories.tsx:250 重複(同 column-type 對齊規則 + ❌ anti-pattern + 對照 table)。
// Anatomy 是「視覺結構規則」 canonical home(per story-rules.md 三層分工);principles 該住 WhenToUse / WhenNotToUse / Vs近親,
// 對齊規則屬結構 rule 不該重複出現。Retire principles 版,anatomy 版保留。

export const VirtualScrollRule: Story = {
  name: '虛擬捲動時機',
  render: () => {
    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'Product', meta: { type: 'string', width: 200 } }),
      col.accessor('category', { header: 'Category', meta: { type: 'select', options: CATEGORY_OPTIONS, width: 140 } }),
      col.accessor('price', { header: 'Price', meta: { type: 'currency', prefix: '$', width: 120 } }),
    ]
    const bigData = Array.from({ length: 500 }, (_, i) => ({
      name: `Product ${String(i + 1).padStart(4, '0')}`,
      category: CATEGORY_OPTIONS[i % CATEGORY_OPTIONS.length].value,
      stock: 'in_stock',
      price: Math.round(Math.random() * 10000),
      available: i % 3 !== 0,
      launchDate: '2026-04-18',
    }))
    return (
      <div>
        <Rule
          title="height='auto' — 少量資料(< 50 筆),全部渲染"
          note="資料量小,全渲染比 virtualizer 簡單。沒有固定高度,table 自然撐開,頁面捲動即可"
        >
          <DataTable columns={columns} data={SAMPLE_DATA} height="auto" />
          <Label>↑ 4 筆資料無需虛擬捲動</Label>
        </Rule>

        <Rule
          title="固定 height 數字 — 大量資料(> 100 筆),啟用 virtualization"
          note="傳固定高度時 TanStack Virtual 自動啟用——只渲染可見 rows。500 筆資料只渲染 ~20 rows,效能不受資料量影響"
        >
          <DataTable columns={columns} data={bigData} height="400px" />
          <Label>↑ 500 筆資料,固定 400px 高度 → virtualizer 只渲染畫面中的 ~20 rows</Label>
        </Rule>

        <Rule
          title="❌ 100+ 筆資料用 height='auto'"
          note="全部 DOM 渲染 → 初始 render 慢、滾動 janky、記憶體吃緊。當資料規模會大時用固定 height 啟用 virtualization"
        >
          <Label warn>判斷法:資料筆數會穩定超過 50 就用固定 height</Label>
        </Rule>
      </div>
    )
  },
}

export const EmptyStateRule: Story = {
  name: '空 / 錯誤 / 載入中 的對應元件',
  render: () => {
    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'Product', meta: { type: 'string', width: 200 } }),
      col.accessor('price', { header: 'Price', meta: { type: 'currency', prefix: '$', width: 120 } }),
    ]
    return (
      <div>
        <Rule
          title="✅ 無資料 → 消費 Empty primitive(跟系統統一)"
          note="DataTable empty state 走共用 `Empty` 元件——保持跟 SelectMenu / Combobox / Page section 視覺一致。Consumer 不自訂,自動顯示標準空狀態"
        >
          <DataTable columns={columns} data={[]} height="auto" />
          <Label>↑ DataTable 內部自動消費 Empty primitive</Label>
        </Rule>

        <Rule
          title="❌ 自訂 empty 視覺"
          note="每個 table 各自寫「沒有資料」的 UI → 系統內空狀態視覺漂移(一個 table icon、一個 table 純文字、一個 table 大紫色插畫)。統一走 Empty primitive"
        >
          <Label warn>Empty primitive 有 icon / title / description / action 4 個 slot 可客製,足夠各種空狀態需求</Label>
        </Rule>

        <Rule
          title="Loading / Error 不是 DataTable 的職責"
          note="載入中 → consumer 在 table 外層顯示 CircularProgress / Skeleton。載入失敗 → consumer 顯示 Alert。DataTable 只處理「確定有 column + 有 data(或沒 data)」的情境,不處理生命週期"
        >
          <Label>判斷法:「我知道 data 是什麼嗎?」知道 → 傳給 DataTable;還在載 → 外面 Skeleton;載失敗 → 外面 Alert</Label>
        </Rule>
      </div>
    )
  },
}

export const NotSpreadsheetRule: Story = {
  name: '不是試算表',
  render: () => (
    <div>
      <Rule
        title="DataTable 預設不做公式計算、不做跨 cell 選取"
        note="DataTable 的心智模型是「結構化資料展示」——每筆資料是一 row,每個屬性是一 column。預設不做:Excel 的公式、跨 cell range selection(Ctrl+drag)、cell clipboard paste、pivot、跨欄運算。**逃生門**:確需 Excel-like 編輯可 opt-in `spreadsheetMode` prop(Shift+click range + 方向鍵 cell 導覽 + cell editing;仍不做公式計算),對齊 spec.md L28。"
      >
        <Label>需要試算表能力 → 用專門 library(AG Grid Enterprise / Handsontable / Luckysheet),不往 DataTable 塞</Label>
      </Rule>

      <Rule
        title="❌ 強行在 DataTable 加試算表功能"
        note="使用者看到 table UI 會建立「這是 spreadsheet」的預期,結果發現不能 Ctrl+click 多選、沒有 formula bar——預期落空,體驗差。DataTable 視覺刻意不像 spreadsheet(圓角、捨棄格線),避免這個誤解"
      >
        <Label warn>邊界清楚比功能多重要——DataTable 做資料展示做到 100 分,試算表交給其他 library</Label>
      </Rule>
    </div>
  ),
}


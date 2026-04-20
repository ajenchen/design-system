import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable } from './data-table'
import './column-types'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/components/_anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/DataTable/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Sample data ────────────────────────────────────────────────────────────

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
  { name: 'Linen Shirt', category: 'clothing', stock: 'in_stock', price: 1580, available: true, launchDate: '2026-02-14' },
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
  { value: 'clothing', label: 'Clothing' },
]

// ── Stories ────────────────────────────────────────────────────────────────

export const Overview: Story = {
  name: '元件總覽',
  render: () => {
    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'Product', size: 200, meta: { type: 'string' } }),
      col.accessor('category', { header: 'Category', size: 140, meta: { type: 'select', options: CATEGORY_OPTIONS } }),
      col.accessor('stock', { header: 'Stock', size: 140, meta: { type: 'select', options: STATUS_OPTIONS } }),
      col.accessor('price', { header: 'Price', size: 120, meta: { type: 'currency', prefix: '$' } }),
      col.accessor('available', { header: 'Available', size: 100, meta: { type: 'boolean' } }),
      col.accessor('launchDate', { header: 'Launch', size: 140, meta: { type: 'date' } }),
    ]

    return (
      <div className="flex flex-col gap-10">
        <div>
          <H3>Anatomy</H3>
          <Desc>DataTable 基於 TanStack Table,透過 `meta.type` column type 系統自動套用對應 Field Control 的 Display 子元件渲染 cell。底層用 `&lt;div&gt;` + ARIA role(不用語義 `&lt;table&gt;`)——虛擬捲動需要絕對定位 row,frozen column 需要獨立 scroll 區域,table 的佈局模型兩者都不支援。</Desc>
          <DataTable columns={columns} data={SAMPLE_DATA} height="auto" />
        </div>

        <div>
          <H3>層級架構</H3>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse">
              <thead><tr><Th>Level</Th><Th>責任</Th><Th>實作</Th></tr></thead>
              <tbody>
                <tr><Td>L1 Structure</Td><Td>DOM 結構 + 捲動行為</Td><Td mono>&lt;div&gt; + ARIA role="grid/row/cell" + useVirtualizer</Td></tr>
                <tr><Td>L2 Typography / Spacing</Td><Td>Row 高度 / Cell padding / 對齊</Td><Td mono>--table-row-* + --field-height-* token</Td></tr>
                <tr><Td>L3 Cell Rendering</Td><Td>根據 meta.type 自動選 Display 元件</Td><Td mono>column-types.ts 註冊 text/number/currency/date/select/boolean/person/link</Td></tr>
                <tr><Td>L4 Interactions</Td><Td>排序 / 選取 / 欄位拖動 / frozen column</Td><Td>TanStack Table features + 自訂 state</Td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  },
}

export const ColumnTypes: Story = {
  name: 'Column Type 自動渲染',
  render: () => {
    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'text', size: 200, meta: { type: 'string' } }),
      col.accessor('price', { header: 'currency', size: 120, meta: { type: 'currency', prefix: '$' } }),
      col.accessor('stock', { header: 'select(Tag)', size: 140, meta: { type: 'select', options: STATUS_OPTIONS } }),
      col.accessor('available', { header: 'boolean(✓/—)', size: 100, meta: { type: 'boolean' } }),
      col.accessor('launchDate', { header: 'date', size: 140, meta: { type: 'date' } }),
    ]

    return (
      <div className="flex flex-col gap-8">
        <div>
          <H3>meta.type 系統</H3>
          <Desc>每個 column 透過 `meta.type` 宣告資料類型,DataTable 自動選擇對應 Field Control 的 Display 子元件渲染——消費者不需要手寫 cell。</Desc>
          <DataTable columns={columns} data={SAMPLE_DATA} height="auto" />
        </div>

        <div>
          <H3>支援的 Column Types</H3>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse">
              <thead><tr><Th>meta.type</Th><Th>Display 元件</Th><Th>對齊</Th><Th>典型場景</Th></tr></thead>
              <tbody>
                <tr><Td mono>text</Td><Td mono>InputDisplay</Td><Td>left</Td><Td>姓名、title、slug</Td></tr>
                <tr><Td mono>number</Td><Td mono>NumberInputDisplay</Td><Td>right</Td><Td>數量、年齡</Td></tr>
                <tr><Td mono>currency</Td><Td mono>NumberInputDisplay(+ prefix)</Td><Td>right</Td><Td>金額、價格</Td></tr>
                <tr><Td mono>date</Td><Td mono>DatePickerDisplay</Td><Td>left</Td><Td>日期、時間戳</Td></tr>
                <tr><Td mono>boolean</Td><Td mono>BooleanDisplay(✓ / —)</Td><Td>center</Td><Td>啟用 / 可見</Td></tr>
                <tr><Td mono>select</Td><Td mono>SelectDisplay(Tag)</Td><Td>left</Td><Td>狀態、類別</Td></tr>
                <tr><Td mono>combobox</Td><Td mono>ComboboxDisplay(Tag 陣列)</Td><Td>left</Td><Td>多選 tags</Td></tr>
                <tr><Td mono>person</Td><Td mono>PersonDisplay / MultiPersonDisplay</Td><Td>left</Td><Td>指派者、reviewer</Td></tr>
                <tr><Td mono>link</Td><Td mono>LinkInputDisplay</Td><Td>left</Td><Td>URL</Td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-footnote text-fg-muted mt-3">擴充新 type:在 `column-types.ts` 註冊 `renderDisplay` + `align`,自動跟所有 DataTable 整合</p>
        </div>
      </div>
    )
  },
}

export const RowHeightMatrix: Story = {
  name: 'Row Height Tier(閱讀 vs 掃描模式)',
  render: () => {
    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'Product', size: 200, meta: { type: 'string' } }),
      col.accessor('category', { header: 'Category', size: 140, meta: { type: 'select', options: CATEGORY_OPTIONS } }),
      col.accessor('price', { header: 'Price', size: 120, meta: { type: 'currency', prefix: '$' } }),
    ]
    return (
      <div className="flex flex-col gap-8">
        <div>
          <H3>Row Height 三種 tier</H3>
          <Desc>依資料密度與閱讀需求選擇。Token 來自 `--table-row-*`(見 uiSize.spec.md)。</Desc>
          <div className="overflow-x-auto mb-4">
            <table className="text-caption border-collapse">
              <thead><tr><Th>Tier</Th><Th>高度</Th><Th>字體</Th><Th>適用</Th></tr></thead>
              <tbody>
                <tr><Td mono>compact(sm)</Td><Td mono>--table-row-compact</Td><Td>text-body</Td><Td>大量資料掃視(log、交易紀錄)</Td></tr>
                <tr><Td mono>cozy(md)★default</Td><Td mono>--table-row-cozy</Td><Td>text-body</Td><Td>一般業務資料</Td></tr>
                <tr><Td mono>comfortable(lg)</Td><Td mono>--table-row-comfortable</Td><Td>text-body-lg</Td><Td>詳情檢視、avatar 多的場景</Td></tr>
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-6">
            {(['sm', 'md', 'lg'] as const).map(size => (
              <div key={size}>
                <div className="text-caption text-fg-muted mb-2 font-mono">size="{size}"</div>
                <DataTable size={size} columns={columns} data={SAMPLE_DATA.slice(0, 3)} height="auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  },
}

export const AlignmentRule: Story = {
  name: '對齊規則(跨產業共識)',
  render: () => {
    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'Product(text)', size: 200, meta: { type: 'string' } }),
      col.accessor('price', { header: 'Price(currency)', size: 120, meta: { type: 'currency', prefix: '$' } }),
      col.accessor('stock', { header: 'Stock(select)', size: 120, meta: { type: 'select', options: STATUS_OPTIONS } }),
      col.accessor('available', { header: 'Available(boolean)', size: 100, meta: { type: 'boolean' } }),
    ]
    return (
      <div className="flex flex-col gap-8">
        <div>
          <H3>Column type 決定對齊(由 column-types.ts 定義,不讓 consumer 手動設)</H3>
          <Desc>數字靠右方便縱向比較位數(Excel / 會計軟體 / 財務系統共識);文字靠左方便閱讀;boolean 置中(symbol 視覺不偏向)。Consumer 不需要設 `align`,column type 就決定了。</Desc>
          <DataTable columns={columns} data={SAMPLE_DATA} height="auto" />
        </div>

        <div>
          <H3>對齊對照</H3>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse">
              <thead><tr><Th>資料類型</Th><Th>對齊</Th><Th>理由</Th></tr></thead>
              <tbody>
                <tr><Td>text / select / person / date / link</Td><Td mono>left</Td><Td>閱讀從左到右</Td></tr>
                <tr><Td>number / currency</Td><Td mono>right</Td><Td>縱向比較位數(小數點縱向對齊)</Td></tr>
                <tr><Td>boolean(✓ / —)</Td><Td mono>center</Td><Td>symbol 本身無方向性,中置對稱</Td></tr>
                <tr><Td>actions(在 cell 內的按鈕)</Td><Td mono>right</Td><Td>動線尾端,不干擾資料掃視</Td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-footnote text-fg-muted mt-3">❌ 不在 column 層級混用對齊策略——會破壞掃視節奏</p>
        </div>
      </div>
    )
  },
}

export const Features: Story = {
  name: '功能特性(排序 / 虛擬捲動)',
  render: () => {
    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'Product', size: 200, meta: { type: 'string' }, enableSorting: true }),
      col.accessor('category', { header: 'Category', size: 140, meta: { type: 'select', options: CATEGORY_OPTIONS } }),
      col.accessor('price', { header: 'Price', size: 120, meta: { type: 'currency', prefix: '$' }, enableSorting: true }),
    ]
    const virtualData = Array.from({ length: 500 }, (_, i) => ({
      name: `Product ${String(i + 1).padStart(4, '0')}`,
      category: CATEGORY_OPTIONS[i % CATEGORY_OPTIONS.length].value,
      stock: 'in_stock',
      price: Math.round(Math.random() * 10000),
      available: i % 3 !== 0,
      launchDate: '2026-04-18',
    }))
    return (
      <div className="flex flex-col gap-8">
        <div>
          <H3>排序(enableSorting)</H3>
          <Desc>Column 的 `enableSorting: true` 啟用排序。點擊 header 切換 asc / desc / none 三態,header 右側顯示 ChevronUp / ChevronDown 指示。</Desc>
          <DataTable columns={columns} data={SAMPLE_DATA} height="auto" />
        </div>

        <div>
          <H3>虛擬捲動(height 啟用)</H3>
          <Desc>傳 `height` 固定高度時自動啟用 TanStack Virtual——只渲染可見 rows。500 筆資料僅渲染 ~20 rows,效能不受資料量影響。</Desc>
          <div className="border border-border rounded-md">
            <DataTable columns={columns} data={virtualData} height="400px" />
          </div>
          <p className="text-footnote text-fg-muted mt-3">height="auto" 渲染全部 rows(適合 &lt; 50 筆);數字 height 啟用虛擬(適合 &gt; 100 筆)</p>
        </div>
      </div>
    )
  },
}

export const ColorMatrix: Story = {
  name: '色彩對照(header / row / cell 狀態)',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Header 色彩</H3>
        <Desc>
          Header 視為「structural UI」——不搶視覺,色調與 row bg 拉開一層區隔,讓使用者一眼辨識欄位名稱
          位置。Header text 用 fg-secondary(比 row value 淡),為 sticky 時仍清楚可見。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>區域</Th>
                <Th>Token</Th>
                <Th>角色</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>Header bg</Td>
                <Td><TokenCell token="--muted" display="muted" /></Td>
                <Td>比 surface 深一階,跟 row 拉開層次</Td>
              </tr>
              <tr>
                <Td>Header text</Td>
                <Td><TokenCell token="--fg-secondary" display="fg-secondary" /></Td>
                <Td>比 row text 淡,強調「這是標籤不是資料」</Td>
              </tr>
              <tr>
                <Td>Header border-bottom</Td>
                <Td><TokenCell token="--border" display="border" /></Td>
                <Td>區隔 header 與 body</Td>
              </tr>
              <tr>
                <Td>Sort icon(active)</Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td>排序中的欄位,icon 加深</Td>
              </tr>
              <tr>
                <Td>Sort icon(inactive hover)</Td>
                <Td><TokenCell token="--fg-secondary" display="fg-secondary" /></Td>
                <Td>Hover 可排序欄時出現的指示</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Row 狀態色彩</H3>
        <Desc>
          Row bg 由四個狀態決定:default / hover / selected / striped。Hover 用 neutral-hover
          (全系統互動高亮一致,跟 TreeView / MenuItem 同套 token)。Selected 用 primary-subtle 淡底色,
          提示「此 row 被挑出準備執行 bulk action」——不是「當前導航位置」(那是 neutral-selected)。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Row 狀態</Th>
                <Th>Background</Th>
                <Th>Text</Th>
                <Th>Border(底部)</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>default</Td>
                <Td><TokenCell token="--surface" display="surface" /></Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td><TokenCell token="--divider" display="divider(cell border)" /></Td>
              </tr>
              <tr>
                <Td mono>hover</Td>
                <Td><TokenCell token="--neutral-hover" display="neutral-hover" /></Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td><TokenCell token="--divider" display="divider" /></Td>
              </tr>
              <tr>
                <Td mono>selected(checkbox 勾選)</Td>
                <Td><TokenCell token="--primary-subtle" display="primary-subtle" /></Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td><TokenCell token="--divider" display="divider" /></Td>
              </tr>
              <tr>
                <Td mono>striped(zebra,可選)</Td>
                <Td><TokenCell token="--muted" display="muted(odd row)" /></Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td><TokenCell token="--divider" display="divider" /></Td>
              </tr>
              <tr>
                <Td mono>disabled row</Td>
                <Td><TokenCell token="--bg-disabled" display="bg-disabled" /></Td>
                <Td><TokenCell token="--fg-disabled" display="fg-disabled" /></Td>
                <Td><TokenCell token="--divider" display="divider" /></Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          selected 跟 hover 可並存(checkbox 勾選的 row,hover 仍有輕微 tint)。實際優先順序:
          `selected + hover` → primary-subtle 加深一點;仅 hover → neutral-hover;仅 selected → primary-subtle。
        </p>
      </div>

      <div>
        <H3>Cell 內 Display element 色彩</H3>
        <Desc>
          Cell 內的資料元件(Tag / Person / Link / NumberDisplay)各自維持 Field Controls 的 display 色彩。
          DataTable 不覆寫 cell 內的色彩 token,維持跨元件視覺統一。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>meta.type</Th>
                <Th>Display 色彩</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td mono>text / date / number / currency</Td><Td><TokenCell token="--foreground" /></Td></tr>
              <tr><Td mono>select(Tag)</Td><Td>Tag 的 variant 色(green / yellow / red / blue…)</Td></tr>
              <tr><Td mono>person</Td><Td>Avatar + foreground 文字</Td></tr>
              <tr><Td mono>link</Td><Td><TokenCell token="--primary" /></Td></tr>
              <tr><Td mono>boolean</Td><Td><TokenCell token="--fg-secondary" display="— / ✓ 均用 fg-secondary" /></Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const EmptyState: Story = {
  name: '空狀態',
  render: () => {
    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'Product', size: 200, meta: { type: 'string' } }),
      col.accessor('category', { header: 'Category', size: 140, meta: { type: 'select', options: CATEGORY_OPTIONS } }),
      col.accessor('price', { header: 'Price', size: 120, meta: { type: 'currency', prefix: '$' } }),
    ]
    return (
      <div>
        <H3>無資料時消費 Empty primitive</H3>
        <Desc>DataTable 的 empty state 走共用 `Empty` 元件——保持跟其他空狀態(SelectMenu、Combobox、Page section)視覺一致。Consumer 不需自訂,自動顯示標準空狀態。</Desc>
        <DataTable columns={columns} data={[]} height="auto" />
      </div>
    )
  },
}

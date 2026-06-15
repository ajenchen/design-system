// @anatomy-rationale:
//   SizeMatrix represented as RowHeightMatrix per row-density semantics —
//     DataTable 的 size 不是字級放大而是 row-height tier(compact / cozy /
//     comfortable),語意對應「掃描 vs 閱讀」資料密度而非元件大小。命名沿用
//     Linear / Notion / Airtable 業界共識(row density,非 component size)。
//   StateBehavior covered by ColorMatrix「Row 狀態色彩」段(default / hover /
//     selected / disabled)+ Features「排序」段。Row 互動是 row-level
//     而非元件 level,集中於 Row 色彩展示更直觀。
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable } from './data-table'
import './column-types'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

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
      col.accessor('name', { header: 'Product', meta: { type: 'string', width: 200 } }),
      col.accessor('category', { header: 'Category', meta: { type: 'select', options: CATEGORY_OPTIONS, width: 140 } }),
      col.accessor('stock', { header: 'Stock', meta: { type: 'select', options: STATUS_OPTIONS, width: 140 } }),
      col.accessor('price', { header: 'Price', meta: { type: 'currency', prefix: '$', width: 120 } }),
      col.accessor('available', { header: 'Available', meta: { type: 'boolean', width: 100 } }),
      col.accessor('launchDate', { header: 'Launch', meta: { type: 'date', width: 140 } }),
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
                <tr><Td>L1 Structure</Td><Td>DOM 結構 + 捲動行為</Td><Td mono>&lt;div&gt; + ARIA role="table/row/cell" + useVirtualizer</Td></tr>
                <tr><Td>L2 Typography / Spacing</Td><Td>Row 高度 / Cell padding / 對齊</Td><Td mono>--table-row-* + --field-height-* token</Td></tr>
                <tr><Td>L3 Cell Rendering</Td><Td>根據 meta.type 自動選 Display 元件</Td><Td mono>column-types.ts 註冊 string/number/currency/date/select/boolean/person/url</Td></tr>
                <tr><Td>L4 Interactions</Td><Td>排序 / 選取 / 欄位拖動 / frozen column</Td><Td>TanStack Table features + 自訂 state</Td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  },
}

// ── Inspector ─────────────────────────────────────────────────────────────

interface InspectorArgs {
  size: 'sm' | 'md' | 'lg'
  bordered: boolean
  pinnedLeft: boolean
  pinnedRight: boolean
  inlineEdit: boolean
  height: 'auto' | '300px'
}

export const Inspector: Story = {
  name: '元件檢閱器',
  parameters: {
    docs: {
      description: {
        story:
          '右側 Controls 切 DataTable props 即時 render,取代 Figma inspect。調整 `size` 看 row height tier 差異;`pinnedLeft` / `pinnedRight` 切換 frozen column 切出三區域(left / center / right);`height` 切換 auto 與固定(啟用虛擬捲動)。',
      },
    },
  },
  args: {
    size: 'md',
    bordered: true,
    pinnedLeft: true,
    pinnedRight: false,
    inlineEdit: false,
    height: 'auto',
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'sm=compact(掃視)/ md=cozy★default / lg=comfortable(閱讀)',
    },
    bordered: { control: 'boolean', description: '外框(嵌入已帶框容器時可設 false 避免雙重邊框)' },
    pinnedLeft: { control: 'boolean', description: 'Pin 產品名稱欄到左側,橫向捲動時保持可見' },
    pinnedRight: { control: 'boolean', description: 'Pin 上架日期欄到右側' },
    inlineEdit: { control: 'boolean', description: 'inline edit 視覺:cell 間加垂直分隔線 + select 欄顯示 chevron' },
    height: {
      control: 'select',
      options: ['auto', '300px'],
      description: 'auto=全渲染(少於 50 筆)/ 固定值=啟用 TanStack Virtual(多於 100 筆)',
    },
  },
  render: (args) => {
    const { size, bordered, pinnedLeft, pinnedRight, inlineEdit, height } = args as InspectorArgs
    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'Product', meta: { type: 'string', width: 200 } }),
      col.accessor('category', { header: 'Category', meta: { type: 'select', options: CATEGORY_OPTIONS, width: 140 } }),
      col.accessor('stock', { header: 'Stock', meta: { type: 'select', options: STATUS_OPTIONS, width: 140 } }),
      col.accessor('price', { header: 'Price', meta: { type: 'currency', prefix: '$', width: 120 } }),
      col.accessor('available', { header: 'Available', meta: { type: 'boolean', width: 100 } }),
      col.accessor('launchDate', { header: 'Launch', meta: { type: 'date', width: 140 } }),
    ]
    return (
      <DataTable
        columns={columns}
        data={SAMPLE_DATA}
        size={size}
        bordered={bordered}
        inlineEdit={inlineEdit}
        height={height}
        pinnedLeftColumns={pinnedLeft ? ['name'] : undefined}
        pinnedRightColumns={pinnedRight ? ['launchDate'] : undefined}
      />
    )
  },
}

export const ColumnTypes: Story = {
  name: '欄類型自動渲染',
  render: () => {
    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'text', meta: { type: 'string', width: 200 } }),
      col.accessor('price', { header: 'currency', meta: { type: 'currency', prefix: '$', width: 120 } }),
      col.accessor('stock', { header: 'select(Tag)', meta: { type: 'select', options: STATUS_OPTIONS, width: 140 } }),
      col.accessor('available', { header: 'boolean(✓/—)', meta: { type: 'boolean', width: 100 } }),
      col.accessor('launchDate', { header: 'date', meta: { type: 'date', width: 140 } }),
    ]

    return (
      <div className="flex flex-col gap-8">
        <div>
          <H3>meta.type 系統</H3>
          <Desc>每個 column 透過 `meta.type` 宣告資料類型,DataTable 自動選擇對應 Field Control 的 `mode="display"` 渲染——消費者不需要手寫 cell。</Desc>
          <DataTable columns={columns} data={SAMPLE_DATA} height="auto" />
        </div>

        <div>
          <H3>支援的 Column Types</H3>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse">
              <thead><tr><Th>meta.type</Th><Th>Display 渲染</Th><Th>對齊</Th><Th>典型場景</Th></tr></thead>
              <tbody>
                <tr><Td mono>string</Td><Td mono>{`<Input mode="display">`}</Td><Td>left</Td><Td>姓名、title、slug</Td></tr>
                <tr><Td mono>number</Td><Td mono>{`<NumberInput mode="display">`}</Td><Td>right</Td><Td>數量、年齡</Td></tr>
                <tr><Td mono>currency</Td><Td mono>{`<NumberInput mode="display">`}(+ prefix)</Td><Td>right</Td><Td>金額、價格</Td></tr>
                <tr><Td mono>date</Td><Td mono>{`<DatePicker mode="display">`}</Td><Td>left</Td><Td>日期、時間戳</Td></tr>
                <tr><Td mono>boolean</Td><Td mono>{`<Checkbox mode="display">`}(✓ / —)</Td><Td>left</Td><Td>啟用 / 可見</Td></tr>
                <tr><Td mono>select</Td><Td mono>{`<Select mode="display">`}</Td><Td>left</Td><Td>狀態、類別</Td></tr>
                <tr><Td mono>multiSelect</Td><Td mono>{`<Combobox mode="display">`}</Td><Td>left</Td><Td>多選 tags</Td></tr>
                <tr><Td mono>person</Td><Td mono>PersonDisplay / MultiPersonDisplay</Td><Td>left</Td><Td>指派者、reviewer</Td></tr>
                <tr><Td mono>url</Td><Td mono>{`<LinkInput mode="display">`}</Td><Td>left</Td><Td>URL</Td></tr>
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
  name: '列高階梯（閱讀 vs 掃描模式）',
  render: () => {
    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'Product', meta: { type: 'string', width: 200 } }),
      col.accessor('category', { header: 'Category', meta: { type: 'select', options: CATEGORY_OPTIONS, width: 140 } }),
      col.accessor('price', { header: 'Price', meta: { type: 'currency', prefix: '$', width: 120 } }),
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
                <tr><Td mono>compact(sm)</Td><Td mono>--table-row-sm</Td><Td>text-body</Td><Td>大量資料掃視(log、交易紀錄)</Td></tr>
                <tr><Td mono>cozy(md)★default</Td><Td mono>--table-row-md</Td><Td>text-body</Td><Td>一般業務資料</Td></tr>
                <tr><Td mono>comfortable(lg)</Td><Td mono>--table-row-lg</Td><Td>text-body-lg</Td><Td>詳情檢視、avatar 多的場景</Td></tr>
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
  name: '對齊規則（跨產業共識）',
  render: () => {
    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'Product(text)', meta: { type: 'string', width: 200 } }),
      col.accessor('price', { header: 'Price(currency)', meta: { type: 'currency', prefix: '$', width: 120 } }),
      col.accessor('stock', { header: 'Stock(select)', meta: { type: 'select', options: STATUS_OPTIONS, width: 120 } }),
      col.accessor('available', { header: 'Available(boolean)', meta: { type: 'boolean', width: 100 } }),
    ]
    return (
      <div className="flex flex-col gap-8">
        <div>
          <H3>Column type 決定對齊(由 column-types.ts 定義,不讓 consumer 手動設)</H3>
          <Desc>數字靠右方便縱向比較位數(Excel / 會計軟體 / 財務系統共識);文字靠左方便閱讀;boolean 靠左跟其他文字欄一致,維持掃視時的左緣節奏。Consumer 不需要設 `align`,column type 就決定了。</Desc>
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
                <tr><Td>boolean(✓ / —)</Td><Td mono>left</Td><Td>跟其他文字欄一致靠左,維持掃視時的左緣節奏</Td></tr>
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
  name: '功能特性（排序 / 虛擬捲動）',
  render: () => {
    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'Product', meta: { type: 'string', width: 200 }, enableSorting: true }),
      col.accessor('category', { header: 'Category', meta: { type: 'select', options: CATEGORY_OPTIONS, width: 140 } }),
      col.accessor('price', { header: 'Price', meta: { type: 'currency', prefix: '$', width: 120 }, enableSorting: true }),
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
          <Desc>Column 的 `enableSorting: true` 啟用排序。點擊 header 切換 asc / desc / none 三態,header 右側顯示向上 / 向下箭頭(ArrowUp / ArrowDown)指示目前排序方向。</Desc>
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
  name: '色彩對照表',
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
                <Td><TokenCell token="--divider" display="divider" /></Td>
                <Td>區隔 header 與 body</Td>
              </tr>
              <tr>
                <Td>Sort icon(排序中)</Td>
                <Td><TokenCell token="--fg-secondary" display="fg-secondary" /></Td>
                <Td>已套排序(0/1 欄)的欄位顯示升/降冪箭頭;multi-sort(≥2 欄)隱藏箭頭走 SortManager</Td>
              </tr>
              <tr>
                <Td>欄位選單 ⌄(hover)</Td>
                <Td><TokenCell token="--fg-secondary" display="fg-secondary" /></Td>
                <Td>Hover 可排序欄時出現於右區的欄位選單觸發鈕(ItemInlineActionButton,非 sort 箭頭)</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Row 狀態色彩</H3>
        <Desc>
          Row bg 由 default / hover 決定。Hover 用 neutral-hover
          (全系統互動高亮一致,跟 TreeView / MenuItem 同套 token)。
          選取狀態不由 row bg 呈現,而是 __select__ 欄的 selection control(checkbox / radio)
          ——2026-05-31 user 決策:有勾選框就只用勾選框呈現,避免「勾選框 + 底色」雙重指示。
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
                <Td mono>disabled row(isRowSelectable=false)</Td>
                <Td><TokenCell token="--surface" display="surface(不灰底)" /></Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td><TokenCell token="--divider" display="divider" /></Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          選取狀態由 __select__ 欄的 checkbox / radio 呈現,不套 row 底色;hover 與 selection 正交
          (已選 row 仍可有 hover 的 neutral-hover tint,但不疊額外 selected 底色)。
          isRowSelectable=false 僅 disable checkbox,row 不灰底(spec 禁止事項);
          cell-level disabled(inline edit cellDisabled)才套 --bg-disabled。
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
      col.accessor('name', { header: 'Product', meta: { type: 'string', width: 200 } }),
      col.accessor('category', { header: 'Category', meta: { type: 'select', options: CATEGORY_OPTIONS, width: 140 } }),
      col.accessor('price', { header: 'Price', meta: { type: 'currency', prefix: '$', width: 120 } }),
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

export const BorderedProp: Story = {
  name: 'bordered 屬性（預設 true）',
  render: () => {
    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'Product', meta: { type: 'string', width: 200 } }),
      col.accessor('category', { header: 'Category', meta: { type: 'select', options: CATEGORY_OPTIONS, width: 140 } }),
      col.accessor('price', { header: 'Price', meta: { type: 'currency', prefix: '$', width: 120 } }),
    ]
    return (
      <div className="flex flex-col gap-8">
        <div>
          <H3>bordered(boolean,預設 true)</H3>
          <Desc>多數場景(虛擬捲動 / frozen column / inline edit)保留預設外框;嵌在已有外框的 Card / Section 內且資料量極少無溢出時,才傳 `bordered={false}` 讓最外層視覺收尾,避免雙重外框。</Desc>
          <div className="overflow-x-auto mb-4">
            <table className="text-caption border-collapse">
              <thead><tr><Th>Prop</Th><Th>型別</Th><Th>預設</Th><Th>用途</Th></tr></thead>
              <tbody>
                <tr><Td mono>bordered</Td><Td mono>boolean</Td><Td mono>true</Td><Td>外框開關。預設有框(標記內容可能溢出);`false` 用於嵌套在已帶框容器內的展示場景</Td></tr>
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <div className="text-caption text-fg-muted mb-2 font-mono">bordered=&#123;true&#125;(預設)</div>
              <DataTable columns={columns} data={SAMPLE_DATA.slice(0, 3)} height="auto" />
            </div>
            <div>
              <div className="text-caption text-fg-muted mb-2 font-mono">bordered=&#123;false&#125;</div>
              <DataTable bordered={false} columns={columns} data={SAMPLE_DATA.slice(0, 3)} height="auto" />
            </div>
          </div>
        </div>
      </div>
    )
  },
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"DataTable 用一般 div 搭配表格語意標記,而非原生 table 元素——因為虛擬捲動需要絕對定位每一列,而 table 的佈局模型做不到。輔助技術(螢幕報讀器)會把它當成表格朗讀。\n\n  表格語意  :最外層標記為表格、每一列標記為列、每一格標記為儲存格,表頭那一格標記為欄位標題。\n\n  排序  :可排序的表頭會標示目前的排序方向(升冪 / 降冪 / 未排序),報讀器讀得出來。\n\n  選取  :每一列的勾選框都有說明文字(由使用方傳入,沒傳就用「Select row」),全選框的說明文字是「Select all visible rows」。\n\n  鍵盤  :一般表格模式下,用 Tab 進入表格後可操作排序與勾選;方向鍵在儲存格之間移動是試算表模式(spreadsheetMode)才開啟的功能,不是預設。列上的更多操作都收進右側的「更多」選單,確保不用滑鼠也能用。\n\n  焦點  :鍵盤聚焦時顯示清楚的外框,與整個設計系統的聚焦樣式一致。\n\n  驗證  :Storybook 無障礙檢查面板應該沒有嚴重問題;全程鍵盤可操作,不必用到滑鼠;文字對比度達到無障礙標準。"}</p>
    </div>
  ),
}

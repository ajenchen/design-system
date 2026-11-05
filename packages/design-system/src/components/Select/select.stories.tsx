// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#WithBulkActions
// (per .claude/references/story-baseline-registry.json#DataTable)
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { Select } from './select'
import { Field, FieldError, FieldLabel } from '@/design-system/components/Field/field'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types'
import { CATEGORY_OPTIONS as categoryOptions } from '@/design-system/stories-helpers/data/product-catalog'
import { ExampleSection, ExampleStack } from '@/design-system/stories-helpers/examples/tutorial-page'

const statusOptions = [
  { value: 'in_stock', label: 'In stock', tagVariant: 'green' },
  { value: 'low_stock', label: 'Low stock', tagVariant: 'yellow' },
  { value: 'out_of_stock', label: 'Out of stock', tagVariant: 'red' },
]

const meta: Meta<typeof Select> = {
  title: 'Design System/Components/Select/展示',
  component: Select,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: '從預先定義的選項中選取單一值，支援清除、建立與檢視模式。選項數量適中且不需同時比較時使用；需要搜尋或多選時改用 Combobox。' } },
  },
}

export default meta
type Story = StoryObj<typeof Select>

/* ── 四模式 ── */
export const Modes: Story = {
  name: '四模式',
  render: () => {
    const [value, setValue] = React.useState('in_stock')
    return (
      <ExampleStack className="max-w-xs">
        <ExampleSection title="edit">
          <Select options={statusOptions} value={value} onChange={setValue} aria-label="庫存狀態(編輯)" />
        </ExampleSection>
        <ExampleSection title="view">
          <Select mode="view" options={statusOptions} value={value} aria-label="庫存狀態(純展示)" />
        </ExampleSection>
        <ExampleSection title="readonly">
          <Select mode="readonly" options={statusOptions} value={value} aria-label="庫存狀態(唯讀)" />
        </ExampleSection>
        <ExampleSection title="disabled">
          <Select mode="disabled" options={statusOptions} value={value} aria-label="庫存狀態(停用)" />
        </ExampleSection>
        <ExampleSection title="readonly(空值)">
          <Select mode="readonly" options={statusOptions} value={null} aria-label="庫存狀態(唯讀,尚未填寫)" />
        </ExampleSection>
      </ExampleStack>
    )
  },
}

function SelectErrorExample() {
  const [value, setValue] = React.useState('')
  return (
    <Field required invalid={!value} className="max-w-xs">
      <FieldLabel>出貨倉庫</FieldLabel>
      <Select
        options={[
          { value: 'taipei', label: '台北倉' },
          { value: 'taichung', label: '台中倉' },
          { value: 'kaohsiung', label: '高雄倉' },
        ]}
        value={value}
        onChange={setValue}
        placeholder="選擇出貨倉庫"
        aria-label="出貨倉庫"
      />
      {!value && <FieldError>請選擇出貨倉庫</FieldError>}
    </Field>
  )
}

export const WithError: Story = {
  name: '驗證錯誤',
  render: () => <SelectErrorExample />,
}

/* ── 寬度軸 hug(任務詳情 metadata)── */
export const HugWidth: Story = {
  name: '寬度貼合內容(詳情欄)',
  render: () => {
    const [status, setStatus] = React.useState('in_stock')
    const [priority, setPriority] = React.useState('medium')
    return (
      // 任務詳情右欄場景:label 上、hug 寬 select 下 — 框線互動與一般 field 完全相同,只有寬度依 value 收縮
      <div className="flex w-72 flex-col gap-[var(--layout-space-loose)]">
        <Field>
          <FieldLabel>Status</FieldLabel>
          <Select width="hug" size="sm" options={statusOptions} value={status} onChange={setStatus} aria-label="Status(hug width demo)" />
        </Field>
        <Field>
          <FieldLabel>Priority</FieldLabel>
          <Select
            width="hug"
            size="sm"
            options={[
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
            value={priority}
            onChange={setPriority}
            aria-label="Priority(hug width demo)"
          />
        </Field>
      </div>
    )
  },
}

// @story-history: DisplayMode(plain/tag × edit/readonly)retired 2026-07-17 per audit Dim 24 —
//   為 anatomy.stories.tsx ColorMatrix(plain/tag × edit/readonly/disabled 完整矩陣)的嚴格子集;
//   plain vs tag 的選用原則另由 principles.stories.tsx DisplayModeRule 承載。展示版無新增約束
//   (earn-existence 2-test 雙 NO)→ retire。display 模式 canonical home = anatomy ColorMatrix + principles DisplayModeRule。

/* ── 尺寸與 Button 對齊 ── */
const SIZE_NAME = { sm: '小', md: '標準', lg: '大' } as const
export const SizeAlignment: Story = {
  name: '三種尺寸',
  // 只放 Select 本身(稽核 L073 / L101:拿掉三顆 primary 送出與程式碼標籤);尺寸說明放 docs
  parameters: { docs: { description: { story: '由上到下是小、標準、大三種尺寸;同一個尺寸與按鈕、其他欄位等高。' } } },
  render: () => {
    const [sm, setSm] = React.useState('in_stock')
    const [md, setMd] = React.useState('in_stock')
    const [lg, setLg] = React.useState('in_stock')
    const states: Record<string, [string, (v: string) => void]> = { sm: [sm, setSm], md: [md, setMd], lg: [lg, setLg] }
    return (
      <div className="flex flex-col gap-[var(--layout-space-loose)]">
        {(['sm', 'md', 'lg'] as const).map(size => (
          <Select key={size} aria-label={`庫存狀態(${SIZE_NAME[size]}尺寸)`} size={size} options={statusOptions} value={states[size][0]} onChange={states[size][1]} className="max-w-xs" />
        ))}
      </div>
    )
  },
}

/* ── 可清除 ── */
export const Clearable: Story = {
  name: '可清除',
  parameters: { docs: { description: { story: '有值時右側出現清除按鈕,按一下清空。' } } },
  render: () => {
    const [value, setValue] = React.useState<string>('in_stock')
    return (
      <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-xs">
        <Select aria-label="庫存狀態"
          options={statusOptions}
          value={value}
          onChange={setValue}
          clearable
          placeholder="選擇狀態"
        />
      </div>
    )
  },
}

/* ── 搜尋（Combobox 模式）── */
export const Searchable: Story = {
  name: '搜尋',
  parameters: { docs: { description: { story: '點開後欄位變成搜尋框,打字就篩選選項。' } } },
  render: () => {
    const [value, setValue] = React.useState<string>('')
    const manyOptions = [
      { value: 'tw', label: '台灣' }, { value: 'jp', label: '日本' },
      { value: 'us', label: '美國' }, { value: 'gb', label: '英國' },
      { value: 'de', label: '德國' }, { value: 'fr', label: '法國' },
      { value: 'kr', label: '韓國' }, { value: 'sg', label: '新加坡' },
      { value: 'au', label: '澳洲' }, { value: 'ca', label: '加拿大' },
    ]
    return (
      <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-xs">
        <Select aria-label="國家"
          options={manyOptions}
          value={value}
          onChange={setValue}
          searchable
          clearable
          placeholder="選擇國家…"
        />
      </div>
    )
  },
}

/* ── Creatable(搜尋 + 建立新選項）── */
export const Creatable: Story = {
  name: '建立新選項',
  parameters: { docs: { description: { story: '搜尋不到既有標籤時,選單底部出現「直接使用「…」」那一列,點一下就新增並選取。' } } },
  render: () => {
    const [labels, setLabels] = React.useState([
      { value: 'bug', label: 'Bug' },
      { value: 'feature', label: 'Feature' },
      { value: 'design', label: 'Design' },
      { value: 'docs', label: 'Docs' },
    ])
    const [value, setValue] = React.useState<string>('')
    return (
      <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-xs">
        <Select aria-label="標籤"
          options={labels}
          value={value}
          onChange={setValue}
          searchable
          creatable
          onCreate={(q) => {
            const newLabel = { value: q.toLowerCase().replace(/\s+/g, '-'), label: q }
            setLabels((prev) => [...prev, newLabel])
            setValue(newLabel.value)
          }}
          placeholder="選擇或建立標籤…"
        />
      </div>
    )
  },
}

/* ── 載入中 / 沒有選項(開啟態快照:defaultOpen 讓瀏覽器閘不用點擊就看得到)── */
// 金流平台付款設定「結算幣別」:幣別清單由後端依帳戶地區回傳
const currencyOptions = [
  { value: 'twd', label: 'TWD 新台幣' },
  { value: 'usd', label: 'USD 美元' },
  { value: 'jpy', label: 'JPY 日圓' },
  { value: 'eur', label: 'EUR 歐元' },
  { value: 'gbp', label: 'GBP 英鎊' },
]

export const LoadingFirstOpen: Story = {
  name: '選項載入中(首次開啟)',
  parameters: { docs: { description: { story: 'Stripe 付款設定的「結算幣別」第一次展開,幣別清單還沒從後端回來:選單裡只有一列「載入選項中」訊息列,與一筆結果等高;觸發點不轉圈(選項載入的指示只在選單內,觸發點的轉圈留給「這個值正在處理」)。' } } },
  render: () => (
    <div className="max-w-xs">
      <Select options={[]} defaultValue={null} searchable optionsLoading defaultOpen placeholder="選擇結算幣別…" aria-label="結算幣別(首次載入)" />
    </div>
  ),
}

export const ValueLoading: Story = {
  name: '值處理中(儲存)',
  parameters: { docs: { description: { story: '結算幣別改成 JPY 後正在寫回 Stripe:`loading` 是 Field 家族共用的「這個值在讀取 / 驗證 / 儲存」—— 觸發點右側、箭頭左邊轉圈並標 aria-busy,選單照常可開可選;跟 Input 的 loading 同一個意思,跟選項有沒有載入無關。' } } },
  render: () => (
    <div className="max-w-xs">
      <Select options={currencyOptions} defaultValue="jpy" loading placeholder="選擇結算幣別…" aria-label="結算幣別(儲存中)" />
    </div>
  ),
}

export const NoOptions: Story = {
  name: '沒有選項',
  parameters: { docs: { description: { story: 'Jira 建立議題時的 Sprint 欄位,專案還沒建立任何 Sprint:打開就是一列「沒有選項」訊息列,與一筆結果等高;不放圖示、也不用整塊空狀態。' } } },
  render: () => (
    <div className="max-w-xs">
      <Select options={[]} defaultValue={null} defaultOpen placeholder="選擇 Sprint" aria-label="Sprint(沒有選項)" />
    </div>
  ),
}

export const GroupedSearch: Story = {
  name: '分組 + 搜尋',
  parameters: { docs: { description: { story: 'Stripe 結算幣別分「亞洲」「歐美」兩組:群組之間的分隔線由群組自己畫,搜尋時只剩一組就沒有線、剩兩組就一條線 —— 不是手插分隔線(手插的在搜尋時會消失)。' } } },
  render: () => (
    <div className="max-w-xs">
      <Select
        options={[
          { value: 'twd', label: 'TWD 新台幣', group: 'asia' },
          { value: 'jpy', label: 'JPY 日圓', group: 'asia' },
          { value: 'krw', label: 'KRW 韓元', group: 'asia' },
          { value: 'usd', label: 'USD 美元', group: 'west' },
          { value: 'eur', label: 'EUR 歐元', group: 'west' },
          { value: 'gbp', label: 'GBP 英鎊', group: 'west' },
        ]}
        groups={[{ key: 'asia', label: '亞洲' }, { key: 'west', label: '歐美' }]}
        defaultValue="twd"
        searchable
        defaultOpen
        placeholder="選擇結算幣別…"
        aria-label="結算幣別(分組)"
      />
    </div>
  ),
}

/** 遠端搜尋(文件工具的「移動到」):頁面在後端、關鍵字空先給「建議」(最近瀏覽);每打一個字向後端要一次,抓資料中舊清單不留、只剩載入列。 */
function RemoteSearchDemo() {
  const pages = [
    { value: 'roadmap', label: '產品路線圖', keywords: 'roadmap' },
    { value: 'okr', label: '2026 Q4 OKR', keywords: 'okr goals' },
    { value: 'onboarding', label: '新人入職手冊', keywords: 'onboarding' },
    { value: 'ds', label: '設計系統元件', keywords: 'design system' },
    { value: 'meetings', label: '會議記錄', keywords: 'meeting notes' },
  ]
  const recentPages = pages.slice(0, 3)
  const [options, setOptions] = React.useState<typeof pages>([])
  const [optionsLoading, setOptionsLoading] = React.useState(false)
  const [value, setValue] = React.useState<string | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSearchChange = (q: string) => {
    if (timer.current) clearTimeout(timer.current)
    const needle = q.trim().toLowerCase()
    // 關鍵字清空:回到建議群組,不用問後端
    if (!needle) { setOptions([]); setOptionsLoading(false); return }
    setOptionsLoading(true)
    timer.current = setTimeout(() => {
      setOptions(pages.filter((p) => `${p.label} ${p.keywords}`.toLowerCase().includes(needle)))
      setOptionsLoading(false)
    }, 800)
  }
  return (
    <div className="max-w-xs">
      <Select
        options={options}
        suggestions={recentPages}
        value={value}
        onChange={setValue}
        searchable
        filterOption={false}
        optionsLoading={optionsLoading}
        onSearchChange={onSearchChange}
        placeholder="移動到…"
        aria-label="移動到(遠端搜尋)"
      />
    </div>
  )
}

export const RemoteSearch: Story = {
  name: '遠端搜尋(建議 → 載入 → 結果)',
  parameters: { docs: { description: { story: 'Notion「移動到」、頁面在後端:還沒打字先列「建議」群組(最近瀏覽的三頁,群組標題告訴你頁面不只這些);每打一個字向後端要一次,抓資料中舊清單不留、只剩一列「載入選項中」;後端回什麼列什麼,真的沒有才顯示「沒有選項」;清掉關鍵字就回到建議。' } } },
  render: () => <RemoteSearchDemo />,
}

/* ── DataTable 整合 ── */
export const InDataTable: Story = {
  name: 'DataTable 整合',
  parameters: { docs: { description: { story: '表格裡的選項欄預設顯示選項的文字;需要彩色標籤時,在欄位設定裡改用標籤樣式。' } } },
  render: () => {
    interface Product {
      name: string
      category: string
      stock: string
      price: number
    }

    const data: Product[] = [
      { name: 'Wireless Headphones', category: 'electronics', stock: 'in_stock', price: 2490 },
      { name: 'Office Chair', category: 'furniture', stock: 'low_stock', price: 8900 },
      { name: 'Green Tea 100 Bags', category: 'food', stock: 'in_stock', price: 350 },
      { name: 'USB-C Hub', category: 'electronics', stock: 'out_of_stock', price: 1290 },
    ]

    const col = createColumnHelper<Product>()

    const columns = [
      col.accessor('name', { header: 'Product', meta: { type: 'string', width: 200 } }),
      col.accessor('category', { header: 'Category', meta: { type: 'select', options: categoryOptions, width: 120 } }),
      col.accessor('stock', { header: 'Stock', meta: { type: 'select', options: statusOptions, width: 120 } }),
      col.accessor('price', { header: 'Price', meta: { type: 'currency', prefix: '$', width: 100 } }),
    ]

    return (
      <DataTable columns={columns} data={data} height="auto" />
    )
  },
}

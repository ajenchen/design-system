// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#WithBulkActions
// Combobox 為主元件;當 stories 內 wrap DataTable 演示 cell-context,baseline = DataTable WithBulkActions(per .claude/references/story-baseline-registry.json#DataTable)
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, waitFor, within } from '@storybook/test'
import { createColumnHelper } from '@tanstack/react-table'
import { Combobox } from './combobox'
import { Button } from '@/design-system/components/Button/button'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import { Field, FieldError, FieldLabel } from '@/design-system/components/Field/field'
import '@/design-system/components/DataTable/column-types'

const categoryOptions = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'food', label: 'Food' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'clothing', label: 'Clothing' },
]

const meta: Meta<typeof Combobox> = {
  title: 'Design System/Components/Combobox/展示',
  component: Combobox,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: '可搜尋並選取一個或多個選項，已選值以 tag 或摘要呈現。選項很多、需要篩選或多選時使用；少量單選且不需搜尋時優先用 Select。' } },
  },
}

export default meta
type Story = StoryObj<typeof Combobox>

/* ── 四模式 ── */
export const Modes: Story = {
  name: '四模式',
  render: () => {
    const [value, setValue] = React.useState(['electronics', 'food', 'lifestyle'])
    return (
      <div className="flex flex-col gap-6 max-w-sm">
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
          <Combobox options={categoryOptions} value={value} onChange={setValue} aria-label="類別(edit mode demo)" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">view</h3>
          <Combobox mode="view" options={categoryOptions} value={value} aria-label="類別(view 模式示範)" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
          <Combobox mode="readonly" options={categoryOptions} value={value} aria-label="類別(readonly mode demo)" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
          <Combobox mode="disabled" options={categoryOptions} value={value} aria-label="類別(disabled mode demo)" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">readonly (empty)</h3>
          <Combobox mode="readonly" options={categoryOptions} value={[]} aria-label="類別(readonly empty demo)" />
        </div>
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: '移除 Electronics' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: '移除 Food' })).toHaveFocus())
    await userEvent.click(canvas.getByRole('button', { name: '移除 Food' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: '移除 Lifestyle' })).toHaveFocus())
    await userEvent.click(canvas.getByRole('button', { name: '移除 Lifestyle' }))
    await waitFor(() => expect(canvas.getByRole('combobox', { name: '類別(edit mode demo)' })).toHaveFocus())
  },
}

function ComboboxErrorExample() {
  const [value, setValue] = React.useState<string[]>([])
  return (
    <Field required invalid={value.length === 0} className="max-w-sm">
      <FieldLabel>商品類別</FieldLabel>
      <Combobox
        options={categoryOptions}
        value={value}
        onChange={setValue}
        searchable
        aria-label="商品類別"
        placeholder="選擇至少一個類別"
      />
      {value.length === 0 && <FieldError>請至少選擇一個商品類別</FieldError>}
    </Field>
  )
}

export const WithError: Story = {
  name: '驗證錯誤',
  render: () => <ComboboxErrorExample />,
}

/* ── 尺寸與 Button 對齊 ── */
export const SizeAlignment: Story = {
  name: '三種尺寸',
  render: () => {
    const [sm, setSm] = React.useState(['electronics', 'food', 'lifestyle'])
    const [md, setMd] = React.useState(['electronics', 'food', 'lifestyle'])
    const [lg, setLg] = React.useState(['electronics', 'food', 'lifestyle'])
    const states: Record<string, [string[], (v: string[]) => void]> = { sm: [sm, setSm], md: [md, setMd], lg: [lg, setLg] }
    return (
      <div className="flex flex-col gap-4">
        {(['sm', 'md', 'lg'] as const).map(size => (
          <div key={size} className="flex items-center gap-3">
            <Combobox size={size} options={categoryOptions} value={states[size][0]} onChange={states[size][1]} className="max-w-xs" aria-label={`商品分類(size=${size})`} />
            <Button variant="primary" size={size}>送出</Button>
            <span className="text-caption text-fg-muted">size="{size}"</span>
          </div>
        ))}
      </div>
    )
  },
}

// @story-history: 原 WrapModes(單行 vs 換行)retired 2026-07-17(Dim 24 earn-existence)—
//   單行/wrap × edit/readonly 矩陣已由 anatomy「狀態行為」(單行溢出 + readonly 溢出 + edit/readonly wrap)
//   完整覆蓋機制,wrap 選擇原則由 principles「Wrap 模式選擇」(WrapRule)owns。展示層不重演矩陣(三層定位);
//   principles 使用指引頁對應 LinkTo(單行 vs 換行)同步移除。

/* ── 搜尋 ── */
export const Searchable: Story = {
  name: '搜尋',
  render: () => {
    const [value, setValue] = React.useState<string[]>(['electronics'])
    const [value2, setValue2] = React.useState<string[]>(['electronics'])
    return (
      <div className="flex flex-col gap-6 max-w-sm">
        <div className="flex flex-col gap-4">
          <p className="text-caption text-fg-muted">searchable — 浮層內搜尋框，關鍵字保留可連續勾選</p>
          <Combobox
            options={categoryOptions}
            value={value}
            onChange={setValue}
            searchable
            aria-label="類別(searchable popover demo)"
          />
        </div>
        <div className="flex flex-col gap-4">
          <p className="text-caption text-fg-muted">searchIn='trigger' — inline 搜尋框，直接在欄位內輸入</p>
          <Combobox
            options={categoryOptions}
            value={value2}
            onChange={setValue2}
            searchable
            searchIn="trigger"
            aria-label="類別(searchable inline demo)"
          />
        </div>
      </div>
    )
  },
}

/* ── 載入中(開啟態快照:defaultOpen 讓瀏覽器閘不用點擊就看得到)── */
// Notion 頁面「連結資料庫」:工作區的資料庫清單由 API 回傳
const databaseOptions = [
  { value: 'crm', label: 'CRM 客戶名單' },
  { value: 'roadmap', label: '產品路線圖' },
  { value: 'meetings', label: '會議記錄' },
  { value: 'components', label: '設計系統元件' },
  { value: 'hiring', label: '招募流程' },
]

export const LoadingFirstOpen: Story = {
  name: '選項載入中(首次開啟)',
  parameters: { docs: { description: { story: 'Notion 頁面「連結資料庫」第一次展開,工作區的資料庫清單還沒回來:清單裡只有一列「載入選項中」訊息列;觸發點與搜尋列都不轉圈、搜尋列仍可打字(選項載入的指示只在選單內)。' } } },
  render: () => (
    <div className="max-w-sm">
      <Combobox options={[]} value={[]} onChange={() => {}} searchable optionsLoading defaultOpen searchPlaceholder="搜尋資料庫…" aria-label="連結資料庫(首次載入)" />
    </div>
  ),
}

export const ValueLoading: Story = {
  name: '值處理中(儲存)',
  parameters: { docs: { description: { story: '剛把「CRM 客戶名單」連結進頁面,關聯正在寫回 Notion:`loading` 是 Field 家族共用的「這個值在讀取 / 驗證 / 儲存」—— 觸發點右側、箭頭左邊轉圈並標 aria-busy,選單照常可開;跟選項有沒有載入無關。' } } },
  render: () => (
    <div className="max-w-sm">
      <Combobox options={databaseOptions} value={['crm']} onChange={() => {}} searchable loading searchPlaceholder="搜尋資料庫…" aria-label="連結資料庫(儲存中)" />
    </div>
  ),
}

/** 遠端搜尋(Notion「連結資料庫」):關鍵字空先給「建議」(最近用過的資料庫);每打一個字向後端要一次,抓資料中舊清單不留、只剩載入列;後端回什麼列什麼。 */
function RemoteSearchDemo() {
  const directory = [
    { value: 'crm', label: 'CRM 客戶名單', keywords: '客戶 customer' },
    { value: 'roadmap', label: '產品路線圖', keywords: 'roadmap 路線' },
    { value: 'meetings', label: '會議記錄', keywords: 'meeting notes' },
    { value: 'ds', label: '設計系統元件', keywords: 'design system' },
    { value: 'hiring', label: '招募流程', keywords: 'hiring recruit' },
  ]
  const recent = directory.slice(0, 2)
  const [options, setOptions] = React.useState<typeof directory>([])
  const [optionsLoading, setOptionsLoading] = React.useState(false)
  const [value, setValue] = React.useState<string[]>(['crm'])
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSearchChange = (q: string) => {
    if (timer.current) clearTimeout(timer.current)
    const needle = q.trim().toLowerCase()
    // 關鍵字清空:回到建議群組,不用問後端
    if (!needle) { setOptions([]); setOptionsLoading(false); return }
    setOptionsLoading(true)
    // 模擬後端:用別名(keywords)也能命中,這是本機過濾做不到的,所以必須關掉本機過濾
    timer.current = setTimeout(() => {
      setOptions(directory.filter((o) => `${o.label} ${o.keywords}`.toLowerCase().includes(needle)))
      setOptionsLoading(false)
    }, 800)
  }
  return (
    <div className="max-w-sm">
      <Combobox
        options={options}
        suggestions={recent}
        value={value}
        onChange={setValue}
        searchable
        filterOption={false}
        optionsLoading={optionsLoading}
        onSearchChange={onSearchChange}
        defaultOpen
        searchPlaceholder="搜尋資料庫(後端搜尋,支援別名)…"
        aria-label="連結資料庫(遠端搜尋)"
      />
    </div>
  )
}

export const RemoteSearchHint: Story = {
  name: '遠端搜尋(還沒打字、沒有建議)',
  parameters: { docs: { description: { story: 'Notion 連結資料庫、名單在後端,但這個工作區還沒有「最近用過」可以當建議:展開只有一列「輸入關鍵字搜尋」提示 —— 不是「沒有選項」(那句只留給真的搜不到的時候)。' } } },
  render: () => (
    <div className="max-w-sm">
      <Combobox options={[]} value={[]} onChange={() => {}} searchable filterOption={false} defaultOpen searchPlaceholder="搜尋資料庫…" aria-label="連結資料庫(還沒打字)" />
    </div>
  ),
}

export const RemoteSearch: Story = {
  name: '遠端搜尋(建議 → 載入 → 結果)',
  parameters: { docs: { description: { story: 'Notion 連結資料庫、名單在後端:還沒打字先列「建議」群組(最近用過的兩個,群組標題告訴你名單不只這些);每打一個字向後端要一次,抓資料中舊清單不留、只剩一列「載入選項中」;後端回什麼列什麼(打「customer」也找得到「CRM 客戶名單」,本機過濾做不到),真的沒有才顯示「沒有選項」;清掉關鍵字就回到建議。' } } },
  render: () => <RemoteSearchDemo />,
}

/* ── DataTable 整合 ── */
export const InDataTable: Story = {
  name: 'DataTable 整合',
  render: () => {
    interface Product {
      name: string
      categories: string[]
      price: number
    }

    const data: Product[] = [
      { name: 'Wireless Headphones', categories: ['electronics', 'lifestyle'], price: 2490 },
      { name: 'Office Chair', categories: ['furniture'], price: 8900 },
      { name: 'Green Tea', categories: ['food'], price: 350 },
      { name: 'USB-C Hub', categories: ['electronics'], price: 1290 },
    ]

    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'Product', meta: { type: 'string', width: 200 } }),
      col.accessor('categories', {
        header: 'Categories',
        meta: { type: 'multiSelect', options: categoryOptions, width: 200 },
      }),
      col.accessor('price', { header: 'Price', meta: { type: 'currency', prefix: '$', width: 100 } }),
    ]

    return (
      <div>
        <p className="text-caption text-fg-muted mb-3">multiSelect 欄位自動用多個 Tag 渲染</p>
        <DataTable columns={columns} data={data} height="auto" />
      </div>
    )
  },
}

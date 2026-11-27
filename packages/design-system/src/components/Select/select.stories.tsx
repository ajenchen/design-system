// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#WithBulkActions
// (per .claude/references/story-baseline-registry.json#DataTable)
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { createColumnHelper } from '@tanstack/react-table'
import { Flag } from 'lucide-react'
import { Select, type SelectOption } from './select'
import { Field, FieldError, FieldLabel } from '@/design-system/components/Field/field'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types'
import { CATEGORY_OPTIONS as categoryOptions } from '@/design-system/stories-helpers/data/product-catalog'
import { ExampleSection, ExampleStack } from '@/design-system/stories-helpers/examples/tutorial-page'
import { WORK_ITEM_STATUSES, WORK_ITEM_TYPES, workItemTypeBadge } from '@/design-system/stories-helpers/scene/work-item-type'
import { expect, userEvent, waitFor, within } from 'storybook/test'

const statusOptions: SelectOption[] = [
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
/* ── 選項前綴:工作項類型方塊 + 狀態色(2026-11-26,workspace F 組 F4-2)── */
// 建立工作項時選類型與狀態:類型選項前面是類型方塊(`startContent`,LucideIcon 表達不了的彩底 + glyph),
// 狀態選項是圖示 + 語意色(`icon` + `iconClassName`)。欄位上的已選值前綴跟著選中項畫(select.spec.md 圖示對照表)。
// play 斷言:類型清單每一列都有自訂前綴節點、已完成那一列與欄位上的圖示都是 success 色 —— 轉發一斷就紅,並點名是哪一列。
const workItemTypeOptions: SelectOption[] = WORK_ITEM_TYPES.map((t) => ({ value: t.value, label: t.label, description: t.description, startContent: workItemTypeBadge(t.value) }))
const workItemStatusOptions: SelectOption[] = WORK_ITEM_STATUSES.map((s) => ({ value: s.value, label: s.label, icon: s.icon, iconClassName: s.iconClassName }))

export const OptionPrefix: Story = {
  name: '選項前綴:工作項類型',
  parameters: { docs: { description: { story: '建立工作項時選類型與狀態。類型選項前面是類型方塊(選項的 `startContent`),狀態選項是圖示加語意色(`icon` + `iconClassName`);欄位上已選的值前面也畫同一個方塊或同色圖示。' } } },
  render: () => {
    const [type, setType] = React.useState('bug')
    const [status, setStatus] = React.useState('done')
    return (
      <div className="flex flex-wrap gap-[var(--layout-space-loose)]">
        <Field className="w-56">
          <FieldLabel>類型</FieldLabel>
          <Select options={workItemTypeOptions} value={type} onChange={setType} />
        </Field>
        <Field className="w-56">
          <FieldLabel>狀態</FieldLabel>
          <Select options={workItemStatusOptions} value={status} onChange={setStatus} />
        </Field>
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const successColor = (() => {
      const probe = canvasElement.ownerDocument.createElement('span')
      probe.className = 'text-success'
      canvasElement.appendChild(probe)
      const c = getComputedStyle(probe).color
      probe.remove()
      return c
    })()
    // 欄位上的已選值:類型 = 方塊(startContent)、狀態 = 已完成的圖示是 success 色
    const [typeTrigger, statusTrigger] = canvas.getAllByRole('combobox')
    await expect(typeTrigger.querySelector('[aria-hidden].size-4')).not.toBeNull()
    await expect(getComputedStyle(statusTrigger.querySelector('svg')!).color).toBe(successColor)
    // 類型清單:每一列都有自訂前綴節點
    await userEvent.click(typeTrigger)
    const typeRows = await body.findAllByRole('option')
    for (const row of typeRows) {
      await expect(row.querySelector('[data-prefix-type="content"]'), `類型選項「${row.textContent}」沒有前綴節點`).not.toBeNull()
    }
    await userEvent.click(typeTrigger)
    await waitFor(() => expect(body.queryAllByRole('option')).toHaveLength(0))
    // 狀態清單:已完成那一列的圖示是 success 色
    await userEvent.click(statusTrigger)
    const doneRow = await body.findByRole('option', { name: /已完成/ })
    // MenuItem 的前綴圖示本身就是帶 data-prefix-type="icon" 的 svg(menu-item.tsx)
    const doneIcon = doneRow.querySelector('[data-prefix-type="icon"]')
    await expect(doneIcon, '「已完成」那一列沒有前綴圖示').not.toBeNull()
    await expect(getComputedStyle(doneIcon!).color, '「已完成」那一列的圖示沒有套 iconClassName').toBe(successColor)
    await userEvent.click(statusTrigger)
    await waitFor(() => expect(body.queryAllByRole('option')).toHaveLength(0))
  },
}

// 回歸鎖的夾具(play 斷言),不是給讀者看的範例(story-rules「Technical probe visibility」):已選值前綴在每個 mode 都畫(workspace H33,2026-11-27)。
// field-controls.spec.md 共享 contract (a)「同一 value identity 不可因 mode 改變而丟失 renderer 資訊」+ select.spec.md 圖示對照表「Value icon」:
// 狀態(icon + iconClassName)與類型(startContent)× 編輯 / 檢視 / 檢視含下拉箭頭(表格格 opt-in)/ 唯讀 / 停用;起始圖示有傳時只畫起始圖示(不疊兩個)。
// 修前只有編輯態畫,檢視 / 唯讀 / 停用只剩文字 —— 拿掉 ReadonlyDisplay 的前綴就紅,並點名是哪一格。
const PREFIX_MODE_CELLS = [
  { key: 'edit', title: '編輯', mode: 'edit' as const, showDisplayEndIcon: undefined },
  { key: 'view', title: '檢視', mode: 'view' as const, showDisplayEndIcon: undefined },
  { key: 'view-cell', title: '檢視(表格格)', mode: 'view' as const, showDisplayEndIcon: true },
  { key: 'readonly', title: '唯讀', mode: 'readonly' as const, showDisplayEndIcon: undefined },
  { key: 'disabled', title: '停用', mode: 'disabled' as const, showDisplayEndIcon: undefined },
]

export const OptionPrefixAcrossModes: Story = {
  name: '選項前綴:各模式都畫(回歸鎖)',
  tags: ['test-only'],
  render: () => (
    <div className="grid grid-cols-2 gap-[var(--layout-space-loose)] max-w-xl">
      {PREFIX_MODE_CELLS.map((cell) => (
        <React.Fragment key={cell.key}>
          <div data-prefix-probe={`status-${cell.key}`}>
            <Field mode={cell.mode}>
              <FieldLabel>狀態({cell.title})</FieldLabel>
              <Select options={workItemStatusOptions} value="done" showDisplayEndIcon={cell.showDisplayEndIcon} />
            </Field>
          </div>
          <div data-prefix-probe={`type-${cell.key}`}>
            <Field mode={cell.mode}>
              <FieldLabel>類型({cell.title})</FieldLabel>
              <Select options={workItemTypeOptions} value="bug" showDisplayEndIcon={cell.showDisplayEndIcon} />
            </Field>
          </div>
        </React.Fragment>
      ))}
      <div data-prefix-probe="start-icon-readonly">
        <Field mode="readonly">
          <FieldLabel>優先處理的狀態</FieldLabel>
          <Select options={workItemStatusOptions} value="done" startIcon={Flag} />
        </Field>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const colorOf = (cls: string) => {
      const probe = canvasElement.ownerDocument.createElement('span')
      probe.className = cls
      canvasElement.appendChild(probe)
      const c = getComputedStyle(probe).color
      probe.remove()
      return c
    }
    const success = colorOf('text-success')
    const disabled = colorOf('text-fg-disabled')
    const muted = colorOf('text-fg-muted')
    const cellOf = (key: string) => {
      const el = canvasElement.querySelector(`[data-prefix-probe="${key}"]`)
      if (!el) throw new Error(`找不到量測格 ${key}`)
      return el
    }
    // 前綴圖示 = 欄位裡不是下拉箭頭的 svg(lucide 的 class 帶圖示名)
    const prefixIcons = (el: Element) => [...el.querySelectorAll('svg')].filter((svg) => !svg.classList.contains('lucide-chevron-down'))
    for (const cell of PREFIX_MODE_CELLS) {
      const status = prefixIcons(cellOf(`status-${cell.key}`))
      await expect(status, `狀態(${cell.title}):已選值「已完成」沒有畫選項圖示`).toHaveLength(1)
      await expect(getComputedStyle(status[0]).color, `狀態(${cell.title}):選項圖示顏色不對(唯讀 / 檢視 = 選項的 iconClassName,停用 = fg-disabled)`).toBe(cell.mode === 'disabled' ? disabled : success)
      await expect(cellOf(`type-${cell.key}`).querySelector('[aria-hidden].size-4'), `類型(${cell.title}):已選值「錯誤」沒有畫選項的前綴方塊`).not.toBeNull()
    }
    const startIconOnly = prefixIcons(cellOf('start-icon-readonly'))
    await expect(startIconOnly, '起始圖示有傳時只畫起始圖示,不再疊選項圖示').toHaveLength(1)
    await expect(getComputedStyle(startIconOnly[0]).color, '唯讀的起始圖示是 fg-muted').toBe(muted)
  },
}

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
      <DataTable columns={columns} data={data} maxHeight="none" />
    )
  },
}

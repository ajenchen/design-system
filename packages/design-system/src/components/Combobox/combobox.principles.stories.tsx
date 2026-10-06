// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { Combobox } from './combobox'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types' // ColumnMeta declaration merging
import { CaptionedExamples } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/Combobox/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ───────────────────────────────────────────────────────────────────

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-[var(--layout-space-loose)]">
    <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)] max-w-[720px]">{note}</p>}
    <CaptionedExamples caption={Label} className="max-w-md">{children}</CaptionedExamples>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── Options ───────────────────────────────────────────────────────────────────

const categoryOptions = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'food', label: 'Food' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'books', label: 'Books' },
  { value: 'sports', label: 'Sports' },
]

// 「❌ Table cell 不用 wrap」反例:消費真 DataTable 的 multiSelect 欄(cell-registry 的 MultiSelectCell 就是表格裡的
// Combobox),只把反例本身(autoRowHeight + meta.wrap)打開 —— 不手刻表頭 / 列幾何去模擬一張表。
type ProductRow = { name: string; categories: string[] }
const WRAP_ROWS: ProductRow[] = [
  { name: 'Headphones', categories: ['electronics', 'lifestyle', 'sports'] },
  { name: 'USB Hub', categories: ['electronics'] },
]
const productCol = createColumnHelper<ProductRow>()
const WRAP_COLUMNS = [
  productCol.accessor('name', { header: 'Product', meta: { type: 'string', width: 120 } }),
  productCol.accessor('categories', { header: 'Categories', meta: { type: 'multiSelect', options: categoryOptions, wrap: true, width: 200 } }),
]

// ── Stories ───────────────────────────────────────────────────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [tags, setTags] = React.useState(['electronics', 'food'])
    return (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      {/* 何時用 — 原 WhenToUse */}
      <div className="max-w-prose">
      <p>適合 Combobox 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      {/* @layout-space-magic-ok: 連結清單:同質清單項列距(layoutSpace.spec.md:165 同質清單列) */}
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Combobox/展示" name="四模式"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">四模式</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Combobox/展示" name="三種尺寸"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">尺寸與 Button 對齊</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Combobox/展示" name="搜尋"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">搜尋</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Combobox/展示" name="DataTable 整合"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">DataTable 整合</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-[var(--layout-space-tight)]">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* 何時不用 / 替代元件 — 原 WhenNotToUse */}
      <div>
        <Rule
          title="Combobox 的 sweet spot — 多選 + 空間受限 + 選項數 6+"
          note="Tag / 分類 / 協作成員 / 通知訂閱。使用者快速加選、移除，label 自帶語意不需描述"
        >
          <Combobox options={categoryOptions} value={tags} onChange={setTags} aria-label="商品分類(多選 Tag 範例)" />
        </Rule>

        <Rule
          title="❌ 單選:用 Select"
          note="Combobox 永遠多選——單選塞進來使用者每次要手動先移除舊 Tag 再選新的，多餘的互動"
        >
          <Combobox options={categoryOptions} value={['electronics']} onChange={() => {}} aria-label="商品分類(單選反例——應改用 Select)" />
          <Label warn>↑ 只選一個 electronics → 應該用 Select，一次點擊完成切換</Label>
        </Rule>

        <Rule
          title="❌ 2-5 個選項且需要全可見 + description:用 Checkbox stack"
          note="權限授予、條款勾選、通知類型選擇——選項需要完整閱讀（含描述），決策後同意。Combobox 藏選項強迫多次點擊對比。完整對照見 select.spec.md「與 RadioGroup 的分界」(Combobox vs Checkbox stack 同構)"
        >
          <Combobox
            options={[
              { value: 'terms', label: '服務條款' },
              { value: 'privacy', label: '隱私政策' },
              { value: 'marketing', label: '行銷訊息' },
            ]}
            value={['terms']}
            onChange={() => {}}
            aria-label="同意項目"
          />
          <Label warn>↑ 條款勾選是「完整閱讀後同意」→ 用 Checkbox stack 全露內容</Label>
        </Rule>

        <Rule
          title="❌ 階層結構（父/子節點）:用 TreeView"
          note="Combobox 是平面選項。部門 / 權限 / 資料夾等樹狀結構需要 TreeView 的展開收合互動"
        >
          <Combobox
            options={[
              { value: 'eng', label: 'Engineering' },
              { value: 'eng-fe', label: '— Frontend' },
              { value: 'eng-be', label: '— Backend' },
              { value: 'design', label: 'Design' },
            ]}
            value={['eng-fe']}
            onChange={() => {}}
            aria-label="部門"
          />
          <Label warn>↑ 用縮排偽造階層 → 沒有展開收合、不能按父節點全選、破壞資料結構</Label>
        </Rule>
      </div>
    </div>
    )
  },
}

export const WrapRule: Story = {
  name: 'Wrap 模式選擇',
  render: () => {
    const [single, setSingle] = React.useState(['electronics', 'food', 'lifestyle', 'clothing', 'books'])
    const [wrapped, setWrapped] = React.useState(['electronics', 'food', 'lifestyle', 'clothing', 'books'])
    return (
      <div>
        <Rule
          title="單行（預設）— Table cell、空間受限的 Form"
          note="固定高度，與 Input / Select 等欄位並排對齊。多於可見寬度的 Tag 以 +N 指示器代替，hover 可看完整清單"
        >
          <Combobox options={categoryOptions} value={single} onChange={setSingle} aria-label="商品分類(單行溢出範例)" />
          <Label>↑ 單行：高度固定，超出的 Tag → +N</Label>
        </Rule>

        <Rule
          title="多行 wrap — 空間充裕的 Form"
          note="高度隨選中數量展開，每個 Tag 都完整可見。適合填答型表單——使用者一眼看到所有選項，不需 hover 溢出指示器"
        >
          <Combobox wrap options={categoryOptions} value={wrapped} onChange={setWrapped} aria-label="商品分類(多行 wrap 範例)" />
          <Label>↑ 多行：完整展開，無溢出</Label>
        </Rule>

        <Rule
          title="❌ Table cell 不用 wrap"
          note="多行會破壞 row 高度一致性，讓 table 變得不規則。Table cell 永遠用單行，使用者需要完整清單時 hover +N"
        >
          {/* 表格寬 = 窄欄位(DataTable 預設各欄均分剩餘寬度;max-w-sm 讓 Categories 欄放不下三個 Tag → 反例才看得出列高不一) */}
          <div className="w-full max-w-sm">
            <DataTable columns={WRAP_COLUMNS} data={WRAP_ROWS} getRowId={(r) => r.name} height="auto" autoRowHeight />
          </div>
          <Label warn>↑ 每 row 高度不同 → 掃視節奏被破壞。Table 用單行 + +N 指示器</Label>
        </Rule>
      </div>
    )
  },
}

export const TagOperationRule: Story = {
  name: 'Tag 操作規則',
  render: () => {
    const [value, setValue] = React.useState(['electronics', 'food', 'lifestyle'])
    const [ro] = React.useState(['electronics', 'food'])
    return (
      <div>
        <Rule
          title="Tag 只能被「移除」，不能被「編輯」或「重排」"
          note="每個 Tag 右側的 X 是唯一被允許的互動——保持 Tag 的心智模型單純：它代表一個已選中的選項，要換就刪了重選"
        >
          <Combobox options={categoryOptions} value={value} onChange={setValue} aria-label="商品分類(Tag 移除範例)" />
          <Label>↑ 點 Tag 的 X 移除；右側 clear all 一次清除；新增從 dropdown 選擇</Label>
        </Rule>

        <Rule
          title="readonly / disabled 的 Tag 沒有任何互動"
          note="沒有 dismiss X、沒有 clear;readonly 不顯示 ChevronDown(純值、不可開啟),disabled 才保留為類型身份 indicator。Tag 變純顯示,溢出規則仍然套用(+N 指示器可 hover 查看完整)"
        >
          <Combobox mode="readonly" options={categoryOptions} value={ro} />
          <Label>↑ 不可移除、不可新增、不可清空——整個 field 變「顯示」</Label>
        </Rule>

        <Rule
          title="已選中的選項在下拉裡以打勾標示，再點一次即取消"
          note="桌機（預設）走自建浮層選單：已選項保留在清單中並以打勾呈現，再點一次即移除——避免使用者跨越下拉與 field 才能對照已選狀態。手機 / 觸控裝置改走原生 select，已選項則不重複出現在原生下拉"
        >
          <Combobox options={categoryOptions} value={['electronics']} onChange={() => {}} aria-label="商品分類(已選項打勾範例)" />
          <Label>↑ 打開 dropdown，Electronics 仍在清單裡並打勾，可再點一次取消</Label>
        </Rule>
      </div>
    )
  },
}

export const OverflowRule: Story = {
  name: '溢出指示必須存在',
  render: () => {
    const [value, setValue] = React.useState(['electronics', 'food', 'lifestyle', 'clothing', 'books', 'sports'])
    return (
      <div>
        <Rule
          title="+N 指示器是單行模式的必要元件"
          note="使用者必須知道「還有多少沒看到」——沒有 +N 的單行會誤導使用者以為選項已完整顯示。Hover 可看完整清單"
        >
          <Combobox options={categoryOptions} value={value} onChange={setValue} aria-label="商品分類(+N 溢出指示範例)" />
          <Label>↑ 窄容器內多個 Tag，自動出現 +N</Label>
        </Rule>

        <Rule
          title="❌ 不從零自刻下拉互動"
          note="與 Select 同理——下拉的開關、鍵盤導覽、聚焦管理、screen reader 支援很容易做不完整。Combobox 桌機走共用的浮層選單元件（已內建搜尋與方向鍵導覽），手機則走原生 picker，兩者都不該繞過去從零自刻"
        >
          <Label>實作細節見 Design System / Components / Combobox / 設計規格</Label>
        </Rule>
      </div>
    )
  },
}

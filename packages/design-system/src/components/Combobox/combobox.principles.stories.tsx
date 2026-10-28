// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { Combobox } from './combobox'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types' // ColumnMeta declaration merging
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/Combobox/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, examplesClassName: 'max-w-md' })

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

// 「表格儲存格用單行 + +N」範例:消費真 DataTable 的 multiSelect 欄(cell-registry 的 MultiSelectCell 就是表格裡的
// Combobox),用表格的預設固定行高 —— 不手刻表頭 / 列幾何去模擬一張表。
// 2026-10-20 T1:原本這則是「❌ Table cell 不用 wrap」,示範的卻是 DataTable 正式支援的「自動行高 + wrap 欄位」
// (data-table.spec.md「四、行高模式」:自動行高時 wrap: true 的欄位可換行撐高 row;cell-registry.tsx MultiSelectCell
// wrap = autoRowHeight && meta.wrap)—— 表格的 owner 已經允許的事不該被標成 ❌,改成教固定行高下的單行 + +N。
type ProductRow = { name: string; categories: string[] }
const WRAP_ROWS: ProductRow[] = [
  { name: 'Headphones', categories: ['electronics', 'lifestyle', 'sports'] },
  { name: 'USB Hub', categories: ['electronics'] },
]
const productCol = createColumnHelper<ProductRow>()
const WRAP_COLUMNS = [
  productCol.accessor('name', { header: 'Product', meta: { type: 'string', width: 120 } }),
  productCol.accessor('categories', { header: 'Categories', meta: { type: 'multiSelect', options: categoryOptions, width: 200 } }),
]

// ── Stories ───────────────────────────────────────────────────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [tags, setTags] = React.useState(['electronics', 'food'])
    return (
    <TutorialPage>
      <UsageSection kind="when">
        <p>多選(可選 0 個或多個)、選項 6 個以上、空間有限(表格儲存格、工具列篩選、窄欄位表單)的場景;開搜尋後可處理 50 個以上的選項。</p>
        <TutorialList>
          <li><StoryLink kind="Design System/Components/Combobox/展示" name="四模式">四模式</StoryLink></li>
          <li><StoryLink kind="Design System/Components/Combobox/展示" name="三種尺寸">尺寸與 Button 對齊</StoryLink></li>
          <li><StoryLink kind="Design System/Components/Combobox/展示" name="搜尋">搜尋</StoryLink></li>
          <li><StoryLink kind="Design System/Components/Combobox/展示" name="DataTable 整合">DataTable 整合</StoryLink></li>
        </TutorialList>
        <TutorialRule
          title="Combobox 的 sweet spot — 多選 + 空間受限 + 選項數 6+"
          note="Tag / 分類 / 協作成員 / 通知訂閱。使用者快速加選、移除，label 自帶語意不需描述"
        >
          <Combobox options={categoryOptions} value={tags} onChange={setTags} aria-label="商品分類(多選 Tag 範例)" />
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 單選:用 Select"
          note="Combobox 永遠多選——單選塞進來使用者每次要手動先移除舊 Tag 再選新的，多餘的互動"
        >
          <Combobox options={categoryOptions} value={['electronics']} onChange={() => {}} aria-label="商品分類(單選反例——應改用 Select)" />
          <ExampleCaption warn>↑ 只選一個 electronics → 應該用 Select，一次點擊完成切換</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 2-5 個選項且需要全可見 + description:用 Checkbox stack"
          note="權限授予、條款勾選、通知類型選擇——選項需要完整閱讀（含描述），決策後同意。Combobox 藏選項強迫多次點擊對比"
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
          <ExampleCaption warn>↑ 條款勾選是「完整閱讀後同意」→ 用 Checkbox stack 全露內容</ExampleCaption>
        </TutorialRule>

        <TutorialRule
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
          <ExampleCaption warn>↑ 用縮排偽造階層 → 沒有展開收合、不能按父節點全選、破壞資料結構</ExampleCaption>
        </TutorialRule>

        <TutorialRule title="❌ 一組各自獨立的開 / 關:用多個 Switch" note="每個開關是獨立的功能,不是「從清單裡選」" />
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="Combobox vs Checkbox 清單:都能從 2–5 個選項裡多選"
          note="Combobox 把選項收起來(多點一下、佔一行高),適合標籤自帶語意、要快速加選的情境(標籤、分類、協作成員);Checkbox 清單全部攤開(每個選項一行、可附說明),適合要仔細讀完才決定的情境(權限、條款)。法律 / 權限類的多選一律用 Checkbox 清單"
        />
        <TutorialRule title="Combobox vs Select:多選 vs 單選" note="Combobox 永遠多選、選中值以 Tag 呈現;只能選一個就用 Select,一次點擊完成切換" />
      </UsageSection>
    </TutorialPage>
    )
  },
}


export const WrapRule: Story = {
  name: 'Wrap 模式選擇',
  render: () => {
    const [single, setSingle] = React.useState(['electronics', 'food', 'lifestyle', 'clothing', 'books'])
    const [wrapped, setWrapped] = React.useState(['electronics', 'food', 'lifestyle', 'clothing', 'books'])
    return (
      <TutorialPage>
        <TutorialRule
          title="單行（預設）— Table cell、空間受限的 Form"
          note="固定高度，與 Input / Select 等欄位並排對齊。多於可見寬度的 Tag 以 +N 指示器代替，hover 可看完整清單"
        >
          <Combobox options={categoryOptions} value={single} onChange={setSingle} aria-label="商品分類(單行溢出範例)" />
          <ExampleCaption>↑ 單行：高度固定，超出的 Tag → +N</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="多行 wrap — 空間充裕的 Form"
          note="高度隨選中數量展開，每個 Tag 都完整可見。適合填答型表單——使用者一眼看到所有選項，不需 hover 溢出指示器"
        >
          <Combobox wrap options={categoryOptions} value={wrapped} onChange={setWrapped} aria-label="商品分類(多行 wrap 範例)" />
          <ExampleCaption>↑ 多行：完整展開，無溢出</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="表格儲存格:用單行 + +N(表格預設的固定行高)"
          note="固定行高的表格每一列同高,欄位的 wrap 會被忽略,放不下的 Tag 收成 +N,滑過看完整清單 —— 掃視節奏不被打斷。只有表格開了自動行高(autoRowHeight,給描述 / 備註這類要完整顯示的欄位)時,標了 wrap 的欄位才會換行撐高該列"
        >
          {/* 表格寬 = 窄欄位(DataTable 預設各欄均分剩餘寬度;max-w-sm 讓 Categories 欄放不下三個 Tag → 看得到 +N) */}
          <div className="w-full max-w-sm">
            <DataTable columns={WRAP_COLUMNS} data={WRAP_ROWS} getRowId={(r) => r.name} height="auto" />
          </div>
          <ExampleCaption>↑ 每列同高,放不下的 Tag 收成 +N</ExampleCaption>
        </TutorialRule>
      </TutorialPage>
    )
  },
}

export const TagOperationRule: Story = {
  name: 'Tag 操作規則',
  render: () => {
    const [value, setValue] = React.useState(['electronics', 'food', 'lifestyle'])
    const [ro] = React.useState(['electronics', 'food'])
    return (
      <TutorialPage>
        <TutorialRule
          title="Tag 只能被「移除」，不能被「編輯」或「重排」"
          note="每個 Tag 右側的 X 是唯一被允許的互動——保持 Tag 的心智模型單純：它代表一個已選中的選項，要換就刪了重選"
        >
          <Combobox options={categoryOptions} value={value} onChange={setValue} aria-label="商品分類(Tag 移除範例)" />
          <ExampleCaption>↑ 點 Tag 的 X 移除；右側 clear all 一次清除；新增從 dropdown 選擇</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="readonly / disabled 的 Tag 沒有任何互動"
          note="沒有 dismiss X、沒有 clear;readonly 不顯示 ChevronDown(純值、不可開啟),disabled 才保留為類型身份 indicator。Tag 變純顯示,溢出規則仍然套用(+N 指示器可 hover 查看完整)"
        >
          <Combobox mode="readonly" options={categoryOptions} value={ro} />
          <ExampleCaption>↑ 不可移除、不可新增、不可清空——整個 field 變「顯示」</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="已選中的選項在下拉裡以打勾標示，再點一次即取消"
          note="不分裝置，同一個自建浮層選單：已選項保留在清單中並以打勾呈現，再點一次即移除——避免使用者跨越下拉與 field 才能對照已選狀態"
        >
          <Combobox options={categoryOptions} value={['electronics']} onChange={() => {}} aria-label="商品分類(已選項打勾範例)" />
          <ExampleCaption>↑ 打開 dropdown，Electronics 仍在清單裡並打勾，可再點一次取消</ExampleCaption>
        </TutorialRule>
      </TutorialPage>
    )
  },
}

export const OverflowRule: Story = {
  name: '溢出指示必須存在',
  render: () => {
    const [value, setValue] = React.useState(['electronics', 'food', 'lifestyle', 'clothing', 'books', 'sports'])
    return (
      <TutorialPage>
        <TutorialRule
          title="+N 指示器是單行模式的必要元件"
          note="使用者必須知道「還有多少沒看到」——沒有 +N 的單行會誤導使用者以為選項已完整顯示。Hover 可看完整清單"
        >
          <Combobox options={categoryOptions} value={value} onChange={setValue} aria-label="商品分類(+N 溢出指示範例)" />
          <ExampleCaption>↑ 窄容器內多個 Tag，自動出現 +N</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 不從零自刻下拉互動"
          note="與 Select 同理——下拉的開關、鍵盤導覽、聚焦管理、screen reader 支援很容易做不完整。Combobox 不分裝置走同一個共用的浮層選單元件（已內建搜尋與方向鍵導覽），不該繞過去從零自刻"
        >
          <ExampleCaption>實作細節見 Design System / Components / Combobox / 設計規格</ExampleCaption>
        </TutorialRule>
      </TutorialPage>
    )
  },
}

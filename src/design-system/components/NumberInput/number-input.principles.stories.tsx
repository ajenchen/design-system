import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { NumberInput } from './number-input'
import { Input } from '@/design-system/components/Input/input'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types'

const meta: Meta = {
  title: 'Design System/Components/NumberInput/設計原則',
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
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3 max-w-md">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── Stories ───────────────────────────────────────────────────────────────────

export const AlignmentRule: Story = {
  name: '對齊原則',
  render: () => {
    const [value, setValue] = React.useState<number | null>(2490)
    interface Row { product: string; price: number; stock: number }
    const data: Row[] = [
      { product: 'Headphones', price: 2490, stock: 12 },
      { product: 'Chair', price: 890, stock: 3 },
      { product: 'Green Tea', price: 35, stock: 120 },
      { product: 'USB Hub', price: 1290, stock: 0 },
    ]
    const col = createColumnHelper<Row>()
    const columns = [
      col.accessor('product', { header: 'Product', size: 160, meta: { type: 'string' } }),
      col.accessor('price', { header: 'Price', size: 120, meta: { type: 'currency', prefix: '$' } }),
      col.accessor('stock', { header: 'Stock', size: 100, meta: { type: 'number' } }),
    ]
    return (
      <div>
        <Rule
          title="Edit 模式 — 靠左（input 打字由左往右）"
          note="使用者打字是由左到右的連續動作，數字從左邊出現最自然。Edit 模式不需要比較位數"
        >
          <NumberInput value={value} onChange={setValue} prefix="$" />
        </Rule>

        <Rule
          title="Table cell — 靠右（縱向比較位數）"
          note="表格中同欄的數字需要對齊小數點/個位數，右對齊讓使用者一眼比較大小。由 DataTable 的 column meta type=number / currency 自動套用，不需要手動設對齊"
        >
          <div className="w-full max-w-lg">
            <DataTable columns={columns} data={data} height="auto" />
          </div>
          <Label>↑ price 和 stock 欄自動右對齊，小數點縱向對齊</Label>
        </Rule>

        <Rule
          title="❌ 不要手動改動對齊方向"
          note="edit 左、table 右是跨產業的共識（Excel、會計軟體、財務系統都是）。手動反向會讓使用者的掃視習慣被打破"
        >
          <NumberInput value={value} onChange={setValue} prefix="$" className="text-right" />
          <Label warn>↑ Edit input 強制右對齊 → 打字時游標位置感變怪</Label>
        </Rule>
      </div>
    )
  },
}

export const FormatOptionsRule: Story = {
  name: '格式化選項使用',
  render: () => (
    <div>
      <Rule
        title="prefix — 置於數字前的符號（貨幣是最常見場景）"
        note="prefix 會同時出現在 edit、readonly、DataTable cell。使用者不需要自己輸入 $——打字就是純數字"
      >
        <NumberInput mode="readonly" value={2490} prefix="$" />
        <NumberInput mode="readonly" value={12500} prefix="NT$" precision={0} />
      </Rule>

      <Rule
        title="suffix — 置於數字後的單位（百分比、度量）"
        note="suffix 標示「這個數字代表什麼」。%、°C、kg、ms 都是適合 suffix 的單位"
      >
        <NumberInput mode="readonly" value={85.5} suffix="%" precision={1} />
        <NumberInput mode="readonly" value={36.5} suffix="°C" precision={1} />
      </Rule>

      <Rule
        title="precision — 固定小數位數"
        note="需要一致位數時才設——金融、科學、測量。整數欄位不需要 precision（預設就是不補零）"
      >
        <NumberInput mode="readonly" value={85} suffix="%" precision={2} />
        <Label>↑ 85 → 85.00%（科學報告、金融報表場景）</Label>
      </Rule>

      <Rule
        title="❌ 不要手動拼接格式化字串"
        note="手動用 toLocaleString() 或字串模板格式化會導致 edit / readonly / table cell 不一致——三個地方都要各自寫一遍格式化邏輯，且 locale 切換時全部要改"
      >
        <Input defaultValue="$2,490.00" />
        <Label warn>↑ 用 Input + 手動格式化字串 → 使用者打字時要 parse「$2,490.00」→ 脆且不 locale-aware</Label>
      </Rule>
    </div>
  ),
}

export const DataTypeMatchRule: Story = {
  name: '數字一律用 NumberInput',
  render: () => (
    <div>
      <Rule
        title="所有數值資料都用 NumberInput——不用 Input type=number"
        note="NumberInput 提供：千分位格式化、locale 切換、prefix/suffix、precision、edit 左 / table 右 對齊、DataTable 自動整合。原生 input type=number 這些都沒有"
      >
        <NumberInput mode="readonly" value={1234567} prefix="$" />
        <NumberInput mode="readonly" value={85.5} suffix="%" precision={1} />
        <NumberInput mode="readonly" value={12500} />
      </Rule>

      <Rule
        title="❌ 不用 Input 顯示數字"
        note="即使值看起來「就是數字字串」，缺少格式化會讓大數字不可讀（1234567 vs 1,234,567）。Edit 與 Display 分離是 Field 設計的基本前提——用 NumberInput 兩者都得到"
      >
        <Input defaultValue="1234567" />
        <Label warn>↑ 1234567 難讀、無貨幣前綴、無 locale、無右對齊</Label>
      </Rule>

      <Rule
        title="❌ 看起來像數字但不是算術型的資料：用 Input"
        note="電話、郵遞區號、身分證字號、產品代碼都「長得像數字」但不是算術型 value——不做加減、不做千分位、不做 step。用 NumberInput 會錯誤套用千分位（0912-345-678 變成「912,345,678」）、誤導 mobile 彈出數字鍵盤且關閉符號輸入"
      >
        <NumberInput value={912345678} onChange={() => {}} />
        <Label warn>↑ 電話 912-345-678 被當 912,345,678 格式化 → 數字意義錯誤</Label>
        <Input defaultValue="0912-345-678" />
        <Label>↑ 電話用 Input（可自訂 type=tel 或 pattern），保留 dash / 前導零</Label>
      </Rule>
    </div>
  ),
}

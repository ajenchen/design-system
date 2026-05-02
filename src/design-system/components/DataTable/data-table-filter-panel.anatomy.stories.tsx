// @anatomy-exempt: composite expression-builder。色彩 / 尺寸繼承 Field + Select + Combobox 上游 SSOT。
// @anatomy-rationale:
//   ColorMatrix 由消費的 child component(Select / Combobox / Input / DatePicker)各自 spec 決定。
//   StateBehavior 已 covered by ColumnTypeStateMatrix(各 column type 對應 op set + value picker)。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTableFilterPanel, type FilterTree } from './data-table-filter-panel'

interface Row {
  sku: string
  name: string
  category: string
  stock: number
  releasedAt: string
}

const COLUMNS: ColumnDef<Row>[] = [
  { accessorKey: 'sku', header: 'SKU', meta: { type: 'string', filterable: true } },
  { accessorKey: 'name', header: '名稱', meta: { type: 'string', filterable: true } },
  {
    accessorKey: 'category',
    header: '類別',
    meta: {
      type: 'select',
      filterable: true,
      options: [
        { value: 'Electronics', label: 'Electronics' },
        { value: 'Furniture',   label: 'Furniture' },
      ],
    },
  },
  { accessorKey: 'stock', header: '庫存', meta: { type: 'number', filterable: true } },
  { accessorKey: 'releasedAt', header: '上架時間', meta: { type: 'date', filterable: true, includeTime: true } },
]

const meta: Meta<typeof DataTableFilterPanel<Row>> = {
  title: 'Design System/Components/DataTableFilterPanel/設計規格',
  component: DataTableFilterPanel<Row>,
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj<typeof DataTableFilterPanel<Row>>

export const Overview: Story = {
  name: '元件總覽',
  render: () => {
    const [v, setV] = React.useState<FilterTree>({
      mode: 'flat',
      conjunction: 'and',
      children: [
        { kind: 'cond', id: 'c1', field: 'name', op: 'contains', value: 'phone' },
      ],
    })
    return (
      <div className="w-[640px]">
        <DataTableFilterPanel<Row> mode="flat" columns={COLUMNS} value={v} onChange={setV} />
      </div>
    )
  },
}

/** Inspector — props 一覽 */
export const Inspector: Story = {
  name: '元件檢閱器',
  render: () => (
    <div className="w-[680px] text-body">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-divider">
            <th className="text-left py-2 px-3">Prop</th>
            <th className="text-left py-2 px-3">Type</th>
            <th className="text-left py-2 px-3">Default</th>
            <th className="text-left py-2 px-3">說明</th>
          </tr>
        </thead>
        <tbody className="text-fg-muted">
          <tr className="border-b border-divider"><td className="py-2 px-3 font-mono">mode</td><td>flat ⏐ nested</td><td>—</td><td>mount 後不可動態切換</td></tr>
          <tr className="border-b border-divider"><td className="py-2 px-3 font-mono">columns</td><td>ColumnDef[]</td><td>—</td><td>有 meta.type 才算 filterable</td></tr>
          <tr className="border-b border-divider"><td className="py-2 px-3 font-mono">value</td><td>FilterTree</td><td>—</td><td>controlled-only</td></tr>
          <tr className="border-b border-divider"><td className="py-2 px-3 font-mono">onChange</td><td>(t) ⇒ void</td><td>—</td><td>tree 異動 callback</td></tr>
          <tr className="border-b border-divider"><td className="py-2 px-3 font-mono">defaultValue</td><td>FilterTree?</td><td>—</td><td>refresh icon 顯示判定 baseline</td></tr>
          <tr className="border-b border-divider"><td className="py-2 px-3 font-mono">prefilledColumnId</td><td>string?</td><td>—</td><td>cell 「Filter by this」帶入</td></tr>
        </tbody>
      </table>
    </div>
  ),
}

/** ColorMatrix — 繼承 Select / Combobox / Input / DatePicker */
export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="w-[480px] text-body flex flex-col gap-3">
      <p className="text-fg-muted">
        本 panel 是 expression builder composer。色彩繼承上游消費元件:
      </p>
      <ul className="text-fg-muted ml-4 list-disc">
        <li>Field / Op Select:<code>Select</code> 提供</li>
        <li>Value picker(text/number/date/datetime/select_multi):各自元件 spec</li>
        <li>Group container 灰底:<code>--color-neutral-1</code>(含 padding + rounded)</li>
        <li>Conjunction「Where」靜態 label:<code>--fg-muted</code></li>
        <li>「+ 加條件」/「+ 加入巢狀篩選」:<code>Button variant=tertiary</code></li>
      </ul>
    </div>
  ),
}

/** SizeMatrix — panel 自己無 size variant,row controls 走 size=md 統一 */
export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="max-w-[480px] text-body flex flex-col gap-3 text-fg-muted">
      <p>Panel 自身無 size variant。row 內所有控制元件鎖死 <code>size=md</code> 對齊 row 高度。</p>
      <p>Row layout:<code>conjunction(80px)</code> + <code>field(160px)</code> + <code>op(128px)</code> + <code>value picker(flex-1)</code> + <code>trash(32px inline-action)</code>。</p>
    </div>
  ),
}

/** StateBehavior — flat / nested mode + empty / with-condition */
export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => {
    const [flatEmpty, setFlatEmpty] = React.useState<FilterTree>({ mode: 'flat', conjunction: 'and', children: [] })
    const [nested, setNested] = React.useState<FilterTree>({
      mode: 'nested',
      conjunction: 'or',
      children: [
        {
          kind: 'group', id: 'g1', conjunction: 'and',
          children: [{ kind: 'cond', id: 'c1', field: 'category', op: 'is', value: ['Electronics'] }],
        },
        {
          kind: 'group', id: 'g2', conjunction: 'and',
          children: [{ kind: 'cond', id: 'c2', field: 'stock', op: 'gt', value: 10 }],
        },
      ],
    })
    return (
      <div className="flex flex-col gap-8">
        <div className="w-[640px]">
          <p className="text-caption text-fg-muted mb-2">flat — 空(panel 自動填 1 條空 row)</p>
          <DataTableFilterPanel<Row> mode="flat" columns={COLUMNS} value={flatEmpty} onChange={setFlatEmpty} />
        </div>
        <div className="w-[680px]">
          <p className="text-caption text-fg-muted mb-2">nested — 兩 group(group 共用 conjunction)</p>
          <DataTableFilterPanel<Row> mode="nested" columns={COLUMNS} value={nested} onChange={setNested} />
        </div>
      </div>
    )
  },
}

/** Accessibility — keyboard map + ARIA */
export const Accessibility: Story = {
  name: 'A11y',
  render: () => (
    <div className="w-[640px] text-body flex flex-col gap-3">
      <h3 className="font-bold">ARIA roles</h3>
      <ul className="text-fg-muted ml-4 list-disc">
        <li>Panel:<code>role=dialog</code>(由 Popover 提供)</li>
        <li>Conjunction / Field / Op:<code>Select</code> 內建 combobox semantics + 額外 <code>aria-label</code></li>
        <li>Value picker(各 type):繼承元件 a11y;panel 傳入 <code>{`{label} 篩選值`}</code> aria-label</li>
        <li>刪除 row:<code>ItemInlineActionButton aria-label=刪除</code></li>
      </ul>
      <h3 className="font-bold mt-3">Keyboard map</h3>
      <table className="w-full border-collapse text-fg-muted">
        <tbody>
          <tr className="border-b border-divider"><td className="py-1 pr-4 font-mono">Tab</td><td>conjunction → field → op → value → trash → 下一 row → ... → +加條件</td></tr>
          <tr className="border-b border-divider"><td className="py-1 pr-4 font-mono">Esc</td><td>關 panel(Popover 處理)</td></tr>
          <tr className="border-b border-divider"><td className="py-1 pr-4 font-mono">Open focus</td><td>panel 開啟 focus 第 1 row 的 field selector</td></tr>
        </tbody>
      </table>
    </div>
  ),
}

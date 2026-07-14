import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Pagination } from './pagination'

const meta: Meta<typeof Pagination> = {
  title: 'Design System/Components/Pagination/展示',
  component: Pagination,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Pagination>

/* ── 預設 ── */
export const Default: Story = {
  name: '預設',
  render: () => {
    const [page, setPage] = React.useState(3)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-caption text-fg-muted">
          客服工單佇列:共 128 筆、每頁 20 筆 → 7 頁。
        </p>
        <Pagination total={128} page={page} onPageChange={setPage} />
      </div>
    )
  },
}

/* ── 完整形態(資訊左、操作右) ── */
export const FullBar: Story = {
  name: '完整形態',
  render: () => {
    const [page, setPage] = React.useState(1)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-caption text-fg-muted">
          搜尋結果頁:顯示總筆數 + 每頁筆數選單,左資訊右操作;換每頁筆數會自動回第 1 頁。
        </p>
        <Pagination
          total={85}
          page={page}
          onPageChange={setPage}
          showTotal
          pageSizeOptions={[10, 20, 50]}
        />
      </div>
    )
  },
}

/* ── 大量頁數摺疊 ── */
export const ManyPages: Story = {
  name: '大量頁數摺疊',
  render: () => {
    const [page, setPage] = React.useState(42)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-caption text-fg-muted">
          商品 SKU 目錄 10,000 筆 / 每頁 20 = 500 頁:恆 ≤ 7 格位、雙側 … 摺疊(boundary/sibling
          = 1/1,MUI 預設同款);… 為純指示不可點。翻到頭尾附近時摺疊自動變單側。
        </p>
        <Pagination total={10000} page={page} onPageChange={setPage} />
      </div>
    )
  },
}

/* ── 邊界狀態(R3 hasInteractiveStates) ── */
export const States: Story = {
  name: '邊界狀態',
  render: () => {
    const [first, setFirst] = React.useState(1)
    const [last, setLast] = React.useState(7)
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-caption text-fg-muted mb-2">第一頁 — 上一頁按鈕 disabled</p>
          <Pagination total={128} page={first} onPageChange={setFirst} />
        </div>
        <div>
          <p className="text-caption text-fg-muted mb-2">最後一頁 — 下一頁按鈕 disabled</p>
          <Pagination total={128} page={last} onPageChange={setLast} />
        </div>
        <div>
          <p className="text-caption text-fg-muted mb-2">
            單頁(total ≤ pageSize)— 照常渲染保持版面穩定(Ant hideOnSinglePage=false + MUI 同);
            total=0 則整個不渲染
          </p>
          <Pagination total={15} page={1} onPageChange={() => {}} />
        </div>
      </div>
    )
  },
}

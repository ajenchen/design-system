import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Pagination } from './pagination'

const meta: Meta<typeof Pagination> = {
  title: 'Design System/Components/Pagination/展示',
  component: Pagination,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: '讓使用者在離散資料頁之間前後移動或直接跳頁，並保留目前頁位置。資料量需要分頁載入或 URL 可定位頁碼時使用；連續探索內容可改用載入更多。' } },
  },
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

/* ── 窄容器階梯 ── */
/**
 * 同一份分頁列放進五個固定寬度的容器 —— 每一階砍掉的都**不是導覽模型本身**,所以數字頁碼
 * 一路活到最窄:先收「每頁筆數」(設定),再把格位 7 → 5(同一模式、視窗變小),
 * 最後收「第 x–y 筆」(opt-in 資訊)。**資訊文字永遠不會超過一行** —— 階梯在它需要換行之前
 * 就先砍別的。砍無可砍時整條橫向可捲,不換行也不截斷。
 *
 * 量的是**容器**不是視窗:表格被側欄擠窄時,視窗可能還有 1440px,視窗斷點在那個情境不會動。
 */
export const NarrowLadder: Story = {
  name: '窄容器階梯',
  render: () => {
    const widths = [600, 480, 400, 300, 200]
    return (
      <div className="flex flex-col gap-6">
        <p className="text-caption text-fg-muted">
          由寬到窄:完整 → 收每頁筆數 → 格位 7 變 5 → 收資訊文字 → 橫向可捲。
        </p>
        {widths.map((w) => (
          <div key={w} className="flex flex-col gap-1">
            <span className="text-caption text-fg-muted tabular-nums">容器 {w}px</span>
            <div style={{ width: w }} className="rounded-sm border border-divider p-2">
              <Pagination total={128} defaultPage={5} showTotal pageSizeOptions={[10, 20, 50]} />
            </div>
          </div>
        ))}
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

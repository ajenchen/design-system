import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Pagination } from './pagination'
import { SegmentedControl, SegmentedControlItem } from '@/design-system/components/SegmentedControl/segmented-control'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/Pagination/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers(同 Breadcrumb principles idiom) ──────────────────────────────────

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(v3 canonical,Polaris/Material/Ant 共識)──

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [page, setPage] = React.useState(2)
    const [view, setView] = React.useState('list')
    return (
      <div>
        <Rule
          title="何時用:大量資料切頁後的位置導覽"
          note="使用者需要知道總頁數、且可能直接跳到某頁的順序瀏覽 —— 訂單列表、搜尋結果、SKU 目錄。表格情境優先用 <DataTable pagination> 內建(內部就是消費本元件),standalone 留給非 DataTable 的列表頁。"
        >
          <Pagination total={128} page={page} onPageChange={setPage} />
          <Label>✓ 訂單管理列表底部:128 筆訂單 / 每頁 20 筆,置於列表下方、間距 tight</Label>
        </Rule>

        <Rule
          title="何時不用:無盡瀏覽 feed → load-more / 虛擬滾動"
          note="activity stream、通知列表這類「往下讀」的流,頁碼是錯的心智模型 —— 使用者不在乎第幾頁,只在乎更多內容。與虛擬滾動互斥:兩者是互斥的大資料策略(TanStack 官方定位),同一份資料不可同時用。"
        >
          <Button variant="secondary">載入更多通知</Button>
          <Label>✓ feed 尾端用 load-more;超大資料集在 DataTable 內建虛擬滾動</Label>
          <Label warn>✗ 給 activity feed 加頁碼 —— 讀流被切斷,回頭找內容也記不住頁碼</Label>
        </Rule>

        <Rule
          title="vs SegmentedControl:位置導覽 ≠ 互斥選值"
          note="兩者都是「多顆亮一顆」,語意完全不同:SegmentedControl 選項固定 2-5 個、每顆有語意(清單/看板/時間軸),恆有一值;Pagination 頁數動態、可摺疊、數字本身無語意,當前頁是「你在哪」不是「你選了什麼」。"
        >
          <SegmentedControl value={view} onValueChange={(v) => v && setView(v)} aria-label="檢視切換">
            <SegmentedControlItem value="list">清單</SegmentedControlItem>
            <SegmentedControlItem value="board">看板</SegmentedControlItem>
            <SegmentedControlItem value="timeline">時間軸</SegmentedControlItem>
          </SegmentedControl>
          <Label>✓ 檢視切換用 SegmentedControl(互斥選值)</Label>
          <Label warn>✗ 用 Pagination 做檢視切換,或用 SegmentedControl 排頁碼</Label>
        </Rule>

        <Rule
          title="流程推進不是翻頁"
          note="精靈流程「上一步 / 下一步」走 Steps(進度指示)+ Button(推進),不是頁碼 —— 頁碼可任意跳,流程有順序依賴;混用會讓使用者以為可以跳過必填步驟。"
        >
          <Label>✓ 註冊精靈 / 建立專案引導 → Steps + Button</Label>
          <Label warn>✗ 精靈底部放 1 2 3 4 頁碼</Label>
        </Rule>
      </div>
    )
  },
}

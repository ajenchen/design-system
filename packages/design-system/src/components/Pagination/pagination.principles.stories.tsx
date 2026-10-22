import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Pagination } from './pagination'
import { SegmentedControl, SegmentedControlItem } from '@/design-system/components/SegmentedControl/segmented-control'
import { Button } from '@/design-system/components/Button/button'
import { TutorialPage, UsageSection, TutorialList, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/Pagination/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


// 範例維持自然寬度(naturalWidth):「載入更多」按鈕不被拉滿,不再逐顆寫 self-start(T15)
const TutorialRule = createTutorialRule({ examples: true, naturalWidth: true })

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(v3 canonical,Polaris/Material/Ant 共識)──

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [page, setPage] = React.useState(2)
    const [view, setView] = React.useState('list')
    return (
      <TutorialPage>
        <UsageSection kind="when">
          <TutorialRule
            title="大量資料切頁後的位置導覽"
            note="使用者需要知道總頁數、且可能直接跳到某頁的順序瀏覽 —— 訂單列表、搜尋結果、SKU 目錄。表格情境優先用 <DataTable pagination> 內建(內部就是消費本元件),standalone 留給非 DataTable 的列表頁。"
          >
            <Pagination total={128} page={page} onPageChange={setPage} />
            <ExampleCaption>✅ 訂單管理列表底部:128 筆訂單 / 每頁 20 筆,置於列表下方、間距 tight</ExampleCaption>
          </TutorialRule>
        </UsageSection>

        <UsageSection kind="whenNot">
          <TutorialRule
            title="❌ 無盡瀏覽的動態:用「載入更多」或虛擬捲動"
            note="activity stream、通知列表這類「往下讀」的流,頁碼是錯的心智模型 —— 使用者不在乎第幾頁,只在乎更多內容。與虛擬滾動互斥:兩者是互斥的大資料策略(TanStack 官方定位),同一份資料不可同時用。"
          >
            <Button variant="tertiary">載入更多通知</Button>
            <ExampleCaption>✅ feed 尾端用 load-more;超大資料集在 DataTable 內建虛擬滾動</ExampleCaption>
            <ExampleCaption warn>❌ 給 activity feed 加頁碼 —— 讀流被切斷,回頭找內容也記不住頁碼</ExampleCaption>
          </TutorialRule>

          <TutorialRule
            title="❌ 精靈流程的上一步 / 下一步:用 Steps + Button"
            note="精靈流程「上一步 / 下一步」走 Steps(進度指示)+ Button(推進),不是頁碼 —— 頁碼可任意跳,流程有順序依賴;混用會讓使用者以為可以跳過必填步驟。"
          >
            <ExampleCaption>✅ 註冊精靈 / 建立專案引導 → Steps + Button</ExampleCaption>
            <ExampleCaption warn>❌ 精靈底部放 1 2 3 4 頁碼</ExampleCaption>
          </TutorialRule>
          <TutorialList>
            <li>資料表已經用 DataTable → 開 DataTable 內建的分頁,不在表格下面自己手排一個 Pagination</li>
            <li>資料不到 2 頁、以後也不會變多 → 不放分頁</li>
          </TutorialList>
        </UsageSection>

        <UsageSection kind="siblings">
          <TutorialRule
            title="Pagination vs SegmentedControl:位置導覽 ≠ 互斥選值"
            note="兩者都是「多顆亮一顆」,語意完全不同:SegmentedControl 選項固定 2-5 個、每顆有語意(清單/看板/時間軸),恆有一值;Pagination 頁數動態、可摺疊、數字本身無語意,當前頁是「你在哪」不是「你選了什麼」。"
          >
            <SegmentedControl value={view} onValueChange={(v) => v && setView(v)} aria-label="檢視切換">
              <SegmentedControlItem value="list">清單</SegmentedControlItem>
              <SegmentedControlItem value="board">看板</SegmentedControlItem>
              <SegmentedControlItem value="timeline">時間軸</SegmentedControlItem>
            </SegmentedControl>
            <ExampleCaption>✅ 檢視切換用 SegmentedControl(互斥選值)</ExampleCaption>
            <ExampleCaption warn>❌ 用 Pagination 做檢視切換,或用 SegmentedControl 排頁碼</ExampleCaption>
          </TutorialRule>
          <TutorialList>
            <li><strong>DataTable 內建分頁</strong> —— 表格情境一律用它(內部就是 Pagination);獨立的 Pagination 留給不是表格的列表 / 搜尋結果頁</li>
            <li><strong>虛擬捲動</strong> —— 和分頁是互斥的大資料策略:分頁是主動換頁、每頁固定筆數;虛擬捲動是連續捲動。同一份資料不可同時用</li>
          </TutorialList>
        </UsageSection>
      </TutorialPage>
    )
  },
}

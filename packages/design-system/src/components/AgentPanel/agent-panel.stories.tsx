// @story-history: 家族展示層 = 真實業務場景 + OpenSnapshot 覆蓋(M15:defaultOpen/常駐可截圖);
// 標誌/FAB 狀態矩陣屬本層(動態資產,anatomy 靜態矩陣載不動)。
// 2026-09-02 review round:固定構件恆渲染(header +/×/標題觸發、輸入盒 +/Tag ×)後,每個 story
// 都必須傳齊必填 callback;歷史浮層 OpenSnapshot、決策卡三題步進、拖拉寬度、FAB↔面板互斥補齊。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  AgentPanel,
  AgentPanelHeader,
  AgentConversation,
  AgentMessage,
  AgentThinking,
  AgentToolbar,
  AgentPromptInput,
  AgentDecisionCard,
  AgentDecisionSummary,
  type AgentConversationSummary,
  type AgentPromptAttachment,
} from './agent-panel'
import { AgentLogo } from './agent-logo'
import { AgentFab } from './agent-fab'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import type { ColumnDef } from '@tanstack/react-table'
import { Empty } from '@/design-system/components/Empty/empty'

const meta: Meta<typeof AgentPanel> = {
  title: 'Design System/Components/AgentPanel/展示',
  component: AgentPanel,
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof AgentPanel>

const noop = () => {}

/** 面板站右側全高:模擬 app 右欄環境。 */
function PanelFrame({ children }: { children: React.ReactNode }) {
  return <div className="flex h-dvh justify-end bg-surface-sunken">{children}</div>
}

const CONVERSATIONS: AgentConversationSummary[] = [
  { id: 'c1', title: '衝刺待辦整理', group: '今天', thinking: true },
  { id: 'c2', title: '發布公告草稿', group: '今天' },
  { id: 'c3', title: 'Q3 客訴分類', group: '過去 7 天' },
  { id: 'c4', title: '競品定價彙整', group: '過去 7 天' },
]

/** 所有 story 共用的標題列接線(固定構件恆渲染;真實產品同樣必接)。 */
const headerWiring = {
  conversations: CONVERSATIONS,
  onSelectConversation: noop,
  onRenameConversation: noop,
  onDeleteConversation: noop,
  onNewConversation: noop,
  onClose: noop,
}

const promptWiring = { onSubmit: noop, onRemoveAttachment: noop, onAddAttachment: noop }

/** 任務助理完整對話:附件氣泡 + 思考塊 + 工具列 + 輸入盒(真實 Jira 型場景)。 */
export const TaskAssistant: Story = {
  name: '任務助理完整對話',
  render: function TaskAssistantStory() {
    const [value, setValue] = React.useState('')
    const [attachments, setAttachments] = React.useState<AgentPromptAttachment[]>([
      { id: 't1', label: 'oncall-規範.pdf' },
    ])
    return (
      <PanelFrame>
        <AgentPanel>
          <AgentPanelHeader title="衝刺待辦整理" logoState="think" activeConversationId="c1" {...headerWiring} />
          <AgentConversation>
            <AgentMessage
              role="user"
              attachments={[
                { id: 'a1', label: 'sprint-42-backlog.csv' },
                { id: 'a2', label: '排程規則.md' },
              ]}
            >
              把這份待辦按優先級重排,衝突的排程幫我標出來。
            </AgentMessage>
            <AgentMessage role="agent" toolbar={<AgentToolbar pinned onCopy={noop} onLike={noop} onDislike={noop} />}>
              <AgentThinking
                thinking
                steps={[<span key="1">已讀取 48 筆待辦</span>, <span key="2">比對排程規則 12 條</span>]}
                currentStep={<span>正在標記衝突項目…</span>}
              />
              <p className="mt-2">
                初步整理完成:P0 共 6 筆,其中「支付逾時重試」與「對帳批次」的排程互相衝突,建議錯開到不同夜間時段。
              </p>
            </AgentMessage>
          </AgentConversation>
          <AgentPromptInput
            value={value}
            onValueChange={setValue}
            onSubmit={() => setValue('')}
            busy
            onStop={noop}
            attachments={attachments}
            onRemoveAttachment={(a) => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
            onAddAttachment={() =>
              setAttachments((prev) => [...prev, { id: `t${prev.length + 1}`, label: `附件-${prev.length + 1}.md` }])
            }
          />
        </AgentPanel>
      </PanelFrame>
    )
  },
}

/** 歷史浮層開啟(OpenSnapshot):分組、搜尋、思考中列、目前對話高亮、懸停/鍵盤浮出改名與刪除。 */
export const HistoryOpen: Story = {
  name: '歷史浮層開啟',
  render: () => (
    <PanelFrame>
      <AgentPanel>
        <AgentPanelHeader title="衝刺待辦整理" activeConversationId="c1" defaultHistoryOpen {...headerWiring} />
        <AgentConversation>
          <AgentMessage role="agent">從標題或箭頭點開歷史;懸停或 Tab 到某一列會浮出改名與刪除。</AgentMessage>
        </AgentConversation>
        <AgentPromptInput value="" onValueChange={noop} {...promptWiring} />
      </AgentPanel>
    </PanelFrame>
  ),
}

/** 新對話:尚未送出任何訊息 → 「+」停用(當前就是新的);空狀態問候用招喚態標誌。 */
export const NewConversation: Story = {
  name: '新對話(空狀態)',
  render: () => (
    <PanelFrame>
      <AgentPanel>
        <AgentPanelHeader title="新對話" conversationEmpty {...headerWiring} />
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Empty
            icon={<AgentLogo state="attract" size={48} detail="full" label="智慧代理" />}
            title="開始第一個對話"
            description="丟一個任務給代理,或把檔案拖進來。"
          />
        </div>
        <AgentPromptInput value="" onValueChange={noop} {...promptWiring} />
      </AgentPanel>
    </PanelFrame>
  ),
}

const THREE_QUESTIONS = [
  {
    id: 'tone',
    label: '公告要用哪種語氣?',
    options: [
      { value: 'formal', label: '正式版', description: '對外客戶公告,保守措辭' },
      { value: 'casual', label: '輕鬆版', description: '內部頻道,口語化' },
    ],
  },
  {
    id: 'when',
    label: '什麼時候發布?',
    options: [
      { value: 'now', label: '立即', description: '合併後馬上發' },
      { value: 'tonight', label: '今晚 20:00', description: '避開上班尖峰' },
      { value: 'tomorrow', label: '明早 09:00', description: '跟每日站會一起' },
    ],
  },
  {
    id: 'channels',
    label: '公告要同步到哪些管道?',
    multiSelect: true,
    options: [
      { value: 'slack', label: 'Slack #general', description: '即時,可直接討論' },
      { value: 'email', label: '全員 Email', description: '留存,主管可轉寄' },
      { value: 'notion', label: 'Notion 公告頁', description: '長期查閱' },
    ],
  },
]

/** 決策卡(OpenSnapshot):三題步進——「1 / 3」小標、灰底選項卡、其他卡常駐輸入格、跳過/下一題。 */
export const DecisionCardOpen: Story = {
  name: '決策卡三題步進',
  render: () => (
    <PanelFrame>
      <AgentPanel>
        <AgentPanelHeader title="發布公告草稿" activeConversationId="c2" {...headerWiring} />
        <AgentConversation>
          <AgentMessage role="agent">公告已寫好兩個版本,需要你決定語氣、發布時間與同步管道再繼續。</AgentMessage>
        </AgentConversation>
        <div className="relative">
          <AgentPromptInput value="" onValueChange={noop} {...promptWiring} />
          <AgentDecisionCard questions={THREE_QUESTIONS} onSubmit={noop} onSkip={noop} />
        </div>
      </AgentPanel>
    </PanelFrame>
  ),
}

/** 單題決策卡:只有一道題 → 不顯示「n / N」小標,主鈕直接是「送出」。 */
export const DecisionCardSingle: Story = {
  name: '決策卡單題',
  render: () => (
    <PanelFrame>
      <AgentPanel>
        <AgentPanelHeader title="發布公告草稿" activeConversationId="c2" {...headerWiring} />
        <AgentConversation>
          <AgentMessage role="agent">只剩語氣沒定,選一個就能繼續。</AgentMessage>
        </AgentConversation>
        <div className="relative">
          <AgentPromptInput value="" onValueChange={noop} {...promptWiring} />
          <AgentDecisionCard questions={[THREE_QUESTIONS[0]]} onSubmit={noop} onSkip={noop} />
        </div>
      </AgentPanel>
    </PanelFrame>
  ),
}

/** 決策回執:拍板後在對話流中的靜態紀錄。 */
export const DecisionSummaryInFlow: Story = {
  name: '決策回執',
  render: () => (
    <PanelFrame>
      <AgentPanel>
        <AgentPanelHeader title="發布公告草稿" activeConversationId="c2" {...headerWiring} />
        <AgentConversation>
          <AgentMessage role="agent">
            已按你的選擇繼續:
            <AgentDecisionSummary
              className="mt-2"
              entries={[
                { question: '公告要用哪種語氣?', answer: '正式版' },
                { question: '什麼時候發布?', answer: '今晚 20:00' },
              ]}
            />
          </AgentMessage>
        </AgentConversation>
        <AgentPromptInput value="" onValueChange={noop} {...promptWiring} />
      </AgentPanel>
    </PanelFrame>
  ),
}

/** 拖拉寬度:左緣把手 360–640(且不超過視窗一半),鍵盤 ←/→ 每次 16;寬度由產品自存。 */
export const ResizableWidth: Story = {
  name: '拖拉寬度',
  render: function ResizableStory() {
    const [width, setWidth] = React.useState(400)
    return (
      <div className="flex h-dvh bg-surface-sunken">
        <div className="flex flex-1 items-center justify-center text-body text-fg-secondary">
          目前寬度 {width}px(拖左緣把手,或聚焦把手後按 ←/→)
        </div>
        <AgentPanel width={width} onWidthChange={setWidth}>
          <AgentPanelHeader title="衝刺待辦整理" activeConversationId="c1" {...headerWiring} />
          <AgentConversation>
            <AgentMessage role="agent">面板寬度 360 起跳、640 封頂,且永遠不超過視窗一半。</AgentMessage>
          </AgentConversation>
          <AgentPromptInput
            value=""
            onValueChange={noop}
            attachments={[
              { id: 'a1', label: 'sprint-42-backlog.csv' },
              { id: 'a2', label: '排程規則.md' },
              { id: 'a3', label: 'oncall-規範.pdf' },
              { id: 'a4', label: '客訴-2026Q3.xlsx' },
            ]}
            {...promptWiring}
          />
        </AgentPanel>
      </div>
    )
  },
}

/** 入口鈕遮擋樣張的資料:滿版訂單表(DataTable 分頁 archetype 同 data-table.stories WithPagination)。 */
type OrderRow = { id: string; orderNo: string; customer: string; amount: number; placedAt: string }
const ORDER_ROWS: OrderRow[] = Array.from({ length: 128 }, (_, i) => ({
  id: `order-${i + 1}`,
  orderNo: `SO-2026-${String(1001 + i)}`,
  customer: ['Acme Corp', 'Globex', 'Initech', 'Umbrella', 'Stark Industries', 'Wayne Enterprises'][i % 6],
  amount: 1200 + ((i * 137) % 8800),
  placedAt: `2026-0${(i % 6) + 1}-${String((i % 27) + 1).padStart(2, '0')}`,
}))
const orderColumns: ColumnDef<OrderRow>[] = [
  { accessorKey: 'orderNo', header: '訂單編號' },
  { accessorKey: 'customer', header: '客戶' },
  { accessorKey: 'amount', header: '金額', meta: { type: 'currency', prefix: '$' } },
  { accessorKey: 'placedAt', header: '成立日期' },
]

/**
 * FAB ↔ 面板互斥:面板關閉時右下角出現入口鈕(距右、距下=loose);點開後鈕消失、焦點進面板。
 * 舞台=滿版表格 + 分頁列(內距 loose):入口鈕 44 外徑 + loose 內距正好壓在分頁列「操作右」帶上,
 * 這是 spec「遮擋」段所指的真實衝突;收起機制(拖到右緣 dock / 角落縮小鈕 / 移到頂列)待拍板。
 */
export const FabPanelToggle: Story = {
  name: '入口鈕與面板互斥',
  render: function FabToggleStory() {
    const [open, setOpen] = React.useState(false)
    return (
      <div className="relative flex h-dvh bg-surface-sunken">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-[var(--layout-space-loose)]">
          <DataTable
            columns={orderColumns}
            data={ORDER_ROWS}
            height="100%"
            pagination={{ pageSize: 20, pageSizeOptions: [10, 20, 50], showTotal: true }}
            getRowId={(row) => row.id}
          />
        </div>
        {open ? (
          <AgentPanel>
            <AgentPanelHeader title="訂單異常排查" activeConversationId="c1" {...headerWiring} onClose={() => setOpen(false)} />
            <AgentConversation>
              <AgentMessage role="agent">關閉我,入口鈕會回到右下角。</AgentMessage>
            </AgentConversation>
            <AgentPromptInput value="" onValueChange={noop} {...promptWiring} />
          </AgentPanel>
        ) : (
          <div className="absolute bottom-[var(--layout-space-loose)] right-[var(--layout-space-loose)]">
            <AgentFab attention onClick={() => setOpen(true)} />
          </div>
        )}
      </div>
    )
  },
}

/** 標誌三態:靜止(=待機)/招喚/思考(動態資產矩陣;藍→紫配色;減動作時一律回靜止)。 */
export const LogoStates: Story = {
  name: '標誌三態',
  render: () => (
    <div className="flex items-end gap-12 p-12">
      {(['still', 'attract', 'think'] as const).map((state) => (
        <div key={state} className="flex flex-col items-center gap-3">
          <AgentLogo state={state} size={72} detail="full" label={state} />
          <span className="text-caption text-fg-muted">{state}</span>
        </div>
      ))}
      <div className="flex flex-col items-center gap-3">
        <AgentLogo state="still" size={16} label="16 簡化" />
        <span className="text-caption text-fg-muted">16(簡化)</span>
      </div>
    </div>
  ),
}

/** FAB:待機(靜止)與有新訊(招喚=標誌蓄勢+邊框光圈代位)。 */
export const FabStates: Story = {
  name: 'FAB 兩態',
  render: () => (
    <div className="flex items-center gap-16 p-16">
      <div className="flex flex-col items-center gap-3">
        <AgentFab />
        <span className="text-caption text-fg-muted">待機</span>
      </div>
      <div className="flex flex-col items-center gap-3">
        <AgentFab attention />
        <span className="text-caption text-fg-muted">有新訊(招喚)</span>
      </div>
    </div>
  ),
}

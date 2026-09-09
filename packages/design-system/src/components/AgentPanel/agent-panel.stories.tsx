// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#WithPagination
// @story-baseline: packages/design-system/src/components/AppShell/app-shell.stories.tsx#PrimarySidebarWithTabs(整頁示範的舞台 = AppShell 主內容 + header tabs;toolbar 同 data-table.stories.tsx#WithBulkActions)
// @story-history: 家族展示層 = 真實業務場景 + OpenSnapshot 覆蓋(M15:defaultOpen/常駐可截圖);
// 標誌/FAB 狀態矩陣屬本層(動態資產,anatomy 靜態矩陣載不動)。
// 2026-09-02 review round:固定構件恆渲染(header +/×/標題觸發、輸入盒 +/Tag ×)後,每個 story
// 都必須傳齊必填 callback;歷史浮層 OpenSnapshot、決策卡三題步進、拖拉寬度、FAB↔面板互斥補齊。
// 2026-09-04:「拖拉寬度」一度在 6804d2ea 被刪成假宣稱,已補回 `ResizableWidth`(width /
// onWidthChange / onWidthCommit / resizable 四個公開 prop 的唯一覆蓋)。
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
  type AgentPanelMode,
  type AgentPromptAttachment,
} from './agent-panel'
import { AgentLogo, type AgentLogoState } from './agent-panel-logo'
import { AgentPanelDock } from './agent-panel-fab'
import { Button } from '@/design-system/components/Button/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/design-system/components/Dialog/dialog'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import type { ColumnDef } from '@tanstack/react-table'
import { ExternalLink, Plus, Search, Trash2 } from 'lucide-react'
import { LinkInput } from '@/design-system/components/LinkInput/link-input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/design-system/components/Tabs/tabs'
import { PageHeader } from '@/design-system/components/AppShell/_demo-helpers'
import { Empty } from '@/design-system/components/Empty/empty'
import { Input } from '@/design-system/components/Input/input'
import { Field, FieldLabel } from '@/design-system/components/Field/field'
import { Select, type SelectOption } from '@/design-system/components/Select/select'
import { PeoplePicker, type PersonData, type PersonValue } from '@/design-system/components/PeoplePicker/people-picker'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { SimulatedBrowser } from '@/design-system/stories-helpers/scene/simulated-browser'

const meta: Meta<typeof AgentPanel> = {
  title: 'Design System/Components/AgentPanel/展示',
  component: AgentPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '產品頁右側常駐的智慧代理對話面板:一問一答、思考過程、決策卡與輸入盒。面板關閉時由右下角的入口鈕接手(兩者互斥,見「入口鈕」系列)。要的是一次性的表單或確認,用 Dialog;要的是欄位層級的說明,用 Field 家族。',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof AgentPanel>

const noop = () => {}

/**
 * 面板站右側全高(模擬 app 右欄環境)+ **面板 ↔ 入口鈕互斥外殼**:每個範例都能按 × 關閉,
 * 關閉後右下角出現入口鈕(標誌狀態跟著 `logoState` 走),點一下開回來。
 */
function PanelFrame({
  logoState = 'still',
  aside,
  children,
}: {
  logoState?: AgentLogoState
  /** 左側空白區的旁註(例如即時寬度讀數)。有需要旁註的範例照樣共用這個外殼,不另起一套版面。 */
  aside?: React.ReactNode
  children: (props: { close: () => void; logoState: AgentLogoState }) => React.ReactNode
}) {
  return (
    <div className="relative flex h-dvh justify-end bg-canvas">
      {aside && (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-body text-fg-secondary">{aside}</div>
      )}
      {/* 顯式開啟:DS 預設依 v14 條 F 是「關閉」,而 M15 要求家族展示要能截到開啟態。
          靠預設值截圖等於讓 story 綁在某個預設上,預設一改 story 就默默變空。 */}
      <AgentPanelDock defaultOpen logoState={logoState}>{children}</AgentPanelDock>
    </div>
  )
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
}

const promptWiring = { onSubmit: noop, onRemoveAttachment: noop, onAddAttachment: noop }

/** 任務助理完整對話:附件氣泡 + 思考塊 + 工具列 + 輸入盒(真實 Jira 型場景)。 */
/**
 * 門面:一問一答 + 思考塊 + 常駐工具列 + 回覆中的停止鈕。附件與多則回覆各自另有樣張(「附件」「多則回覆」),
 * 讓門面只教主線。
 */
export const TaskAssistant: Story = {
  name: '任務助理完整對話',
  render: function TaskAssistantStory() {
    const [value, setValue] = React.useState('')
    const [attachments, setAttachments] = React.useState<AgentPromptAttachment[]>([])
    return (
      <PanelFrame logoState="think">
        {({ close, logoState }) => (
        <AgentPanel>
          <AgentPanelHeader title="衝刺待辦整理" logoState={logoState} activeConversationId="c1" {...headerWiring} onClose={close} />
          <AgentConversation>
            <AgentMessage role="user">把這份待辦按優先級重排,衝突的排程幫我標出來。</AgentMessage>
            <AgentMessage role="agent" toolbar={<AgentToolbar onCopy={noop} onLike={noop} onDislike={noop} />}>
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
        )}
      </PanelFrame>
    )
  },
}

/**
 * 附件:送出後的氣泡附件 = Chip assist(相互間距 4);輸入中的附件 = Tag md 恆帶 ×,單列不換行、
 * 超寬以「+N」浮層列出被藏的 Tag(useOverflowIndices + OverflowIndicator)。
 */
export const Attachments: Story = {
  name: '附件:氣泡內與輸入盒溢出',
  render: function AttachmentsStory() {
    const [attachments, setAttachments] = React.useState<AgentPromptAttachment[]>([
      { id: 'a1', label: 'sprint-42-backlog.csv' },
      { id: 'a2', label: '排程規則.md' },
      { id: 'a3', label: 'oncall-規範.pdf' },
      { id: 'a4', label: '客訴-2026Q3.xlsx' },
      { id: 'a5', label: '值班表-9月.csv' },
    ])
    return (
      <PanelFrame>
        {({ close }) => (
        <AgentPanel>
          <AgentPanelHeader title="衝刺待辦整理" activeConversationId="c1" {...headerWiring} onClose={close} />
          <AgentConversation>
            <AgentMessage
              role="user"
              attachments={[
                { id: 'm1', label: 'sprint-42-backlog.csv' },
                { id: 'm2', label: '排程規則.md' },
              ]}
            >
              先看這兩份,衝突的排程幫我標出來。
            </AgentMessage>
            <AgentMessage role="agent" toolbar={<AgentToolbar onCopy={noop} onLike={noop} onDislike={noop} />}>
              兩份都讀完了。要一起比對值班表的話,把檔案加進來我再跑一次。
            </AgentMessage>
          </AgentConversation>
          <AgentPromptInput
            value=""
            onValueChange={noop}
            attachments={attachments}
            onRemoveAttachment={(a) => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
            onAddAttachment={() =>
              setAttachments((prev) => [...prev, { id: `a${prev.length + 1}`, label: `附件-${prev.length + 1}.md` }])
            }
            onSubmit={noop}
          />
        </AgentPanel>
        )}
      </PanelFrame>
    )
  },
}

/**
 * 多則回覆:只有代理**最後一則**的工具列常駐,其餘回覆懸停(或鍵盤聚焦到工具列)才淡入,而且工具列
 * 絕對定位在 40px 輪距內,出現與消失都不推擠版面;判定由 AgentConversation 自動完成,consumer 不設 pinned。
 * 最後一則工具列到輸入盒 = --layout-space-bottom 48(內容 → 動作鈕)。
 */
export const MultipleReplies: Story = {
  name: '多則回覆:工具列常駐與懸停',
  render: () => (
    <PanelFrame>
      {({ close }) => (
      <AgentPanel>
        <AgentPanelHeader title="Q3 客訴分類" activeConversationId="c3" {...headerWiring} onClose={close} />
        <AgentConversation>
          <AgentMessage role="user">把 Q3 的客訴按原因分類,各給我前三名。</AgentMessage>
          <AgentMessage role="agent" toolbar={<AgentToolbar onCopy={noop} onLike={noop} onDislike={noop} />}>
            分成物流、品質、客服態度三類:物流延遲 41%、商品瑕疵 27%、回覆過慢 18%,其餘 14% 為零星原因。
          </AgentMessage>
          <AgentMessage role="user">物流那一類再細分,看是哪個倉。</AgentMessage>
          <AgentMessage role="agent" toolbar={<AgentToolbar onCopy={noop} onLike={noop} onDislike={noop} />}>
            物流延遲主要來自北倉(62%),多集中在 8 月中旬颱風週;南倉 23%、外包倉 15%。
          </AgentMessage>
          <AgentMessage role="user">好,幫我寫一段給北倉主管的摘要。</AgentMessage>
          <AgentMessage role="agent" toolbar={<AgentToolbar onCopy={noop} onLike={noop} onDislike={noop} />}>
            摘要草稿:8 月 12–18 日北倉出貨延遲客訴 214 件,佔全季物流客訴 62%;建議颱風週啟動備援出貨與主動通知。
          </AgentMessage>
        </AgentConversation>
        <AgentPromptInput value="" onValueChange={noop} {...promptWiring} />
      </AgentPanel>
      )}
    </PanelFrame>
  ),
}

/** 歷史浮層開啟(OpenSnapshot):分組、搜尋、思考中列、目前對話高亮、懸停/鍵盤浮出改名與刪除。 */
export const HistoryOpen: Story = {
  name: '歷史浮層開啟',
  render: () => (
    <PanelFrame>
      {({ close }) => (
      <AgentPanel>
        <AgentPanelHeader title="衝刺待辦整理" activeConversationId="c1" defaultHistoryOpen {...headerWiring} onClose={close} />
        <AgentConversation>
          <AgentMessage role="agent">從標題或箭頭點開歷史;懸停或 Tab 到某一列會浮出改名與刪除。</AgentMessage>
        </AgentConversation>
        <AgentPromptInput value="" onValueChange={noop} {...promptWiring} />
      </AgentPanel>
      )}
    </PanelFrame>
  ),
}

/** 新對話:尚未送出任何訊息 → 「+」停用(當前就是新的);空狀態問候用招喚態標誌。 */
export const NewConversation: Story = {
  name: '新對話(空狀態)',
  render: () => (
    <PanelFrame>
      {({ close }) => (
      <AgentPanel>
        <AgentPanelHeader title="新對話" conversationEmpty {...headerWiring} onClose={close} />
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Empty
            icon={<AgentLogo state="attract" size={48} label="智慧代理" />}
            title="開始第一個對話"
            description="丟一個任務給代理,或把檔案拖進來。"
          />
        </div>
        <AgentPromptInput value="" onValueChange={noop} {...promptWiring} />
      </AgentPanel>
      )}
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
      {({ close }) => (
      <AgentPanel>
        <AgentPanelHeader title="發布公告草稿" activeConversationId="c2" {...headerWiring} onClose={close} />
        <AgentConversation>
          <AgentMessage role="agent">公告已寫好兩個版本,需要你決定語氣、發布時間與同步管道再繼續。</AgentMessage>
        </AgentConversation>
        <div className="relative">
          <AgentPromptInput value="" onValueChange={noop} {...promptWiring} />
          <AgentDecisionCard questions={THREE_QUESTIONS} onSubmit={noop} onSkip={noop} />
        </div>
      </AgentPanel>
      )}
    </PanelFrame>
  ),
}

/** 長標題:標題單行截斷,只有實際被截斷時 hover 才顯示完整名稱的 tooltip(tooltip.spec.md:32;引擎 `<TruncatedText>`)。 */
export const TitleTruncated: Story = {
  name: '長標題截斷與 Tooltip',
  render: () => (
    <PanelFrame>
      {({ close }) => (
      <AgentPanel>
        <AgentPanelHeader title="2026 Q3 北區客訴分類與回覆範本整理(含 Zendesk 匯出與主管審核)" activeConversationId="c3" {...headerWiring} onClose={close} />
        <AgentConversation>
          <AgentMessage role="agent">標題太長會以「…」截斷;滑到標題上會用 tooltip 顯示完整名稱,沒截斷就不會出現。</AgentMessage>
        </AgentConversation>
        <AgentPromptInput value="" onValueChange={noop} {...promptWiring} />
      </AgentPanel>
      )}
    </PanelFrame>
  ),
}

/** 單題決策卡:只有一道題 → 不顯示「n / N」小標,主鈕直接是「送出」。 */
export const DecisionCardSingle: Story = {
  name: '決策卡單題',
  render: () => (
    <PanelFrame>
      {({ close }) => (
      <AgentPanel>
        <AgentPanelHeader title="發布公告草稿" activeConversationId="c2" {...headerWiring} onClose={close} />
        <AgentConversation>
          <AgentMessage role="agent">只剩語氣沒定,選一個就能繼續。</AgentMessage>
        </AgentConversation>
        <div className="relative">
          <AgentPromptInput value="" onValueChange={noop} {...promptWiring} />
          <AgentDecisionCard questions={[THREE_QUESTIONS[0]]} onSubmit={noop} onSkip={noop} />
        </div>
      </AgentPanel>
      )}
    </PanelFrame>
  ),
}

/** 決策回執:拍板後在對話流中的靜態紀錄。 */
export const DecisionSummaryInFlow: Story = {
  name: '決策回執',
  render: () => (
    <PanelFrame>
      {({ close }) => (
      <AgentPanel>
        <AgentPanelHeader title="發布公告草稿" activeConversationId="c2" {...headerWiring} onClose={close} />
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
      )}
    </PanelFrame>
  ),
}

/** 拖拉寬度:左緣把手 360–640(且不超過視窗一半),鍵盤 ←/→ 每次 16;寬度由產品自存。
 *  2026-09-04 補回:這支在 6804d2ea「story 重整」時被刪掉,但 `width` / `onWidthChange` /
 *  `onWidthCommit` / `resizable` 四個公開 prop 因此在整個家族**零 story 覆蓋**(M15:拖寬、鍵盤
 *  ←/→、360–640 夾值都沒有可截圖的狀態),而本檔檔頭仍宣稱「拖拉寬度…補齊」= 假宣稱。 */
export const ResizableWidth: Story = {
  name: '拖拉寬度',
  render: function ResizableStory() {
    const [width, setWidth] = React.useState(400)
    const [committed, setCommitted] = React.useState(400)
    // 這一則原本自建版面且 `onClose={noop}` —— × 是本檔每個範例都保證可按的固定構件,
    // 接空函式等於擺一顆按了沒反應的鈕,和檔頭寫的「每個範例都能按 × 關閉」自相矛盾。
    // 改成共用 `PanelFrame`,寬度讀數放進它的 `aside`。
    return (
      <PanelFrame
        aside={
          <>
            <span>目前寬度 {width}px(拖左緣把手,或聚焦把手後按 ←/→)</span>
            <span className="text-caption text-fg-muted">放開後落地:{committed}px —— 產品拿這個值去存</span>
          </>
        }
      >
        {({ close }) => (
          <AgentPanel width={width} onWidthChange={setWidth} onWidthCommit={setCommitted}>
            <AgentPanelHeader title="衝刺待辦整理" activeConversationId="c1" onClose={close} {...headerWiring} />
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
        )}
      </PanelFrame>
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
 * 入口鈕(唯一的入口鈕範例)。預設**面板是關的**、入口鈕在右下角**招呼**(邊框光圈)——
 * 這就是使用者第一眼會看到的樣子。可以做的事都在這一個範例裡:
 * 點它開面板 / 送出問題看標誌轉成思考 / 關掉面板標誌繼續轉 / 拖到右緣收成半圓 / 右鍵切換大小。
 * 貼邊與在家的靜態對照見「設計規格 → 入口鈕兩個位置」。
 */
export const Fab: Story = {
  name: '入口鈕',
  render: function FabStory() {
    const [agentState, setAgentState] = React.useState<AgentLogoState>('attract')
    const [draft, setDraft] = React.useState('這批訂單的金額為什麼對不上?')
    const timer = React.useRef<number | null>(null)
    const askAgent = () => {
      if (timer.current) window.clearTimeout(timer.current)
      setDraft('')
      setAgentState('think')
      timer.current = window.setTimeout(() => setAgentState('attract'), 6000)
    }
    React.useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
    return (
      <div className="relative flex h-dvh bg-canvas">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-[var(--layout-space-loose)]">
          <DataTable
            columns={orderColumns}
            data={ORDER_ROWS}
            height="100%"
            pagination={{ pageSize: 20, pageSizeOptions: [10, 20, 50], showTotal: true }}
            getRowId={(row) => row.id}
          />
        </div>
        <AgentPanelDock defaultOpen={false} logoState={agentState}>
          {({ close, logoState }) => (
            <AgentPanel>
              <AgentPanelHeader
                title="訂單異常排查"
                activeConversationId="c1"
                logoState={logoState}
                {...headerWiring}
                onClose={close}
              />
              <AgentConversation>
                <AgentMessage role="user">幫我查上週哪幾張訂單金額異常</AgentMessage>
                <AgentMessage role="agent">
                  {logoState === 'think'
                    ? '正在比對上週訂單…'
                    : '送出問題讓我開始思考,再關掉面板 —— 入口鈕的標誌也會跟著轉。拖我到右緣可以收成半圓。'}
                </AgentMessage>
              </AgentConversation>
              <AgentPromptInput value={draft} onValueChange={setDraft} {...promptWiring} onSubmit={askAgent} />
            </AgentPanel>
          )}
        </AgentPanelDock>
      </div>
    )
  },
}

/** 標誌三態:靜止(=待機)/招喚/思考(動態資產矩陣;配色=自家色階 blue-3..7 / purple-3..7;減動作時一律回靜止)。 */
export const LogoStates: Story = {
  name: '標誌三態',
  render: () => (
    <div className="flex items-end gap-12 p-12">
      {(
        [
          ['still', '靜止(待機)'],
          ['attract', '招喚(有新訊)'],
          ['think', '思考中(代理回覆中)'],
        ] as const
      ).map(([state, label]) => (
        <div key={state} className="flex flex-col items-center gap-3">
          <AgentLogo state={state} size={72} label={label} />
          <span className="text-caption text-fg-muted">{label}</span>
        </div>
      ))}
    </div>
  ),
}

/** FAB:待機(靜止)與有新訊(招喚=標誌蓄勢+邊框光圈代位)。 */
/**
 * 思考 → 停止:按「思考 3 秒」進入思考(靜止起步半圈時間加速到 0.5s/圈,負空間同時由橢圓圓化),3 秒後離開
 * 思考 → 從當下角度以 exit 鏡像曲線減速、負空間同步由圓回橢圓、色場基底跟著當下角度、落回正位 0°(0.50–1.21s)
 * 後直接接靜止(不淡入 —— 交接那一刻兩邊長得一樣);
 * 一直思考的範例維持最快轉速不停、洞持圓,只剩亮度呼吸。
 */
export const LogoThinkStop: Story = {
  name: '標誌:思考起步與減速停止',
  render: function LogoThinkStopStory() {
    const [state, setState] = React.useState<'still' | 'think'>('still')
    const timer = React.useRef<number | null>(null)
    const start = () => {
      if (timer.current) window.clearTimeout(timer.current)
      setState('think')
      timer.current = window.setTimeout(() => setState('still'), 3000)
    }
    React.useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
    return (
      <div className="flex items-center gap-12 p-12">
        <AgentLogo state={state} size={72} label={state} />
        <Button variant="secondary" size="sm" onClick={start}>思考 3 秒</Button>
        <span className="text-caption text-fg-muted">目前:{state === 'think' ? '思考中(等速)' : '靜止'}</span>
      </div>
    )
  },
}


/* ═══════════════════════════════════════════════════════════════════════════
   整頁情境(假資料)—— 專案任務頁(AppShell 主內容:page header + tabs)/ 任務對話框 / 確認框 / 代理欄
   規則(story-rules.md「整頁情境」):畫布裡只准 DS 元件 + 真實業務內容。
   舞台 = AppShell 主內容的樣子(2026-09-09 user:「拿 app shell 中間那塊內容的樣式來呈現…把 title 拿掉改成帶有
   tabs 的 header…header 的 title 就是這個專案的標題」):header 消費 `PageHeader`(ChromeHeader + tabsSlot,
   header-canonical W1–W6;`app-shell.stories.tsx#PrimarySidebarWithTabs` 同款)、tabs = 所有任務 / 我的任務(各有自己的
   URL)、tab 內是 action-bar 靠右對齊 toolbar(左 search / 右 ops,primary「新增任務」在業務層最右;
   `data-table.stories.tsx#WithBulkActions` 同款)+ DataTable;標題欄 = DS url 欄位同一支 primitive
   (`<LinkInput mode="view">`,與表頭齊 —— 2026-09-09 user 抓到 Button link 自帶內距把網址推歪)。
   有 URL 的 modal 傳送到「舞台」(並排時代理不被蓋),沒有 URL 的確認框傳送到「畫布」(蓋住一切含代理)。
   蓋板態(容器 < 1080)下從代理導向舞台 → 代理收成入口鈕、舞台顯示目標(v14 條 B,2026-09-09 user 推翻 AI 推導)。
   閘:`scripts/agent-url-registry-demo-invariant.mjs`(S0–S9,兩個並排寬度 + 一個蓋板寬度)。
   ═══════════════════════════════════════════════════════════════════════════ */
type TaskStatus = 'todo' | 'doing' | 'done'
type Task = { id: string; num: number; title: string; assignee: string; status: TaskStatus; due: string }
type TaskDraft = Omit<Task, 'id' | 'num'>
const STATUS_OPTIONS: SelectOption[] = [
  { value: 'todo', label: '待處理' },
  { value: 'doing', label: '進行中' },
  { value: 'done', label: '完成' },
]
const statusLabel = (status: TaskStatus) => STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
const PEOPLE: PersonData[] = [{ name: 'Betty Wu' }, { name: 'Alan Chen' }, { name: 'Ada Chen' }]
const personName = (p: PersonValue) => (typeof p === 'string' ? p : p.name)
/** 目前登入的人 ——「我的任務」= 指派給她的任務。 */
const CURRENT_USER = 'Betty Wu'
const PROJECT = '/projects/8821'
const PROJECT_TITLE = '結帳流程改版'
/**
 * header 的兩個 tab,各有自己的 URL(user 2026-09-09:「一個是『所有任務』…另一個『我的任務』,長相跟任務清單
 * 很像,只是篩成自己的」);tab 的 URL 是同一頁的子路徑,tab 只切視圖不切路由(tabs.spec.md「何時用」頁面內切換)。
 */
const ALL_TASKS = { value: 'all', label: '所有任務', url: `${PROJECT}/tasks` } as const
const MY_TASKS = { value: 'mine', label: '我的任務', url: `${PROJECT}/tasks/mine` } as const
const TASK_TABS = [ALL_TASKS, MY_TASKS] as const
type TaskTab = (typeof TASK_TABS)[number]
const NEW_TASK_URL = `${PROJECT}/tasks/new`
const taskUrl = (num: number) => `${PROJECT}/tasks/${num}`
const taskLabel = (t: Task) => `任務 #${t.num} ${t.title}`
const TASKS: Task[] = [
  { id: 't4821', num: 4821, title: '修正登入逾時', assignee: 'Betty Wu', status: 'todo', due: '2026-09-12' },
  { id: 't4830', num: 4830, title: '對帳批次逾時重試', assignee: 'Alan Chen', status: 'doing', due: '2026-09-15' },
  { id: 't4835', num: 4835, title: '支付失敗通知信', assignee: 'Betty Wu', status: 'todo', due: '2026-09-19' },
]

/**
 * 背景位置模式(Background location;user 2026-09-09:「若有來源頁面,則保留該頁面作為 Modal 的背景;
 * 若無來源頁面,則將 Modal 顯示於預先定義的預設背景頁面之上」)。
 * `url` = 網址列;`backgroundLocation` = 從哪個 tab 點開的(只有從頁面點開 modal 才有)。
 * 重新整理會丟掉它(等於直接以任務網址進入)→ 預設背景 = 所有任務。
 */
type Location = { url: string; backgroundLocation?: string }
type View = { tab: TaskTab; modal: null | { kind: 'task'; num: number } | { kind: 'new' } }
const tabByUrl = (url?: string) => TASK_TABS.find((t) => t.url === url)
const tabByValue = (value: string) => TASK_TABS.find((t) => t.value === value) ?? ALL_TASKS
function resolveView(loc: Location): View {
  const background = tabByUrl(loc.backgroundLocation) ?? ALL_TASKS
  if (loc.url === NEW_TASK_URL) return { tab: background, modal: { kind: 'new' } }
  const m = loc.url.match(/\/tasks\/(\d+)$/)
  if (m) return { tab: background, modal: { kind: 'task', num: Number(m[1]) } }
  return { tab: tabByUrl(loc.url) ?? ALL_TASKS, modal: null }
}

/**
 * 舞台 = 宿主區(容器 − 面板),長相 = AppShell 主內容(`app-shell.tsx`:header 在 `flex-shrink-0` 殼裡、
 * `<main>` landmark `flex-1 min-h-0 overflow-y-auto`、padding=0,內容照 layoutSpace 六條規則走)。
 * 帶 transform 讓有 URL 的 modal 用 `portalContainer` 傳送進來後 fixed 以它為準。
 * `<main tabIndex={-1}>` 同 AppShell skip-to-main:蓋板態代理收成入口鈕、目標是頁面時,焦點交給這裡。
 * `main` 多了 `flex flex-col`:TabsContent 要 `flex-1` 撐滿(app-shell.stories#PrimarySidebarWithTabs 的 TabsContent 同款
 * `mt-0 flex-1 min-h-0 flex flex-col`),父層必須是 flex 才生效。
 */
function Stage({ stageRef, mainRef, header, children }: {
  stageRef: React.Ref<HTMLDivElement>
  mainRef: React.Ref<HTMLElement>
  header: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div ref={stageRef} className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas" style={{ transform: 'translateZ(0)' }}>
      <div className="flex-shrink-0">{header}</div>
      <main ref={mainRef} id="demo-stage-main" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto focus-visible:focus-ring-inset">
        {children}
      </main>
    </div>
  )
}

/**
 * 一個 tab 的內容 = toolbar + DataTable。
 * - Toolbar:`data-table.spec.md`「十、與 Toolbar 的關係」—— DataTable 不內建 toolbar,外部用 action-bar 組合;
 *   `action-bar.spec.md`「二、標準結構」靠右對齊(標題已由 header 承載,左側是業務 search、按鈕靠右、primary 在業務層最右)。
 *   「新增任務」開的是**有網址的對話框**(欄位複雜的 create 走 Dialog,data-table.spec「Inline create row」明列可並存),
 *   所以家在 toolbar 的 primary,不是表格底部那條「點了就地編輯」的 inline create 列。
 *   幾何逐字同 `data-table.stories.tsx#WithBulkActions`:toolbar `px-loose py-tight`(自帶 py = tabs→toolbar、toolbar→table
 *   兩段 tight,layoutSpace 規則 2 / 3「toolbar → table 直接功能依賴」),table `mx-loose mb-loose`(規則 1B / 4)。
 * - 標題欄:DS url 欄位型別(`column-types.ts` `url` → `UrlCell` → `<LinkInput mode="view">`;view 態是裸 anchor,`naked` 只在 wrapper 路徑有意義)的同一支
 *   primitive 直接消費 —— `meta.linkLabel` 是欄位層級的固定字串,放不下每列不同的任務標題;naked view 零內距,
 *   文字左緣 = 表頭左緣(2026-09-09 user 抓到「網址前面有一塊空」= Button link 自帶水平內距,那是自創、不是 DS 定義)。
 *   內部連結由頁面路由攔截(`onClickCapture` + preventDefault,SPA router 的 link interception),不走 anchor 預設的新分頁。
 */
function TaskListView({ tab, tasks, onOpen, onCreate }: {
  tab: TaskTab
  tasks: Task[]
  onOpen: (num: number) => void
  onCreate: () => void
}) {
  const [search, setSearch] = React.useState('')
  const rows = React.useMemo(() => {
    const scoped = tab.value === 'mine' ? tasks.filter((t) => t.assignee === CURRENT_USER) : tasks
    const q = search.trim().toLowerCase()
    return q ? scoped.filter((t) => t.title.toLowerCase().includes(q) || String(t.num).includes(q)) : scoped
  }, [tab, tasks, search])
  const columns = React.useMemo<ColumnDef<Task>[]>(() => [
    { accessorKey: 'num', header: 'ID', cell: ({ row }) => `#${row.original.num}` },
    {
      accessorKey: 'title',
      header: '標題',
      cell: ({ row }) => <LinkInput mode="view" value={taskUrl(row.original.num)} label={row.original.title} />,
    },
    { accessorKey: 'assignee', header: '指派人' },
    { accessorKey: 'status', header: '狀態', cell: ({ row }) => statusLabel(row.original.status) },
    { accessorKey: 'due', header: '截止日' },
  ], [])
  const interceptInternalLink = (e: React.MouseEvent) => {
    const anchor = (e.target as Element).closest?.('a[href]')
    const m = anchor?.getAttribute('href')?.match(/\/tasks\/(\d+)$/)
    if (!m) return
    e.preventDefault()
    e.stopPropagation()
    onOpen(Number(m[1]))
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div data-demo-toolbar className="flex items-center justify-between gap-2 px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
        <div className="max-w-sm flex-1">
          <Input size="sm" placeholder="搜尋任務" aria-label="搜尋任務" startIcon={Search} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Button id="demo-new-task" variant="primary" size="sm" startIcon={Plus} onClick={onCreate}>新增任務</Button>
        </div>
      </div>
      <div className="mx-[var(--layout-space-loose)] mb-[var(--layout-space-loose)] min-h-0 flex-1" onClickCapture={interceptInternalLink}>
        <DataTable columns={columns} data={rows} height="100%" getRowId={(t) => t.id} aria-label={tab.label} />
      </div>
    </div>
  )
}

/**
 * 有 URL 的任務對話框:header **一行**(任務 id + 標題,或「新增任務」),header actions slot 放 icon-only 垃圾桶
 * (dialog.spec.md「Header actions slot」:`<Button variant="text" iconOnly>`;button.spec.md「text + danger」=
 * 工具列刪除 icon、有後續確認);body 照 DS 表單版面放四個 Field;footer 只有取消(tertiary)與儲存(primary)。
 */
function TaskDialog({ task, portalContainer, persistentElements, onSave, onCancel, onDelete, onCloseAutoFocus }: {
  task: Task | null
  portalContainer: HTMLElement
  persistentElements: () => Element[]
  onSave: (draft: TaskDraft) => void
  onCancel: () => void
  onDelete?: () => void
  /** 關閉後焦點回到開啟它的元素(沒有 DialogTrigger 時 Radix 會落到 body;2026-09-09 Codex R13) */
  onCloseAutoFocus?: (e: Event) => void
}) {
  const [draft, setDraft] = React.useState<TaskDraft>(() =>
    task ? { title: task.title, assignee: task.assignee, status: task.status, due: task.due } : { title: '', assignee: '', status: 'todo', due: '' },
  )
  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel() }} persistentElements={persistentElements}>
      <DialogContent maxWidth={480} autoHeight portalContainer={portalContainer} aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader
          actions={task && onDelete
            ? <Button id="demo-task-delete" variant="text" danger iconOnly size="sm" startIcon={Trash2} aria-label="刪除任務" onClick={onDelete} />
            : undefined}
        >
          <DialogTitle>{task ? taskLabel(task) : '新增任務'}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-[var(--layout-space-loose)]">
            <Field required>
              <FieldLabel>標題</FieldLabel>
              <Input id="demo-task-title" value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="例:修正登入逾時" />
            </Field>
            <Field>
              <FieldLabel>指派人</FieldLabel>
              <PeoplePicker aria-label="指派人" value={draft.assignee || null} people={PEOPLE} onChange={(v) => set('assignee', v[0] ? personName(v[0]) : '')} />
            </Field>
            <Field>
              <FieldLabel>狀態</FieldLabel>
              <Select aria-label="狀態" options={STATUS_OPTIONS} value={draft.status} onChange={(v) => set('status', v as TaskStatus)} />
            </Field>
            <Field>
              <FieldLabel>截止日</FieldLabel>
              <DatePicker aria-label="截止日" typeable value={draft.due || null} onChange={(v) => set('due', v)} />
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button id="demo-task-cancel" variant="tertiary" onClick={onCancel}>取消</Button>
          <Button id="demo-task-save" variant="primary" disabled={!draft.title.trim()} onClick={() => onSave({ ...draft, title: draft.title.trim() })}>儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 沒有 URL 的確認框:一般 modal(不傳 persistentElements),傳送到畫布,蓋住一切含代理(v14 條 A)。 */
/**
 * 沒有網址的刪除確認框:照 Dialog 規格的破壞性動作範本(dialog.anatomy「破壞性動作 Dialog」/ dialog.spec「何時用」):
 * header 只放一行問句、body 說明是哪一筆與後果、footer 取消(tertiary)+ 刪除(primary danger)。
 * 2026-09-09 user 抓到:我把任務名稱塞進標題(兩行)、沒有 body、用 DialogDescription 硬撐 —— root cause 是沒照範本,自己拼。
 * 遮罩蓋整張畫布(含代理,v14 條 A),但框本身對齊它所屬的任務對話框(舞台中心):兩層對話框中心若差半個代理寬,看起來就是偏移。
 */
function ConfirmDeleteDialog({ task, onCancel, onConfirm, portalContainer, centerIn }: {
  task: Task; onCancel: () => void; onConfirm: () => void; portalContainer: HTMLElement; centerIn: HTMLElement | null
}) {
  const left = React.useMemo(() => {
    if (!centerIn) return undefined
    const c = portalContainer.getBoundingClientRect(), s = centerIn.getBoundingClientRect()
    return s.left - c.left + s.width / 2
  }, [centerIn, portalContainer])
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent maxWidth={400} autoHeight portalContainer={portalContainer} style={left != null ? { left } : undefined} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>確定要刪除這個任務?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-body">{taskLabel(task)} 與它的留言、附件都會被永久刪除,無法復原。</p>
        </DialogBody>
        <DialogFooter>
          <Button id="demo-confirm-cancel" variant="tertiary" onClick={onCancel}>取消</Button>
          <Button id="demo-confirm-delete" variant="primary" danger startIcon={Trash2} onClick={onConfirm}>刪除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── 代理 session(對話)模型:歷史浮層列多個 session、可切換;「+」開新 session,送出第一則後才有標題並進歷史 ── */
type ChatMessage = { role: 'user' | 'agent'; content: React.ReactNode }
type Session = { id: string; title: string; group: string; messages: ChatMessage[]; draft: string }
const TITLE_MAX = 16
function useSessions(initial: Session[]) {
  const [state, setState] = React.useState<{ sessions: Session[]; activeId: string; seq: number }>({ sessions: initial, activeId: initial[0].id, seq: initial.length })
  const active = state.sessions.find((s) => s.id === state.activeId) ?? state.sessions[0]
  const update = (id: string, patch: (s: Session) => Session) =>
    setState((st) => ({ ...st, sessions: st.sessions.map((s) => (s.id === id ? patch(s) : s)) }))
  const newSession = (seq: number): Session => ({ id: `s${seq}`, title: '', group: '今天', messages: [], draft: '' })
  return {
    active,
    /** 歷史浮層只列已送出過訊息的 session(新對話送出第一則之前不在歷史裡)。 */
    history: state.sessions.filter((s) => s.messages.length > 0).map(({ id, title, group }): AgentConversationSummary => ({ id, title, group })),
    select: (id: string) => setState((st) => ({ ...st, activeId: id })),
    setDraft: (draft: string) => update(active.id, (s) => ({ ...s, draft })),
    submit: () => {
      const text = active.draft.trim()
      if (!text) return
      update(active.id, (s) => ({
        ...s,
        title: s.title || text.slice(0, TITLE_MAX),
        draft: '',
        messages: [...s.messages, { role: 'user', content: text }, { role: 'agent', content: `收到,我把「${text}」記到這個專案的討論串了,有進展會再告訴你。` }],
      }))
    },
    create: () => setState((st) => {
      const next = newSession(st.seq + 1)
      return { sessions: [next, ...st.sessions], activeId: next.id, seq: st.seq + 1 }
    }),
    rename: (id: string, title: string) => update(id, (s) => ({ ...s, title })),
    /** 刪的是目前對話 → 切到最近一則;全部刪光 → 開新的空對話(agent-panel.tsx `onDeleteConversation` 契約)。 */
    remove: (id: string) => setState((st) => {
      const sessions = st.sessions.filter((s) => s.id !== id)
      if (st.activeId !== id) return { ...st, sessions }
      const nextActive = sessions.find((s) => s.messages.length > 0) ?? sessions[0]
      if (nextActive) return { ...st, sessions, activeId: nextActive.id }
      const fresh = newSession(st.seq + 1)
      return { sessions: [fresh], activeId: fresh.id, seq: st.seq + 1 }
    }),
    /** v14 條 F:重新整理 = 回到關閉的新對話(歷史是伺服器端的,留著;當前對話與草稿不保留)。 */
    reset: () => setState((st) => {
      const fresh = newSession(st.seq + 1)
      return { sessions: [fresh, ...st.sessions.filter((s) => s.messages.length > 0)], activeId: fresh.id, seq: st.seq + 1 }
    }),
  }
}

function AgentColumn({ hostRef, open, onOpenChange, onModeChange, sessions, persistentElements }: {
  hostRef: React.Ref<HTMLDivElement>
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 面板形態(並排 / 蓋板)回報 —— 宿主用它決定「從代理導向舞台」時要不要收成入口鈕。 */
  onModeChange: (mode: AgentPanelMode) => void
  sessions: ReturnType<typeof useSessions>
  /** 蓋板態仍要可用的宿主外節點(瀏覽器工具列)。 */
  persistentElements: () => Element[]
}) {
  const { active } = sessions
  const empty = active.messages.length === 0
  return (
    // 面板必須是畫布 flex 的**直接子節點**(它量的是自己的父層),所以殼用 display:contents
    <div ref={hostRef} className="contents">
      <AgentPanelDock open={open} onOpenChange={onOpenChange} logoState="still">
        {({ close }) => (
          <AgentPanel persistentElements={persistentElements} onModeChange={onModeChange}>
            <AgentPanelHeader
              title={empty ? '新對話' : active.title}
              conversations={sessions.history}
              activeConversationId={active.id}
              conversationEmpty={empty}
              onSelectConversation={sessions.select}
              onRenameConversation={sessions.rename}
              onDeleteConversation={sessions.remove}
              onNewConversation={sessions.create}
              onClose={close}
            />
            {empty ? (
              // 新對話空狀態 = 「新對話(空狀態)」範例同一套:招喚態標誌 + Empty
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <Empty
                  icon={<AgentLogo state="attract" size={48} label="智慧代理" />}
                  title="開始第一個對話"
                  description="丟一個任務給代理,或把檔案拖進來。"
                />
              </div>
            ) : (
              <AgentConversation>
                {active.messages.map((m, i) => <AgentMessage key={i} role={m.role}>{m.content}</AgentMessage>)}
              </AgentConversation>
            )}
            <AgentPromptInput
              value={active.draft}
              onValueChange={sessions.setDraft}
              onSubmit={sessions.submit}
              onRemoveAttachment={noop}
              onAddAttachment={noop}
              attachments={[]}
              placeholder="問我或指派工作…"
            />
          </AgentPanel>
        )}
      </AgentPanelDock>
    </div>
  )
}

/**
 * 等節點脫離 inert 再聚焦(最多等 10 影格)。代理收成入口鈕的那一刻,宿主還在蓋板的抑制裡
 * (解除要跨一次 ResizeObserver 與 effect),這時 Dialog 的掛載自動聚焦與 `main.focus()` 都會落空。
 */
function focusWhenOperable(resolve: () => HTMLElement | null, frames = 10) {
  const el = resolve()
  if (el && !el.closest('[inert]') && !el.hasAttribute('inert')) { el.focus(); return }
  if (frames > 0) requestAnimationFrame(() => focusWhenOperable(resolve, frames - 1))
}

function UrlRegistryScene() {
  const [stage, setStage] = React.useState<HTMLDivElement | null>(null)
  const [canvas, setCanvas] = React.useState<HTMLDivElement | null>(null)
  const mainRef = React.useRef<HTMLElement | null>(null)
  const panelHostRef = React.useRef<HTMLDivElement | null>(null)
  const toolbarRef = React.useRef<HTMLDivElement | null>(null)
  /** 並存 modal 的保留集合:代理殼(面板或入口鈕)+ 瀏覽器工具列。 */
  const keepForDialog = React.useCallback(() => [panelHostRef.current, toolbarRef.current].filter((el): el is HTMLDivElement => !!el), [])
  /** 代理蓋板的保留集合:瀏覽器工具列(面板自己由元件保留)。 */
  const keepForPanel = React.useCallback(() => [toolbarRef.current].filter((el): el is HTMLDivElement => !!el), [])
  const [tasks, setTasks] = React.useState<Task[]>(TASKS)
  const [confirmDelete, setConfirmDelete] = React.useState<Task | null>(null)
  const [agentOpen, setAgentOpen] = React.useState(true)
  /** 面板形態(並排 / 蓋板),由 AgentPanel `onModeChange` 回報;量到之前是 null。 */
  const [agentMode, setAgentMode] = React.useState<AgentPanelMode | null>(null)
  const agentModeRef = React.useRef(agentMode)
  agentModeRef.current = agentMode
  // 歷史堆疊合成一個 state,`go` 才是穩定的 callback(代理回覆裡的連結閉包會抓住它)
  const [nav, setNav] = React.useState<{ entries: Location[]; index: number }>({ entries: [{ url: ALL_TASKS.url }], index: 0 })
  const navRef = React.useRef(nav)
  navRef.current = nav
  const go = React.useCallback((next: Location) => setNav((n) => ({ entries: [...n.entries.slice(0, n.index + 1), next], index: n.index + 1 })), [])
  const back = React.useCallback(() => setNav((n) => ({ ...n, index: Math.max(0, n.index - 1) })), [])
  const forward = React.useCallback(() => setNav((n) => ({ ...n, index: Math.min(n.entries.length - 1, n.index + 1) })), [])
  const cur = nav.entries[nav.index]
  const view = resolveView(cur)
  /** 從「目前看得到的 tab」點開 modal:來源 tab 成為背景(已經在 modal 裡時沿用它的背景)。 */
  // 開啟 modal 的元素(表格裡的連結 / 新增任務 / 代理裡的連結):關閉後焦點回這裡;它若已不在畫面或被抑制,退回舞台 main
  const openerRef = React.useRef<HTMLElement | null>(null)
  const rememberOpener = () => { const el = document.activeElement; openerRef.current = el instanceof HTMLElement && el !== document.body ? el : null }
  const returnFocus = React.useCallback((e: Event) => {
    e.preventDefault()
    const el = openerRef.current
    // 開啟元素可能在已收成的代理面板裡(display:none,蓋板讓位後):不可見或 .focus() 沒生效都退回舞台 main(Codex R14 反例)
    const visible = !!el && el.isConnected && el.getClientRects().length > 0 && !el.closest('[inert]') && !el.closest('[aria-hidden="true"]')
    if (visible) el!.focus()
    if (!visible || document.activeElement !== el) mainRef.current?.focus()
  }, [])
  const openTask = React.useCallback((num: number) => {
    rememberOpener()
    const tab = resolveView(navRef.current.entries[navRef.current.index]).tab
    go({ url: taskUrl(num), backgroundLocation: tab.url })
  }, [go])
  const openNewTask = () => { rememberOpener(); go({ url: NEW_TASK_URL, backgroundLocation: view.tab.url }) }
  const closeModal = () => go({ url: view.tab.url })
  /**
   * 從代理發起的內部導航(v14 條 C):並排態代理維持開啟;**蓋板態代理收成入口鈕、舞台顯示目標**(條 B,2026-09-09 user:
   * 「開啟 agent 點內部連結當然要有優先呈現該連結內容啊,怎麼可能讓 agent 還霸道佔位?」)。
   * 收成不是卸載 —— 對話、草稿、閱讀位置都留著(AgentPanelDock keep-mounted)。目標是頁面 → 焦點交給舞台 `<main>`;
   * 目標是 modal → Dialog 開啟時自己聚焦。面板不知道連結,所以這段住在宿主,不在 DS(agent-panel.spec 蓋板小節)。
   */
  const stageRef = React.useRef<HTMLDivElement | null>(null)
  stageRef.current = stage
  const fromAgent = React.useCallback((navigate: () => void, target: 'page' | 'modal') => {
    navigate()
    if (agentModeRef.current !== 'overlay') return
    setAgentOpen(false)
    // 目標是頁面 → 焦點交給舞台 main;目標是 modal → Dialog 掛載時的自動聚焦會撞上尚未解除的抑制而落空,
    // 等它可操作後把焦點放到對話框容器(Radix DialogContent 帶 tabIndex=-1;APG dialog 模式允許聚焦容器)
    requestAnimationFrame(() => focusWhenOperable(() =>
      target === 'page' ? mainRef.current : stageRef.current?.querySelector<HTMLElement>('[role="dialog"]') ?? null,
    ))
  }, [])
  const initialSessions = React.useMemo<Session[]>(() => [
    { id: 's1', title: '登入逾時追蹤', group: '今天', draft: '', messages: [
      { role: 'user', content: '登入逾時那件事現在在哪裡處理?' },
      { role: 'agent', content: (
        <>
          <p>跟你問的有關的有四處:</p>
          <ul className="mt-2 flex flex-col gap-1">
            <li><a href={taskUrl(4821)} id="demo-link-task-4821" onClick={(e) => { e.preventDefault(); fromAgent(() => openTask(4821), 'modal') }}>任務 #4821 修正登入逾時</a></li>
            <li><a href={taskUrl(4830)} id="demo-link-task-4830" onClick={(e) => { e.preventDefault(); fromAgent(() => openTask(4830), 'modal') }}>任務 #4830 對帳批次逾時重試</a>(Alan 的,跟登入逾時共用同一組 timeout 設定)</li>
            <li><a href={MY_TASKS.url} id="demo-link-mine" onClick={(e) => { e.preventDefault(); fromAgent(() => go({ url: MY_TASKS.url }), 'page') }}>{MY_TASKS.label}</a>(你名下的「支付失敗通知信」跟它同一條路徑)</li>
            <li><a href="https://support.example.com/tickets/88213" id="demo-link-zendesk" target="_blank" rel="noopener noreferrer">Zendesk 客訴 #88213<ExternalLink size={14} className="ml-1 inline-block align-[-2px]" aria-hidden /></a></li>
          </ul>
          <p className="mt-2">另外有人在討論串提到 <span id="demo-unconfirmed">/projects/9999</span>,但系統裡查不到這個專案,我就沒有放連結。</p>
        </>
      ) },
    ] },
    { id: 's2', title: '發布公告草稿', group: '今天', draft: '', messages: [
      { role: 'user', content: '幫我擬 Sprint 24 的發布公告。' },
      { role: 'agent', content: '草稿已放到 Notion 公告頁,用的是正式版語氣;要改成輕鬆版再跟我說。' },
    ] },
    { id: 's3', title: 'Q3 客訴分類', group: '過去 7 天', draft: '', messages: [
      { role: 'user', content: '把 Q3 的客訴按原因分類。' },
      { role: 'agent', content: '分成物流、品質、客服態度三類:物流延遲 41%、商品瑕疵 27%、回覆過慢 18%,其餘 14% 為零星原因。' },
    ] },
  ], [go, openTask, fromAgent])
  const sessions = useSessions(initialSessions)
  // v14 條 F:重新整理 = 宿主不變、代理回到初始關閉的新對話;瀏覽器同時丟掉記憶體裡的來源頁 →
  // 任務網址等於「直接進入」,疊在預設背景(所有任務)上。
  const reload = () => {
    setNav((n) => ({ ...n, entries: n.entries.map((e, i) => (i === n.index ? { url: e.url } : e)) }))
    setAgentOpen(false)
    sessions.reset()
  }
  const modalTaskNum = view.modal?.kind === 'task' ? view.modal.num : null
  const openTaskModal = modalTaskNum == null ? null : tasks.find((t) => t.num === modalTaskNum) ?? null
  const nextNum = Math.max(...tasks.map((t) => t.num)) + 1
  return (
    // 撐滿 story、與邊界四周留 loose(2026-09-09 user);畫布高 = 視窗高 − 上下 loose − 工具列
    <div className="flex h-dvh flex-col p-[var(--layout-space-loose)]">
      <SimulatedBrowser
        url={cur.url}
        height="fill"
        canBack={nav.index > 0}
        canForward={nav.index < nav.entries.length - 1}
        onBack={back}
        onForward={forward}
        onReload={reload}
        canvasRef={setCanvas}
        toolbarRef={toolbarRef}
      >
        {/* Tabs root 要同時包住 header 裡的 TabsList 與 main 裡的 TabsContent(Radix 同 root);
            display:contents 讓舞台仍是畫布 flex 的直接子節點 */}
        <Tabs value={view.tab.value} onValueChange={(v) => go({ url: tabByValue(v).url })} className="contents">
          <Stage
            stageRef={setStage}
            mainRef={mainRef}
            header={
              <PageHeader
                title={PROJECT_TITLE}
                includeSidebarTrigger={false}
                tabsSlot={
                  <TabsList size="sm">
                    {TASK_TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
                  </TabsList>
                }
              />
            }
          >
            {TASK_TABS.map((t) => (
              <TabsContent key={t.value} value={t.value} className="mt-0 flex min-h-0 flex-1 flex-col">
                <TaskListView tab={t} tasks={tasks} onOpen={openTask} onCreate={openNewTask} />
              </TabsContent>
            ))}
            {stage && view.modal && (view.modal.kind === 'new' || openTaskModal) && (
              <TaskDialog
                key={cur.url}
                task={openTaskModal}
                portalContainer={stage}
                persistentElements={keepForDialog}
                onCloseAutoFocus={returnFocus}
                onCancel={closeModal}
                onDelete={openTaskModal ? () => setConfirmDelete(openTaskModal) : undefined}
                onSave={(draft) => {
                  setTasks((ts) => openTaskModal
                    ? ts.map((t) => (t.id === openTaskModal.id ? { ...t, ...draft } : t))
                    : [...ts, { id: `t${nextNum}`, num: nextNum, ...draft }])
                  closeModal()
                }}
              />
            )}
            {canvas && confirmDelete && (
              <ConfirmDeleteDialog
                task={confirmDelete}
                portalContainer={canvas}
                centerIn={stage}
                onCancel={() => setConfirmDelete(null)}
                onConfirm={() => {
                  setTasks((ts) => ts.filter((t) => t.id !== confirmDelete.id))
                  setConfirmDelete(null)
                  closeModal()
                }}
              />
            )}
          </Stage>
        </Tabs>
        <AgentColumn hostRef={panelHostRef} open={agentOpen} onOpenChange={setAgentOpen} onModeChange={setAgentMode} sessions={sessions} persistentElements={keepForPanel} />
      </SimulatedBrowser>
    </div>
  )
}

/**
 * 示意(假資料):v14 條 A–G 的互動一次演完。真正的註冊表(誰有 URL、由誰確認)在產品／導航層,
 * DS 沒有也不該有;`persistentElements` 不讀 URL、不建立資格。
 */
export const UrlRegistryDemo: Story = {
  name: '示意(假資料)— URL 註冊表:誰能與 agent 並存',
  parameters: {
    docs: {
      description: {
        story: '假資料示意。舞台 = AppShell 主內容:page header(專案標題)+ 兩個各有網址的 tab「所有任務 / 我的任務」,tab 內是 toolbar(搜尋、新增任務)與 DataTable;點標題欄的連結或「新增任務」開有網址的對話框,並排時它只遮舞台、右側代理仍可對話與切換 session;對話框 header 的垃圾桶開沒有網址的刪除確認框,代理被擋、取消後恢復。代理回覆裡的「我的任務」把宿主切到該 tab,再點「任務 #4821」對話框就疊在「我的任務」上(背景位置模式);重新整理等於直接以任務網址進入,對話框疊在預設的「所有任務」上,代理則回到初始關閉。上一頁 / 下一頁走歷史。窄畫布時代理改成蓋板:網址列與上下頁鈕仍可點;從代理點內部連結或有網址的對話框 → 代理收成右下角入口鈕、舞台顯示目標(對話與草稿都留著),點入口鈕再開回來。',
      },
    },
  },
  render: () => <UrlRegistryScene />,
}

// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#WithPagination
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
  type AgentPromptAttachment,
} from './agent-panel'
import { AgentLogo, type AgentLogoState } from './agent-panel-logo'
import { AgentPanelDock } from './agent-panel-fab'
import { Button } from '@/design-system/components/Button/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/design-system/components/Dialog/dialog'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import type { ColumnDef } from '@tanstack/react-table'
import { ExternalLink } from 'lucide-react'
import { Empty } from '@/design-system/components/Empty/empty'
import { Input } from '@/design-system/components/Input/input'
import { Field, FieldLabel } from '@/design-system/components/Field/field'
import { DescriptionList, DescriptionItem } from '@/design-system/components/DescriptionList/description-list'
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


/**
 * 並存 + Esc 分區(v14 條 A/B + `agent-panel.spec.md:545` 三條表)。
 *
 * 寬螢幕:有 URL 的 modal 與 agent **並列可操作**。Esc 的作用域封閉在焦點所在區 ——
 * 焦點在 agent 內、agent 內沒有浮層時 Esc **什麼都不關**(不能跨區關掉舞台的 modal)。
 * 閘:`scripts/agent-modal-coexistence-invariant.mjs`。
 */
/* ═══════════════════════════════════════════════════════════════════════════
   整頁情境共用(假資料)—— 舞台 / 任務清單 / 任務對話框 / 確認框 / 代理欄
   規則:畫布裡只准 DS 元件 + 真實業務內容;有 URL 的 modal 傳送到「舞台」(代理不被蓋),
   沒有 URL 的確認框傳送到「畫布」(蓋住一切含代理)。story-rules.md「整頁情境」。
   ═══════════════════════════════════════════════════════════════════════════ */
type Task = { id: string; num: number; title: string; url: string; assignee: string; status: string; due: string }
const TASKS: readonly Task[] = [
  { id: 'task-4821', num: 4821, title: '修正登入逾時', url: '/projects/8821/tasks/4821', assignee: 'Betty Wu', status: '待處理', due: '2026-09-12' },
  { id: 'task-4830', num: 4830, title: '對帳批次逾時重試', url: '/projects/8821/tasks/4830', assignee: 'Alan Chen', status: '進行中', due: '2026-09-15' },
  { id: 'task-4835', num: 4835, title: '支付失敗通知信', url: '/projects/8821/tasks/4835', assignee: 'Ada Chen', status: '待處理', due: '2026-09-19' },
]
const taskLabel = (t: Task) => `任務 #${t.num} ${t.title}`
type Page = { kind: 'overview' | 'board' | 'projects'; title: string; url: string }
const OVERVIEW: Page = { kind: 'overview', title: '專案總覽 — 結帳流程改版', url: '/projects/8821' }
const BOARD: Page = { kind: 'board', title: '衝刺看板 — Sprint 24', url: '/projects/8821/board' }
const PROJECTS: Page = { kind: 'projects', title: '專案列表', url: '/projects' }

/** 舞台 = 宿主區(容器 − 面板)。帶 transform 讓有 URL 的 modal 用 `portalContainer` 傳送進來後 fixed 以它為準。 */
function Stage({ stageRef, children }: { stageRef: React.Ref<HTMLDivElement>; children: React.ReactNode }) {
  return (
    <div ref={stageRef} className="relative flex min-w-0 flex-1 flex-col gap-[var(--layout-space-loose)] overflow-hidden p-[var(--layout-space-loose)]" style={{ transform: 'translateZ(0)' }}>
      {children}
    </div>
  )
}

function ProjectFacts() {
  return (
    <DescriptionList orientation="horizontal">
      <DescriptionItem label="擁有者">Ada Chen</DescriptionItem>
      <DescriptionItem label="狀態">進行中</DescriptionItem>
      <DescriptionItem label="截止日">2026-10-31</DescriptionItem>
    </DescriptionList>
  )
}

function TaskList({ tasks, onOpen, idPrefix, heading = '任務' }: { tasks: readonly Task[]; onOpen: (t: Task) => void; idPrefix: string; heading?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-body-lg font-medium">{heading}</h2>
      {tasks.length === 0
        ? <p className="text-body text-fg-muted">沒有任務</p>
        : (
          <ul className="flex flex-col gap-1">
            {tasks.map((t) => (
              <li key={t.id}><Button variant="link" id={`${idPrefix}-${t.id}`} onClick={() => onOpen(t)}>{taskLabel(t)}</Button></li>
            ))}
          </ul>
        )}
    </div>
  )
}

function TaskDialog({ task, open, onOpenChange, portalContainer, persistentElements, comments, onSave, onDeleteTask, ids }: {
  task: Task; open: boolean; onOpenChange: (open: boolean) => void; portalContainer: HTMLElement | null
  persistentElements: () => Element[]; comments: string[]; onSave: (comment: string) => void; onDeleteTask?: () => void
  ids: { input: string; save: string; cancel: string; delete?: string }
}) {
  const [comment, setComment] = React.useState('')
  React.useEffect(() => { if (!open) setComment('') }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange} persistentElements={persistentElements}>
      <DialogContent maxWidth={480} autoHeight portalContainer={portalContainer}>
        <DialogHeader>
          <DialogTitle>{taskLabel(task)}</DialogTitle>
          <DialogDescription>Sprint 24 · 指派給 {task.assignee}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-[var(--layout-space-loose)]">
            <DescriptionList orientation="horizontal">
              <DescriptionItem label="指派人">{task.assignee}</DescriptionItem>
              <DescriptionItem label="狀態">{task.status}</DescriptionItem>
              <DescriptionItem label="截止日">{task.due}</DescriptionItem>
            </DescriptionList>
            {comments.length > 0 && (
              <ul className="flex flex-col gap-1" aria-label="留言">
                {comments.map((c, i) => <li key={i} className="text-body">{c}</li>)}
              </ul>
            )}
            <Field>
              <FieldLabel>留言</FieldLabel>
              <Input id={ids.input} placeholder="寫下你的更新…" value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          {onDeleteTask && <Button id={ids.delete} variant="secondary" danger onClick={onDeleteTask}>刪除任務</Button>}
          <Button id={ids.cancel} variant="tertiary" onClick={() => onOpenChange(false)}>取消</Button>
          <Button id={ids.save} variant="primary" disabled={!comment.trim()} onClick={() => { onSave(comment.trim()); onOpenChange(false) }}>儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 沒有 URL 的確認框:一般 modal(不傳 persistentElements),傳送到畫布,蓋住一切含代理(v14 條 A)。 */
function ConfirmDialog({ open, title, description, confirmLabel, onCancel, onConfirm, portalContainer, ids }: {
  open: boolean; title: string; description: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void
  portalContainer: HTMLElement | null; ids: { cancel: string; confirm: string }
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent maxWidth={400} autoHeight portalContainer={portalContainer}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button id={ids.cancel} variant="tertiary" onClick={onCancel}>取消</Button>
          <Button id={ids.confirm} variant="primary" danger onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type ChatMessage = { role: 'user' | 'agent'; content: React.ReactNode }
function useAgentChat(initial: ChatMessage[]) {
  const [messages, setMessages] = React.useState<ChatMessage[]>(initial)
  const [draft, setDraft] = React.useState('')
  const submit = React.useCallback(() => {
    const text = draft.trim()
    if (!text) return
    setMessages((m) => [...m, { role: 'user', content: text }, { role: 'agent', content: `收到,我把「${text}」記到這個專案的討論串了,有進展會再告訴你。` }])
    setDraft('')
  }, [draft])
  const reset = React.useCallback(() => { setMessages([]); setDraft('') }, [])
  return { messages, draft, setDraft, submit, reset }
}

function AgentColumn({ hostRef, open, onOpenChange, chat }: {
  hostRef: React.Ref<HTMLDivElement>; open: boolean; onOpenChange: (open: boolean) => void; chat: ReturnType<typeof useAgentChat>
}) {
  return (
    // 面板必須是畫布 flex 的**直接子節點**(它量的是自己的父層),所以殼用 display:contents
    <div ref={hostRef} className="contents">
      <AgentPanelDock open={open} onOpenChange={onOpenChange} logoState="idle">
        {({ close }) => (
          <AgentPanel className="border-l border-divider">
            <AgentPanelHeader title={chat.messages.length ? '任務助理' : '新對話'} activeConversationId="c1" {...headerWiring} onNewConversation={chat.reset} onClose={close} />
            <AgentConversation>
              {chat.messages.map((m, i) => <AgentMessage key={i} role={m.role}>{m.content}</AgentMessage>)}
            </AgentConversation>
            <AgentPromptInput value={chat.draft} onValueChange={chat.setDraft} onSubmit={chat.submit} onRemoveAttachment={noop} onAddAttachment={noop} attachments={[]} placeholder="問我或指派工作…" />
          </AgentPanel>
        )}
      </AgentPanelDock>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   並存(v14 條 A / B):有 URL 的任務詳情開著時,右側代理仍可對話、打字;modal 與遮罩只佔舞台。
   閘:`scripts/agent-modal-coexistence-invariant.mjs`
   ═══════════════════════════════════════════════════════════════════════════ */
function CoexistenceScene() {
  const [stage, setStage] = React.useState<HTMLDivElement | null>(null)
  const [canvas, setCanvas] = React.useState<HTMLDivElement | null>(null)
  const panelHostRef = React.useRef<HTMLDivElement | null>(null)
  const toolbarRef = React.useRef<HTMLDivElement | null>(null)
  const keep = React.useCallback(() => [panelHostRef.current, toolbarRef.current].filter((el): el is HTMLDivElement => !!el), [])
  const [tasks, setTasks] = React.useState<readonly Task[]>(TASKS)
  const [openTask, setOpenTask] = React.useState<Task | null>(TASKS[0])
  const [comments, setComments] = React.useState<Record<string, string[]>>({})
  const [confirmTask, setConfirmTask] = React.useState(false)
  const [agentOpen, setAgentOpen] = React.useState(true)
  const chat = useAgentChat([
    { role: 'user', content: '幫我看一下 #4821 卡在哪' },
    { role: 'agent', content: '這張任務卡在「登入逾時」的重現步驟:Betty 昨天補了伺服器 log,但還缺 QA 的環境資訊(瀏覽器與版本)。你可以直接在左邊的任務裡留言要,我會把結果同步到衝刺看板。' },
  ])
  const NEW_TASK: Task = { id: 'task-new', num: 4840, title: '新任務', url: '/projects/8821/tasks/new', assignee: '未指派', status: '待處理', due: '—' }
  return (
    <div className="p-[var(--layout-space-loose)]">
      <SimulatedBrowser
        url={openTask ? openTask.url : OVERVIEW.url}
        canBack={!!openTask}
        onBack={() => setOpenTask(null)}
        canvasRef={setCanvas}
        toolbarRef={toolbarRef}
        caption="模擬:任務詳情有自己的網址,開著時只遮住左邊的舞台,右側的代理照常可用;畫布上方的網址列與上下頁鈕只是示意。"
      >
        <Stage stageRef={setStage}>
          <h1 className="text-heading">{OVERVIEW.title}</h1>
          <ProjectFacts />
          <TaskList tasks={tasks} onOpen={setOpenTask} idPrefix="coexist-open" />
          <div className="flex gap-2">
            <Button id="coexist-stage-btn" variant="primary" onClick={() => setOpenTask(NEW_TASK)}>新增任務</Button>
          </div>
          {stage && openTask && (
            <TaskDialog
              task={openTask}
              open
              onOpenChange={(o) => { if (!o) setOpenTask(null) }}
              portalContainer={stage}
              persistentElements={keep}
              comments={comments[openTask.id] ?? []}
              onSave={(c) => setComments((m) => ({ ...m, [openTask.id]: [...(m[openTask.id] ?? []), c] }))}
              onDeleteTask={openTask.id === 'task-new' ? undefined : () => setConfirmTask(true)}
              ids={{ input: 'coexist-modal-input', save: 'coexist-modal-save', cancel: 'coexist-modal-btn', delete: 'coexist-task-delete' }}
            />
          )}
          {canvas && openTask && (
            <ConfirmDialog
              open={confirmTask}
              title={`確定要刪除${taskLabel(openTask)}?`}
              description="任務的留言與附件都會被永久刪除,無法復原。"
              confirmLabel="刪除"
              onCancel={() => setConfirmTask(false)}
              onConfirm={() => { setTasks((ts) => ts.filter((t) => t.id !== openTask.id)); setConfirmTask(false); setOpenTask(null) }}
              portalContainer={canvas}
              ids={{ cancel: 'coexist-confirm-cancel', confirm: 'coexist-confirm-delete' }}
            />
          )}
        </Stage>
        <AgentColumn hostRef={panelHostRef} open={agentOpen} onOpenChange={setAgentOpen} chat={chat} />
      </SimulatedBrowser>
    </div>
  )
}

export const ModalCoexistence: Story = {
  name: '並存 — 有 URL 的 modal 與 agent 同時可用',
  parameters: {
    docs: {
      description: {
        story: '任務詳情有自己的網址,依代理原則第 A 條取得並存資格:它開著時只遮住舞台(宿主),右側代理仍可對話與打字;從任務裡按「刪除任務」開出的確認框沒有網址,會蓋住一切包含代理,取消後兩邊恢復。畫布外的網址列與上下頁鈕是模擬用。',
      },
    },
  },
  render: () => <CoexistenceScene />,
}

/* ═══════════════════════════════════════════════════════════════════════════
   URL 註冊表示意 —— 假資料,把 v14 條 A/B/C/D/E/F 的互動演出來。真正的註冊表(誰有 URL、由誰確認)
   在產品／導航層,DS 沒有也不該有;`persistentElements` 不讀 URL、不建立資格。
   閘:`scripts/agent-url-registry-demo-invariant.mjs`
   ═══════════════════════════════════════════════════════════════════════════ */
type HistoryEntry = { host: Page; task: Task | null }

function UrlRegistryScene() {
  const [stage, setStage] = React.useState<HTMLDivElement | null>(null)
  const [canvas, setCanvas] = React.useState<HTMLDivElement | null>(null)
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const toolbarRef = React.useRef<HTMLDivElement | null>(null)
  const keep = React.useCallback(() => [panelRef.current, toolbarRef.current].filter((el): el is HTMLDivElement => !!el), [])
  const [tasks, setTasks] = React.useState<readonly Task[]>(TASKS)
  // 歷史堆疊合成一個 state,`go` 才能是穩定的 callback(初始代理回覆裡的連結閉包會抓住它;
  // 分開兩個 state 時第一次 render 的 idx 被閉包凍住,點連結會把歷史截斷成不存在的位置)
  const [nav, setNav] = React.useState<{ entries: HistoryEntry[]; index: number }>({ entries: [{ host: OVERVIEW, task: null }], index: 0 })
  const hist = nav.entries, idx = nav.index
  const go = React.useCallback((next: HistoryEntry) => setNav((n) => ({ entries: [...n.entries.slice(0, n.index + 1), next], index: n.index + 1 })), [])
  const back = React.useCallback(() => setNav((n) => ({ ...n, index: Math.max(0, n.index - 1) })), [])
  const forward = React.useCallback(() => setNav((n) => ({ ...n, index: Math.min(n.entries.length - 1, n.index + 1) })), [])
  const [comments, setComments] = React.useState<Record<string, string[]>>({})
  const [confirmProject, setConfirmProject] = React.useState(false)
  const [confirmTask, setConfirmTask] = React.useState(false)
  const [agentOpen, setAgentOpen] = React.useState(true)
  const initialChat = React.useMemo<ChatMessage[]>(() => [
    { role: 'user', content: '登入逾時那件事現在在哪裡處理?' },
    { role: 'agent', content: (
      <>
        <p>跟你問的有關的有三處:</p>
        <ul className="mt-2 flex flex-col gap-1">
          <li><a href={TASKS[0].url} id="demo-link-task-4821" onClick={(e) => { e.preventDefault(); go({ host: OVERVIEW, task: TASKS[0] }) }}>{taskLabel(TASKS[0])}</a></li>
          <li><a href={BOARD.url} id="demo-link-sprint-board" onClick={(e) => { e.preventDefault(); go({ host: BOARD, task: null }) }}>{BOARD.title}</a></li>
          <li><a href="https://support.example.com/tickets/88213" id="demo-link-zendesk" target="_blank" rel="noopener noreferrer">Zendesk 客訴 #88213<ExternalLink size={14} className="ml-1 inline-block align-[-2px]" aria-hidden /></a></li>
        </ul>
        <p className="mt-2">另外有人在討論串提到 <span id="demo-unconfirmed">/projects/9999</span>,但系統裡查不到這個專案,我就沒有放連結。</p>
      </>
    ) },
  ], [go])
  const chat = useAgentChat(initialChat)
  const cur = hist[idx]
  const location = cur.task ? cur.task.url : cur.host.url
  // v14 條 F:重新整理 = 宿主不變、代理回到初始關閉的新對話(草稿與對話不保留)
  const reload = () => { setAgentOpen(false); chat.reset() }
  const closeTask = () => { if (cur.task) go({ host: cur.host, task: null }) }
  return (
    <div className="p-[var(--layout-space-loose)]">
      <SimulatedBrowser
        url={location}
        canBack={idx > 0}
        canForward={idx < hist.length - 1}
        onBack={back}
        onForward={forward}
        onReload={reload}
        canvasRef={setCanvas}
        toolbarRef={toolbarRef}
        caption="示意(假資料):代理回覆裡的連結模擬「系統已查回、已確認」的目的地。有自己網址的內容只遮住舞台、能和代理並存;沒有網址的確認框會把代理一起擋住;系統沒確認過的網址只會是純文字;重新整理讓代理回到初始關閉。"
      >
        <Stage stageRef={setStage}>
          <h1 id="demo-stage-title" className="text-heading">{cur.host.title}</h1>
          {cur.host.kind === 'overview' && (
            <>
              <ProjectFacts />
              <TaskList tasks={tasks} onOpen={(t) => go({ host: cur.host, task: t })} idPrefix="demo-open" />
              <div className="flex gap-2">
                <Button id="demo-open-confirm" variant="secondary" danger onClick={() => setConfirmProject(true)}>刪除專案</Button>
              </div>
            </>
          )}
          {cur.host.kind === 'board' && (
            <div className="grid grid-cols-3 gap-[var(--layout-space-loose)]">
              <TaskList heading="待處理" tasks={tasks.filter((t) => t.status === '待處理')} onOpen={(t) => go({ host: cur.host, task: t })} idPrefix="demo-board" />
              <TaskList heading="進行中" tasks={tasks.filter((t) => t.status === '進行中')} onOpen={(t) => go({ host: cur.host, task: t })} idPrefix="demo-board" />
              <TaskList heading="完成" tasks={[]} onOpen={() => {}} idPrefix="demo-board-done" />
            </div>
          )}
          {cur.host.kind === 'projects' && (
            <div className="flex flex-col gap-1">
              <p className="text-body text-fg-muted">「結帳流程改版」已刪除。</p>
              <ul className="flex flex-col gap-1">
                <li><Button variant="link" onClick={() => go({ host: OVERVIEW, task: null })}>結帳流程改版(已封存)</Button></li>
                <li><Button variant="link">客服平台整合</Button></li>
              </ul>
            </div>
          )}
          {stage && cur.task && (
            <TaskDialog
              task={cur.task}
              open
              onOpenChange={(o) => { if (!o) closeTask() }}
              portalContainer={stage}
              persistentElements={keep}
              comments={comments[cur.task.id] ?? []}
              onSave={(c) => { const id = cur.task!.id; setComments((m) => ({ ...m, [id]: [...(m[id] ?? []), c] })) }}
              onDeleteTask={() => setConfirmTask(true)}
              ids={{ input: 'demo-modal-input', save: 'demo-modal-save', cancel: 'demo-modal-cancel', delete: 'demo-task-delete' }}
            />
          )}
          {canvas && cur.task && (
            <ConfirmDialog
              open={confirmTask}
              title={`確定要刪除${taskLabel(cur.task)}?`}
              description="任務的留言與附件都會被永久刪除,無法復原。"
              confirmLabel="刪除"
              onCancel={() => setConfirmTask(false)}
              onConfirm={() => { const id = cur.task!.id; setTasks((ts) => ts.filter((t) => t.id !== id)); setConfirmTask(false); closeTask() }}
              portalContainer={canvas}
              ids={{ cancel: 'demo-task-confirm-cancel', confirm: 'demo-task-confirm-delete' }}
            />
          )}
          {canvas && (
            <ConfirmDialog
              open={confirmProject}
              title="確定要刪除專案?"
              description="專案內的任務、討論與附件都會被永久刪除,無法復原。"
              confirmLabel="刪除"
              onCancel={() => setConfirmProject(false)}
              onConfirm={() => { setConfirmProject(false); go({ host: PROJECTS, task: null }) }}
              portalContainer={canvas}
              ids={{ cancel: 'demo-confirm-cancel', confirm: 'demo-confirm-delete' }}
            />
          )}
        </Stage>
        <AgentColumn hostRef={panelRef} open={agentOpen} onOpenChange={setAgentOpen} chat={chat} />
      </SimulatedBrowser>
    </div>
  )
}

export const UrlRegistryDemo: Story = {
  name: '示意(假資料)— URL 註冊表:誰能與 agent 並存',
  parameters: {
    docs: {
      description: {
        story: '假資料示意:代理回覆裡的連結模擬「系統已確認」的目的地。點「任務 #4821」開有網址的 modal,它只遮舞台、代理仍可用;點「刪除專案」或任務裡的「刪除任務」開沒有網址的確認框,代理被擋、取消後恢復;點「衝刺看板」宿主換頁、網址列跟著變;上一頁 / 下一頁走歷史;重新整理讓代理回到初始關閉(草稿不保留),關掉再開則草稿保留。',
      },
    },
  },
  render: () => <UrlRegistryScene />,
}

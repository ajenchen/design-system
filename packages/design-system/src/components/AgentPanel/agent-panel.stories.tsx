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
import { DataTable } from '@/design-system/components/DataTable/data-table'
import type { ColumnDef } from '@tanstack/react-table'
import { Empty } from '@/design-system/components/Empty/empty'

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
      <AgentPanelDock logoState={logoState}>{children}</AgentPanelDock>
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
 * 思考 → 停止:按「思考 3 秒」進入思考(靜止起步半圈時間加速到 0.75s/圈,負空間同時由橢圓圓化),3 秒後離開
 * 思考 → 從當下角度以 exit 鏡像曲線減速、負空間同步由圓回橢圓、色場基底跟著當下角度、落回正位 0°(0.75–1.82s)
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


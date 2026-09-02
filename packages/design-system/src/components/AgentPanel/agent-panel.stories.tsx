// @story-history: 家族展示層 = 真實業務場景 + OpenSnapshot 覆蓋(M15:defaultOpen/常駐可截圖);
// 標誌/FAB 狀態矩陣屬本層(動態資產,anatomy 靜態矩陣載不動)。
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
} from './agent-panel'
import { AgentLogo } from './agent-logo'
import { AgentFab } from './agent-fab'
import { Empty } from '@/design-system/components/Empty/empty'

const meta: Meta<typeof AgentPanel> = {
  title: 'Design System/Components/AgentPanel/展示',
  component: AgentPanel,
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof AgentPanel>

/** 面板站右側全高:模擬 app 右欄環境。 */
function PanelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh justify-end bg-surface-sunken">
      {children}
    </div>
  )
}

const CONVERSATIONS: AgentConversationSummary[] = [
  { id: 'c1', title: '衝刺待辦整理', group: '今天', thinking: true },
  { id: 'c2', title: '發布公告草稿', group: '今天' },
  { id: 'c3', title: 'Q3 客訴分類', group: '過去 7 天' },
  { id: 'c4', title: '競品定價彙整', group: '過去 7 天' },
]

/** 任務助理完整對話:附件氣泡 + 思考塊 + 工具列 + 輸入盒(真實 Jira 型場景)。 */
export const TaskAssistant: Story = {
  name: '任務助理完整對話',
  render: function TaskAssistantStory() {
    const [value, setValue] = React.useState('')
    return (
      <PanelFrame>
        <AgentPanel>
          <AgentPanelHeader
            title="衝刺待辦整理"
            logoState="think"
            conversations={CONVERSATIONS}
            activeConversationId="c1"
            onSelectConversation={() => {}}
            onRenameConversation={() => {}}
            onDeleteConversation={() => {}}
            onNewConversation={() => {}}
            onClose={() => {}}
          />
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
            <AgentMessage
              role="agent"
              toolbar={<AgentToolbar pinned onCopy={() => {}} onLike={() => {}} onDislike={() => {}} />}
            >
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
            busy
            onStop={() => {}}
            attachments={[{ id: 't1', label: 'oncall-規範.pdf' }]}
            onRemoveAttachment={() => {}}
            onAddAttachment={() => {}}
          />
        </AgentPanel>
      </PanelFrame>
    )
  },
}

/** 決策卡覆蓋輸入區(OpenSnapshot):代理被阻擋、需人拍板。 */
export const DecisionCardOpen: Story = {
  name: '決策卡覆蓋輸入區',
  render: () => (
    <PanelFrame>
      <AgentPanel>
        <AgentPanelHeader title="發布公告草稿" />
        <AgentConversation>
          <AgentMessage role="agent">
            公告已寫好兩個版本,語氣不同,需要你選一個再繼續排程。
          </AgentMessage>
        </AgentConversation>
        <div className="relative">
          <AgentPromptInput value="" onValueChange={() => {}} />
          <AgentDecisionCard
            title="選擇公告語氣"
            questions={[
              {
                id: 'tone',
                label: '公告語氣',
                defaultValue: 'formal',
                options: [
                  { value: 'formal', label: '正式版', description: '對外客戶公告,保守措辭' },
                  { value: 'casual', label: '輕鬆版', description: '內部頻道,口語化' },
                ],
              },
            ]}
            onSubmit={() => {}}
            onSkip={() => {}}
          />
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
        <AgentPanelHeader title="發布公告草稿" />
        <AgentConversation>
          <AgentMessage role="agent">
            已按你的選擇繼續:
            <AgentDecisionSummary
              className="mt-2"
              entries={[{ question: '公告語氣', answer: '正式版' }]}
            />
          </AgentMessage>
        </AgentConversation>
        <AgentPromptInput value="" onValueChange={() => {}} />
      </AgentPanel>
    </PanelFrame>
  ),
}

/** 空狀態:問候區=標誌招喚態(邀請開始對話)。 */
export const EmptyConversation: Story = {
  name: '空狀態',
  render: () => (
    <PanelFrame>
      <AgentPanel>
        <AgentPanelHeader title="智慧代理" />
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Empty
            icon={<AgentLogo state="attract" size={48} detail="full" label="智慧代理" />}
            title="開始第一個對話"
            description="丟一個任務給代理,或把檔案拖進來。"
          />
        </div>
        <AgentPromptInput value="" onValueChange={() => {}} />
      </AgentPanel>
    </PanelFrame>
  ),
}

/** 標誌三態:靜止(=待機)/招喚/思考(動態資產矩陣;減動作時一律回靜止)。 */
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

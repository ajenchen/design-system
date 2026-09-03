// @anatomy-rationale: Inspector + ColorMatrix + SizeMatrix N/A — 家族無視覺 variant/size 軸(全由消費的 primitive/token 決定;spec「邊界案例 scope」hasVariants=false/hasSizes=false),幾何規格由 Overview 標註;StateBehavior 與 Accessibility 見下。
// 設計規格層:結構解剖 + 幾何規格(輪距/內距/尺寸);動態行為見展示層。
import type { Meta, StoryObj } from '@storybook/react'
import {
  AgentPanel,
  AgentPanelHeader,
  AgentConversation,
  AgentMessage,
  AgentToolbar,
  AgentPromptInput,
} from './agent-panel'
import { AgentLogo } from './agent-logo'
import { AgentThinking } from './agent-panel'

const meta: Meta<typeof AgentPanel> = {
  title: 'Design System/Components/AgentPanel/設計規格',
  component: AgentPanel,
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof AgentPanel>

/** Overview:三段 anatomy(Header / Conversation flex-1 / PromptInput)+ 左緣分隔線。 */
export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex h-dvh justify-end bg-canvas">
      <AgentPanel>
        <AgentPanelHeader title="智慧代理" onNewConversation={() => {}} onClose={() => {}} />
        <AgentConversation>
          <AgentMessage role="user">我方氣泡:bg-secondary、圓角 4、內距 8/12、寬 ≤85%、靠右。</AgentMessage>
          <AgentMessage
            role="agent"
            toolbar={<AgentToolbar onCopy={() => {}} onLike={() => {}} onDislike={() => {}} />}
          >
            代理回覆:無氣泡、全寬、text-body;輪距 40 = 8+24(工具列)+8;最後一則工具列常駐(AgentConversation 判定)、底距輸入盒 48。
          </AgentMessage>
        </AgentConversation>
        <AgentPromptInput
          value=""
          onValueChange={() => {}}
          attachments={[{ id: 'a', label: '附件列 Tag md,間距 4' }]}
          onSubmit={() => {}}
          onRemoveAttachment={() => {}}
          onAddAttachment={() => {}}
        />
      </AgentPanel>
    </div>
  ),
}

/** 標誌尺寸階:16 / 24 / 32 / 48 同一造型(2026-09-02 拍板:形狀規則,不設簡化檔)。 */
export const LogoSizeLadder: Story = {
  name: '標誌尺寸階',
  render: () => (
    <div className="flex items-end gap-8 p-12">
      {[16, 24, 32, 48].map((size) => (
        <div key={size} className="flex flex-col items-center gap-2">
          <AgentLogo state="still" size={size} label={`${size}px`} />
          <span className="text-caption text-fg-muted">
            {size}
            {''}
          </span>
        </div>
      ))}
    </div>
  ),
}

/** StateBehavior:思考塊進行中/完成、工具列常駐/懸停、送出↔停止——家族互動狀態一覽。 */
export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-8 p-8 text-body">
      <div className="flex gap-12">
        <div className="w-72">
          <div className="mb-2 text-caption text-fg-muted">思考塊:進行中(標題+最新行微光、自動展開)</div>
          <AgentThinking thinking steps={[<span key="1">已讀取 48 筆待辦</span>]} currentStep={<span>正在標記衝突項目…</span>} />
        </div>
        <div className="w-72">
          <div className="mb-2 text-caption text-fg-muted">思考塊:完成(靜態、自動收合、標題換字)</div>
          <AgentThinking steps={[<span key="1">已讀取 48 筆待辦</span>, <span key="2">比對排程規則 12 條</span>]} />
        </div>
      </div>
      <div className="flex gap-12">
        <div className="relative w-72 pb-10">
          <div className="mb-2 text-caption text-fg-muted">工具列:代理最後一則=常駐(單獨展示時以 pinned 覆寫)</div>
          <AgentMessage role="agent" toolbar={<AgentToolbar pinned onCopy={() => {}} onLike={() => {}} onDislike={() => {}} />}>最後一則回覆。</AgentMessage>
        </div>
        <div className="relative w-72 pb-10">
          <div className="mb-2 text-caption text-fg-muted">工具列:其他訊息=懸停淡入(移入看)</div>
          <AgentMessage role="agent" toolbar={<AgentToolbar onCopy={() => {}} onLike={() => {}} onDislike={() => {}} />}>較早的回覆。</AgentMessage>
        </div>
      </div>
      <div className="flex gap-12">
        <div className="w-80">
          <div className="mb-2 text-caption text-fg-muted">送出(有內容可按)</div>
          <AgentPromptInput value="幫我整理" onValueChange={() => {}} onSubmit={() => {}} onRemoveAttachment={() => {}} onAddAttachment={() => {}} />
        </div>
        <div className="w-80">
          <div className="mb-2 text-caption text-fg-muted">停止(代理進行中同位換實心正方)</div>
          <AgentPromptInput value="" onValueChange={() => {}} onSubmit={() => {}} onRemoveAttachment={() => {}} onAddAttachment={() => {}} busy onStop={() => {}} />
        </div>
      </div>
    </div>
  ),
}

/** Accessibility:家族 ARIA 角色與鍵盤約定一覽(規格 spec「Loading / 無障礙預設」節)。 */
export const Accessibility: Story = {
  name: '無障礙與鍵盤',
  render: () => (
    <table className="text-body [&_td]:px-3 [&_td]:py-1 [&_th]:px-3 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium">
      <thead><tr><th>元件</th><th>角色 / 屬性</th><th>鍵盤</th></tr></thead>
      <tbody>
        <tr><td>AgentPanel</td><td>role=complementary + aria-label</td><td>開啟時焦點入 header</td></tr>
        <tr><td>AgentPanelHeader chevron</td><td>aria-haspopup=menu + aria-expanded</td><td>Enter/Space 開歷史浮層;方向鍵走列</td></tr>
        <tr><td>AgentConversation</td><td>role=log + aria-live=polite</td><td>—</td></tr>
        <tr><td>AgentThinking</td><td>button + aria-expanded(內文不另設 aria-live)</td><td>Enter/Space 開合</td></tr>
        <tr><td>AgentToolbar</td><td>各鈕 aria-label</td><td>Tab 逐鈕;focus-within 常駐顯示</td></tr>
        <tr><td>AgentPromptInput</td><td>textarea aria-label=訊息;停止態 aria-label=停止生成</td><td>Enter 送出、Shift+Enter 換行</td></tr>
        <tr><td>AgentDecisionCard</td><td>role=group + aria-labelledby;radiogroup 原生</td><td>方向鍵選項;無 Esc(阻擋語意)</td></tr>
        <tr><td>AgentLogo / AgentFab</td><td>label 有→role=img;無→aria-hidden;FAB aria-label=開啟智慧代理</td><td>減動作:常駐 loop 全停回靜止</td></tr>
      </tbody>
    </table>
  ),
}

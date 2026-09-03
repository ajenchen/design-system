// @anatomy-rationale: Inspector N/A — 家族沒有 variant/size prop 可切換(面板寬是連續值、標誌狀態已由展示層「標誌三態」承載),即時預覽面板會退化成一個空殼;SizeMatrix / ColorMatrix 於本檔提供(2026-09-03 稽核補齊)
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
import { AGENT_BRAND, AgentLogo } from './agent-panel-logo'
import { AgentFab, AgentPanelDock } from './agent-panel-fab'
import { AgentThinking } from './agent-panel'
import { H3, Desc, Td, Th, Swatch, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

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

/** 尺寸對照表:家族三條尺寸軸(標誌 / 入口鈕 / 面板寬)與各自的 token 來源。 */
export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="space-y-6 p-12">
      <section>
        <H3>標誌</H3>
        <Desc>同一造型,不設簡化檔(2026-09-02 拍板);尺寸由消費點決定。</Desc>
        <div className="mt-2 flex items-end gap-8">
          {[16, 24, 32, 48].map((size) => (
            <div key={size} className="flex flex-col items-center gap-2">
              <AgentLogo state="still" size={size} label={`標誌 ${size}px`} />
              <span className="text-caption text-fg-muted">{size}</span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <H3>尺寸來源</H3>
        <table className="mt-2 w-full text-body">
          <thead>
            <tr><Th>用途</Th><Th>值</Th><Th>Token 來源</Th></tr>
          </thead>
          <tbody>
            <tr><Td>入口鈕(家)</Td><Td mono>40</Td><Td><TokenCell token="--field-height-lg" display="lg 密度 40" /></Td></tr>
            <tr><Td>入口鈕(貼邊)</Td><Td mono>28</Td><Td><TokenCell token="--field-height-sm" /></Td></tr>
            <tr><Td>貼邊帶寬</Td><Td mono>36</Td><Td><TokenCell token="--field-height-md" /></Td></tr>
            <tr><Td>面板寬(預設 / 最小 / 最大)</Td><Td mono>400 / 360 / 640</Td><Td><TokenCell token="--agent-panel-width" display="--agent-panel-width / -min / -max" /></Td></tr>
            <tr><Td>標題列高</Td><Td mono>48 / 56</Td><Td><TokenCell token="--chrome-header-height" display="md / lg density" /></Td></tr>
            <tr><Td>訊息輪距</Td><Td mono>40</Td><Td>8 + 24(工具列)+ 8</Td></tr>
            <tr><Td>最後一則 → 輸入盒</Td><Td mono>48</Td><Td><TokenCell token="--layout-space-bottom" /></Td></tr>
          </tbody>
        </table>
      </section>
    </div>
  ),
}

/** 色彩對照表:標誌雙緞帶色階、招喚波、入口鈕環與停靠帶,全部標出 token 來源。 */
export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="space-y-6 p-12">
      <section>
        <H3>品牌兩極(入口鈕環 / 光圈)</H3>
        <Desc>單一數值來源在 agent-panel-logo.tsx 的 AGENT_BRAND;等於自家色階,不隨主題改。</Desc>
        <table className="mt-2 w-full text-body">
          <thead><tr><Th /><Th>值</Th><Th>色階</Th></tr></thead>
          <tbody>
            <tr><Td><Swatch value={AGENT_BRAND.blue} /> 藍</Td><Td mono>{AGENT_BRAND.blue}</Td><Td><TokenCell token="--color-blue-4" /></Td></tr>
            <tr><Td><Swatch value={AGENT_BRAND.purple} /> 紫</Td><Td mono>{AGENT_BRAND.purple}</Td><Td><TokenCell token="--color-purple-4" /></Td></tr>
          </tbody>
        </table>
      </section>
      <section>
        <H3>面與訊息</H3>
        <table className="mt-2 w-full text-body">
          <thead><tr><Th>用途</Th><Th>Token</Th></tr></thead>
          <tbody>
            <tr><Td>面板底 / 入口鈕面</Td><Td><TokenCell token="--surface" display="--surface / --surface-raised" /></Td></tr>
            <tr><Td>我方氣泡</Td><Td><TokenCell token="--secondary" /></Td></tr>
            <tr><Td>代理內文連結</Td><Td><TokenCell token="--primary" display="--primary / hover --primary-hover" /></Td></tr>
            <tr><Td>左緣分隔線</Td><Td><TokenCell token="--divider" /></Td></tr>
            <tr><Td>停靠帶底 / 邊框</Td><Td><TokenCell token="--drop-target" display="--drop-target / --drop-target-border" /></Td></tr>
          </tbody>
        </table>
      </section>
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

/** 入口鈕的靜態對照表:兩個位置 × 三個標誌狀態。
 *  位置:在家(右下角 40 圓)與貼邊(右緣 28 半圓,只露內側一半)—— 同一顆鈕,靠拖曳或右鍵選單切換。
 *  狀態:跟著面板裡的代理走,面板關著也照轉。動態行為(拖、切換、送出後轉思考)見展示層「入口鈕」。 */
export const FabPlacements: Story = {
  name: '入口鈕:位置與狀態',
  render: () => (
    <div className="flex flex-col gap-8 p-8 text-body">
      <div className="flex gap-8">
      <div className="flex flex-col gap-2">
        <div className="text-caption text-fg-muted">在家:右下角 40 圓,招呼態帶邊框光圈</div>
        <div className="relative h-64 w-96 overflow-hidden rounded-md border border-divider bg-canvas">
          <AgentPanelDock defaultOpen={false} logoState="attract">{() => null}</AgentPanelDock>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-caption text-fg-muted">貼邊:右緣 28 半圓,只露內側一半</div>
        <div className="relative h-64 w-96 overflow-hidden rounded-md border border-divider bg-canvas">
          <AgentPanelDock defaultOpen={false} defaultPlacement={{ kind: 'dock', y: 96 }}>{() => null}</AgentPanelDock>
        </div>
      </div>
      </div>
      <div className="flex items-start gap-12">
        {(
          [
            ['still', '閒置'],
            ['attract', '有新訊(招喚:標誌蓄勢 + 邊框光圈)'],
            ['think', '思考中(面板關著也照轉)'],
          ] as const
        ).map(([state, label]) => (
          <div key={state} className="flex flex-col items-center gap-2">
            <AgentFab logoState={state} />
            <span className="text-caption text-fg-muted">{label}</span>
          </div>
        ))}
      </div>
    </div>
  ),
}

/** Accessibility:家族 ARIA 角色與鍵盤約定一覽(規格 spec「Loading / 無障礙預設」節)。 */
export const Accessibility: Story = {
  name: '無障礙與鍵盤',
  render: () => (
    <table className="w-full text-body">
      <thead><tr><Th>元件</Th><Th>角色 / 屬性</Th><Th>鍵盤</Th></tr></thead>
      <tbody>
        <tr><Td>AgentPanel</Td><Td>role=complementary + aria-label</Td><Td>無自動移焦;改名 / 刪除對話框關閉後焦點回標題觸發</Td></tr>
        <tr><Td>AgentPanelHeader chevron</Td><Td>aria-haspopup=dialog + aria-expanded</Td><Td>Enter/Space 開歷史浮層;方向鍵走列</Td></tr>
        <tr><Td>AgentConversation</Td><Td>role=log + aria-live=polite</Td><Td>—</Td></tr>
        <tr><Td>AgentThinking</Td><Td>button + aria-expanded(內文不另設 aria-live)</Td><Td>Enter/Space 開合</Td></tr>
        <tr><Td>AgentToolbar</Td><Td>各鈕 aria-label</Td><Td>Tab 逐鈕;focus-within 常駐顯示</Td></tr>
        <tr><Td>AgentPromptInput</Td><Td>textarea aria-label=訊息;停止態 aria-label=停止生成</Td><Td>Enter 送出、Shift+Enter 換行</Td></tr>
        <tr><Td>AgentDecisionCard</Td><Td>role=group + aria-labelledby;radiogroup 原生</Td><Td>方向鍵選項;無 Esc(阻擋語意)</Td></tr>
        <tr><Td>AgentLogo / AgentFab</Td><Td>label 有→role=img;無→aria-hidden;FAB aria-label=開啟智慧代理</Td><Td>減動作:常駐 loop 全停回靜止</Td></tr>
      </tbody>
    </table>
  ),
}

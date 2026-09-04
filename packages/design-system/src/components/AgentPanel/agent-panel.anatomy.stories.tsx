// @anatomy-rationale: Inspector N/A — 家族沒有 variant/size prop 可切換(面板寬是連續值、標誌狀態已由展示層「標誌三態」承載),即時預覽面板會退化成一個空殼;SizeMatrix / ColorMatrix 於本檔提供(2026-09-03 稽核補齊)
// 設計規格層:結構解剖 + 幾何規格(輪距/內距/尺寸);動態行為見展示層。
import * as React from 'react'
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

/** 元件檢閱器:即時預覽 + 藍圖 + Inspect 面板(6-canonical 之一)。
 *  面板是三段式容器,所以檢閱器盯的是**三段的垂直分工**與**寬度契約**——這兩件事決定了
 *  consumer 把面板放進自家版面時會不會走鐘。互動的部分(拖寬、開合、標誌)在展示層。 */
export const Inspector: Story = {
  name: '元件檢閱器',
  render: () => <InspectorView />,
}

const InspectorView = () => {
  const [width, setWidth] = React.useState(400)
  const clamped = Math.round(Math.min(Math.max(width, 360), 640))
  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="grid grid-cols-[1fr_340px] gap-6">
        {/* 左:即時預覽 + 藍圖 */}
        <div className="flex flex-col gap-6">
          <div>
            <H3>即時預覽</H3>
            <Desc>
              拉下面的滑桿改寬度,看三段怎麼分配:標題列與輸入盒是固定高,訊息區吃掉剩下的全部。
              寬度夾在 360 ~ 640 之間,且永遠不超過視窗寬的一半(較小者勝)。
            </Desc>
            <div className="border border-divider rounded-lg overflow-hidden" style={{ height: 420 }}>
              <div className="flex h-full justify-end bg-canvas">
                <AgentPanel width={clamped} resizable={false}>
                  <AgentPanelHeader title="衝刺待辦整理" activeConversationId="c1" onNewConversation={() => {}} onClose={() => {}} />
                  <AgentConversation>
                    <AgentMessage role="user">這週有哪幾筆待辦被重複指派?</AgentMessage>
                    <AgentMessage role="agent" toolbar={<AgentToolbar onCopy={() => {}} onLike={() => {}} onDislike={() => {}} />}>
                      有 6 筆同時掛在兩個人身上,已列在下面。
                    </AgentMessage>
                  </AgentConversation>
                  <AgentPromptInput value="" onValueChange={() => {}} onSubmit={() => {}} onRemoveAttachment={() => {}} onAddAttachment={() => {}} />
                </AgentPanel>
              </div>
            </div>
            <label className="mt-3 flex items-center gap-3 text-footnote text-fg-muted">
              <span className="font-mono">width</span>
              <input
                type="range"
                min={320}
                max={700}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="flex-1"
                aria-label="面板寬度"
              />
              <span className="font-mono">
                傳入 {width} → 實際 {clamped}
                {width !== clamped ? '(已夾回範圍內)' : ''}
              </span>
            </label>
          </div>

          <div>
            <H3>藍圖(Blueprint)</H3>
            <Desc>
              三段垂直分工:標題列與輸入盒各自量身高,中間的訊息區是唯一會伸縮的一段(`flex-1`)。
              決策卡出現時絕對定位貼底覆蓋輸入區,不改變這個分工。
            </Desc>
            <div className="border border-divider rounded-lg p-4 bg-muted/40 max-w-[520px]">
              <div className="border border-dashed border-primary-hover rounded px-2 py-1 mb-2">
                <p className="text-body font-medium text-foreground">AgentPanelHeader</p>
                <p className="text-footnote text-fg-muted mt-1 font-mono">固定高 · 消費 ChromeHeader(header-canonical)</p>
              </div>
              <div className="border border-dashed border-primary-hover rounded px-2 py-6 mb-2">
                <p className="text-body font-medium text-foreground">AgentConversation</p>
                <p className="text-footnote text-fg-muted mt-1 font-mono">
                  flex-1 · ScrollArea · 內距 16 · 輪距 40 · 底距 48 · role=&quot;log&quot;
                </p>
              </div>
              <div className="border border-dashed border-primary-hover rounded px-2 py-1">
                <p className="text-body font-medium text-foreground">AgentPromptInput</p>
                <p className="text-footnote text-fg-muted mt-1 font-mono">內容高 · 附件列 + 文字區 + 送出/停止</p>
              </div>
              <p className="text-footnote text-fg-muted mt-3 font-mono">
                左緣 1px 線只有一個 owner:resizable → ResizeHandle;resizable=false → border-l
              </p>
            </div>
          </div>
        </div>

        {/* 右:Inspect 面板 */}
        <div>
          <H3>Inspect 面板</H3>
          <div className="border border-divider rounded-lg p-4 flex flex-col gap-4 text-caption">
            <section>
              <p className="font-mono text-fg-muted mb-2">WIDTH</p>
              <ul className="flex flex-col gap-1">
                <li><span className="font-mono">--agent-panel-width</span> · 400(預設)</li>
                <li><span className="font-mono">--agent-panel-width-min</span> · 360</li>
                <li><span className="font-mono">--agent-panel-width-max</span> · 640</li>
                <li><span className="font-mono">視窗上限</span> · 50vw(與 max 取較小者)</li>
                <li><span className="font-mono">鍵盤步進</span> · ←/→ 16 · Home 最窄 · End 最寬</li>
              </ul>
            </section>
            <section>
              <p className="font-mono text-fg-muted mb-2">LAYOUT</p>
              <ul className="flex flex-col gap-1">
                <li><span className="font-mono">訊息區內距</span> · 16(--layout-space-loose)</li>
                <li><span className="font-mono">輪距</span> · 40 = 8 + 24(工具列 xs)+ 8</li>
                <li><span className="font-mono">訊息區底距</span> · 48(--layout-space-bottom)</li>
                <li><span className="font-mono">我方氣泡</span> · 內距 8/12 · 寬 ≤ 85% · 靠右</li>
                <li><span className="font-mono">代理訊息</span> · 無氣泡 · 全寬</li>
              </ul>
            </section>
            <section>
              <p className="font-mono text-fg-muted mb-2">PUBLIC PROPS(容器)</p>
              <ul className="flex flex-col gap-1">
                <li><span className="font-mono">width</span> · number — 受控寬度</li>
                <li><span className="font-mono">defaultWidth</span> · number — 非受控起始寬</li>
                <li><span className="font-mono">onWidthChange</span> · 拖曳中每格都發(即時回饋)</li>
                <li><span className="font-mono">onWidthCommit</span> · 放開/鍵盤一步發一次(要存這個)</li>
                <li><span className="font-mono">resizable</span> · boolean,預設 true</li>
              </ul>
            </section>
            <section>
              <p className="font-mono text-fg-muted mb-2">不由 consumer 決定</p>
              <ul className="flex flex-col gap-1">
                <li>工具列常駐 — 由 AgentConversation 判定最後一則代理訊息</li>
                <li>自動捲到最新 — 由 AgentConversation 實作(離底 &gt; 40 不搶捲)</li>
                <li>固定構件(標題觸發 / + / ×)— 恆渲染,不以 callback 有無當開關</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
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
      {/* 常駐 vs 懸停必須放進 `AgentConversation` 裡示範,不能用 `pinned` 覆寫單獨一則:
          spec.md「常駐判定 = 本元件」明文寫著 **consumer 不設 `pinned`**(由容器判定哪一則是
          最後的代理訊息,各 agent 才會一致)。規格層 story 是讀者照抄的樣板,示範被規格禁止的
          寫法等於教錯用法 —— 改成讓真實機制自己產生差異,順便把「憑什麼是這一則」也講清楚。 */}
      <div className="w-[34rem]">
        <div className="mb-2 text-caption text-fg-muted">
          工具列常駐 vs 懸停:由 AgentConversation 判定「最後一則代理訊息」,consumer 不自己設 pinned
        </div>
        <div className="h-64 border border-divider rounded-md">
          <AgentConversation>
            <AgentMessage role="agent" toolbar={<AgentToolbar onCopy={() => {}} onLike={() => {}} onDislike={() => {}} />}>
              已把 48 筆待辦按衝刺分組,其中 6 筆同時被指派給兩個人。(較早的回覆:工具列懸停才淡入)
            </AgentMessage>
            <AgentMessage role="user">那 6 筆先都給我。</AgentMessage>
            <AgentMessage role="agent" toolbar={<AgentToolbar onCopy={() => {}} onLike={() => {}} onDislike={() => {}} />}>
              已改派並標記為待確認。(最後一則代理訊息:工具列常駐,在流內佔位)
            </AgentMessage>
          </AgentConversation>
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
        <tr><Td>AgentFabDock(入口鈕)</Td><Td>button + aria-label(在家/貼邊各一句)+ aria-haspopup=menu + aria-expanded;命中形狀 ≡ 可視形狀(含圓角)</Td><Td>Enter/Space 開面板;在家 → 進貼邊;貼邊 ↑↓ 每步 16;← / Home 回家;Shift+F10 開選單;拖曳中 Esc 取消不落定</Td></tr>
      </tbody>
    </table>
  ),
}

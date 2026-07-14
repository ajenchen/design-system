// @anatomy-rationale:
//   Inspector / ColorMatrix / SizeMatrix / StateBehavior N/A — HoverCard 是
//   純行為 primitive(基於 Radix HoverCard),不含視覺樣式。bg / border /
//   shadow / padding / size 全由 consumer 透過 className 決定;無 own variant /
//   state / size。Overview + VisualVariants 兩個 story 已涵蓋 consumer 兩種
//   常見視覺(ProfileCard 亮色 vs OverflowIndicator 深色 tooltip)。
// @story-trait-allow: missing-opensnapshot — 同 hover-card.stories.tsx 檔頭 rationale:
//   hover-trigger 行為 primitive 的 anatomy doc 內多個 inline hover demo,forced defaultOpen
//   會讓多張浮層互疊蓋住規格表;open-state 視覺快照由 consumer canonical(ProfileCard /
//   OverflowIndicator)各自的 OpenSnapshot 涵蓋。
import type { Meta, StoryObj } from '@storybook/react'
import { HoverCard, HoverCardTrigger, HoverCardContent } from './hover-card'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Button } from '@/design-system/components/Button/button'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Internal/HoverCard/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy(純行為 primitive)</H3>
        <Desc>HoverCard 基於 Radix HoverCard,**不含視覺樣式**——只提供觸發邏輯、定位、動畫。Bg / border / shadow / padding 由 consumer 決定,符合不同場景的視覺語言。</Desc>
        <div className="flex items-center gap-6">
          <HoverCard>
            <HoverCardTrigger asChild>
              <Avatar src="https://i.pravatar.cc/80?u=ada-chen" alt="Ada Chen" size={40} />
            </HoverCardTrigger>
            <HoverCardContent className="bg-surface-raised border border-border rounded-lg p-4 shadow-[var(--elevation-200)]">
              <div className="flex flex-col gap-2 w-56">
                <div className="text-body font-medium">Ada Chen</div>
                <div className="text-caption text-fg-muted">Design Engineer · 台北</div>
                <Button variant="tertiary" size="sm">傳訊息</Button>
              </div>
            </HoverCardContent>
          </HoverCard>
          <span className="text-caption text-fg-muted">← hover Avatar 彈出 ProfileCard(可點按鈕)</span>
        </div>
      </div>

      <div>
        <H3>HoverCard 只提供</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>職責</Th><Th>實作</Th></tr></thead>
            <tbody>
              <tr><Td>z-index(浮層層級)</Td><Td mono>z-50</Td></tr>
              <tr><Td>進出場動畫</Td><Td>fade + zoom + slide(方向感知)</Td></tr>
              <tr><Td>sideOffset(與 trigger 的間距)</Td><Td mono>預設 8px(跟 Tooltip / Popover 統一)</Td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          不提供 bg / border / shadow / padding / rounded——consumer 決定。
        </p>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>元件</Th><Th>主要 Props</Th></tr></thead>
            <tbody>
              <tr><Td mono>HoverCard</Td><Td mono>openDelay={`{number}`} closeDelay={`{number}`}</Td></tr>
              <tr><Td mono>HoverCardTrigger</Td><Td mono>asChild={`{boolean}`}</Td></tr>
              <tr><Td mono>HoverCardContent</Td><Td mono>align / sideOffset / className(consumer 自套樣式)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const VisualVariants: Story = {
  name: '使用方的兩種常見視覺',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>亮色 Card 樣式(ProfileCard pattern)</H3>
        <Desc>人員資訊卡、內容預覽等可互動浮層。使用 `bg-surface-raised + elevation-200 + rounded-lg + border`。</Desc>
        <div className="flex items-center gap-6">
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="tertiary" size="sm">hover 看 Card</Button>
            </HoverCardTrigger>
            <HoverCardContent className="bg-surface-raised border border-border rounded-lg p-4 shadow-[var(--elevation-200)]">
              <div className="w-56">
                <div className="text-body font-medium mb-1">Ada Chen</div>
                <div className="text-caption text-fg-muted mb-3">Design Engineer · 台北</div>
                <Button variant="tertiary" size="sm">傳訊息</Button>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      </div>

      <div>
        <H3>深色 Tooltip 樣式(OverflowIndicator pattern)</H3>
        <Desc>溢出清單 / 快速預覽。使用 `bg-tooltip + data-theme="dark" + compact padding`。</Desc>
        <div className="flex items-center gap-6">
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="tertiary" size="sm">hover 看 Tooltip 樣式</Button>
            </HoverCardTrigger>
            <HoverCardContent className="bg-tooltip rounded-md px-3 py-2" data-theme="dark">
              <div className="text-caption w-56">
                深色樣式——常見於 OverflowIndicator 顯示溢出清單(+3 more 的 hover 展開)
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      </div>

      <div>
        <H3>選擇對照</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Consumer</Th><Th>視覺風格</Th><Th>典型用途</Th></tr></thead>
            <tbody>
              <tr><Td>ProfileCard</Td><Td mono>亮色 Card(bg-surface-raised + elevation-200)</Td><Td>人員 / 組織 / 文件預覽</Td></tr>
              <tr><Td>OverflowIndicator</Td><Td mono>深色 Tooltip(bg-tooltip + data-theme dark)</Td><Td>+N 溢出清單</Td></tr>
              <tr><Td>Custom</Td><Td>Consumer 自訂</Td><Td>任何需要可互動 hover 浮層的場景</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"ARIA 與互動模式:Radix HoverCard 刻意不設角色語意 / aria-* 屬性(定位為 sighted-mouse-user 增強,卡片內容不暴露給輔助技術),只提供 hover / focus 開、Esc 關 + data-state。觸發元素的可聚焦性需 consumer 自補(例如 Avatar 的 hoverCard 在元件內手動加 tabIndex=0 + role=\"img\" + aria-label;2026-07-06 拆除 role=\"button\" / aria-haspopup=\"dialog\" 空承諾 — 無 Enter/Space 行為卻宣告 popup ARIA = 對輔助技術的假承諾,對齊 avatar.tsx:252-256 + hover-card.spec.md:144)。\n\n鍵盤操作:\n\n- Tab — 焦點移到觸發元素\n- Hover 或 focus — 開啟浮層卡片\n- Esc — 關閉卡片\n\n焦點行為:這是非阻斷(non-modal)的浮層,focus 會開啟卡片但不會把焦點鎖在裡面;焦點仍留在觸發元素,按 Esc 即可關閉。觸發元素 focus 時顯示可見的外框(2px 實線,使用 --ring 色),與整個設計系統的 focus-visible 樣式一致。\n\n鍵盤限制:Radix HoverCard 會把卡片內所有可 Tab 的節點強制設成 tabindex=\"-1\",因此卡片內部的按鈕 / 連結鍵盤 Tab 到不了 — 鍵盤使用者僅能 focus 觸發元素開卡 + Esc 關卡,無法進入卡片操作互動內容。關鍵互動勿放 HoverCard 內,需鍵盤可達的互動浮層請用 Popover(click 觸發)。\n\n驗證:Storybook 無障礙檢測面板應為 0 項嚴重違規;文字對比至少 4.5:1、UI 元素對比至少 3:1,符合 WCAG AA。"}</p>
    </div>
  ),
}

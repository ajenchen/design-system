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
import { HoverCard, HoverCardTrigger, HoverCardContent, HOVER_CARD_SURFACE_CLASS } from './hover-card'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { ProfileCard, ProfileCardDefaultActions } from '@/design-system/components/ProfileCard/profile-card'
import { OverflowIndicator } from '@/design-system/components/OverflowIndicator/overflow-indicator'
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
        <Desc>HoverCard 基於 Radix HoverCard,不含視覺樣式——只提供觸發邏輯、定位、動畫。Bg / border / shadow / padding 由 consumer 決定,符合不同場景的視覺語言。</Desc>
        {/* 人員頭像一律走 Avatar 的 hoverCard(avatar.spec.md「Avatar HoverCard 原則」;頭像因此可用 Tab 聚焦開卡),
            內容是真的 ProfileCard(預設動作 + 查看更多,avatar.spec.md「onViewMore 為 hover context 必含」)—— 2026-10-20 前這裡是手刻的
            ItemContent 卡、頭像不可聚焦(獨立驗證 OV-06 / OV-V02) */}
        <div className="flex items-center gap-6">
          <Avatar
            src="https://i.pravatar.cc/80?u=ada-chen"
            alt="Ada Chen"
            size={40}
            hoverCard={
              <ProfileCard
                name="Ada Chen"
                avatar={{ src: 'https://i.pravatar.cc/80?u=ada-chen', alt: 'Ada Chen' }}
                subtitle="Design Engineer · 台北"
                status="online"
                statusMessage="本週在台北辦公室"
                actions={<ProfileCardDefaultActions onChat={() => {}} onCall={() => {}} />}
                defaultFieldValues={{ id: 'ADACHEN', employeeNumber: '1048217' }}
                onViewMore={() => {}}
              />
            }
          />
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
        <Desc>人員資訊卡、內容預覽等可互動浮層。外殼 = HOVER_CARD_SURFACE_CLASS(bg-surface-raised + text-foreground + border + rounded-lg + elevation-200,不含內距 —— ProfileCard 自帶內距)。</Desc>
        <div className="flex items-center gap-6">
          <p className="text-body">
            設計稿請找
            <HoverCard>
              <HoverCardTrigger asChild>
                {/* 行內 @mention 用可聚焦的連結(hover-card.spec.md A11y「Trigger 的可聚焦性需 consumer 自補」;Tab 到它就開卡) */}
                <a
                  href="#member-ada-chen"
                  onClick={(e) => e.preventDefault()}
                  // @layout-space-magic-ok: 句子裡的行內人名連結左右 4px(行內文字 micro)(layoutSpace.spec.md:166 micro)
                  className="text-primary underline underline-offset-2 mx-1 cursor-pointer"
                >
                  @Ada Chen
                </a>
              </HoverCardTrigger>
              <HoverCardContent align="start" className={HOVER_CARD_SURFACE_CLASS}>
                <ProfileCard
                  name="Ada Chen"
                  avatar={{ src: 'https://i.pravatar.cc/80?u=ada-chen', alt: 'Ada Chen' }}
                  subtitle="Design Engineer · 台北"
                  status="online"
                  statusMessage="本週在台北辦公室"
                  actions={<ProfileCardDefaultActions onChat={() => {}} onCall={() => {}} />}
                  defaultFieldValues={{ id: 'ADACHEN', employeeNumber: '1048217' }}
                  onViewMore={() => {}}
                />
              </HoverCardContent>
            </HoverCard>
            確認。
          </p>
        </div>
      </div>

      <div>
        <H3>深色 Tooltip 樣式(OverflowIndicator pattern)</H3>
        <Desc>溢出清單。外殼 = HOVER_CARD_TOOLTIP_SURFACE_CLASS + data-theme=&quot;dark&quot;(bg-tooltip + text-foreground + rounded-lg;字色一定要在換主題的那一層重新解析,否則淺色頁上是黑字配深底)。下方是 OverflowIndicator 本身,不另仿一份。</Desc>
        {/* 消費元件本身(M23(d) 最相近的同目的 canonical):2026-10-20 前這裡手仿一張深色卡,連同 OverflowIndicator 一起漏了字色,
            淺色頁上清單 1.92:1(獨立驗證 OV-02) */}
        <div className="flex items-center gap-6">
          <OverflowIndicator count={3} shape="tag" size="md">
            {/* 清單內容照正規用法直排、每人一列(hover-card.stories.tsx「溢出清單」、overflow-indicator.stories.tsx 頭像堆疊同一個寫法) */}
            {/* @layout-space-magic-ok: +N 浮層內的同質人員列(layoutSpace.spec.md:165 同質清單列) */}
            <div className="flex flex-col gap-1 min-w-[160px] text-caption">
              {['林思妤', '陳柏宇', 'Aisha Khan'].map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
          </OverflowIndicator>
        </div>
      </div>

      <div>
        <H3>選擇對照</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Consumer</Th><Th>視覺風格</Th><Th>典型用途</Th></tr></thead>
            <tbody>
              <tr><Td>ProfileCard</Td><Td mono>HOVER_CARD_SURFACE_CLASS(亮色 Card)</Td><Td>人員 / 組織 / 文件預覽</Td></tr>
              <tr><Td>OverflowIndicator</Td><Td mono>HOVER_CARD_TOOLTIP_SURFACE_CLASS + data-theme dark(深色 Tooltip)</Td><Td>+N 溢出清單</Td></tr>
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
  name: '無障礙與鍵盤',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"ARIA 與互動模式:Radix HoverCard 不設 popup role、aria-* 或 trigger 關聯，也不提供鍵盤可操作的 popup 語意；它會把卡片內可 Tab 的節點移出循序 Tab order，但不代表內容已從 accessibility tree 隱藏。其餘只提供 hover / focus 開、Esc 關 + data-state。觸發元素的可聚焦性需 consumer 自補(例如 Avatar 的 hoverCard 在元件內手動加 tabIndex=0 + role=\"img\" + aria-label;2026-07-06 拆除 role=\"button\" / aria-haspopup=\"dialog\" 空承諾 — 無 Enter/Space 行為卻宣告 popup ARIA = 對輔助技術的假承諾,對齊 avatar.tsx#AvatarInner + hover-card.spec.md「A11y 預設」)。\n\n鍵盤操作:\n\n- Tab — 焦點移到觸發元素\n- Hover 或 focus — 開啟浮層卡片\n- Esc — 關閉卡片\n\n焦點行為:這是非阻斷(non-modal)的浮層,focus 會開啟卡片但不會把焦點鎖在裡面;焦點仍留在觸發元素,按 Esc 即可關閉。觸發元素 focus 時顯示可見的外框(2px 實線,使用 --ring 色),與整個設計系統的 focus-visible 樣式一致。\n\n鍵盤限制:Radix HoverCard 會把卡片內所有可 Tab 的節點強制設成 tabindex=\"-1\",因此卡片內部的按鈕 / 連結鍵盤 Tab 到不了 — 鍵盤使用者僅能 focus 觸發元素開卡 + Esc 關卡,無法進入卡片操作互動內容。關鍵互動勿放 HoverCard 內,需鍵盤可達的互動浮層請用 Popover(click 觸發)。\n\n驗證:Storybook 無障礙檢測面板應為 0 項嚴重違規;文字對比至少 4.5:1、UI 元素對比至少 3:1,符合 WCAG AA。"}</p>
    </div>
  ),
}

// @principles-rationale: Merged WhenToUse + VsTooltipRule + NotForCriticalInfoRule
// into a single `UsageGuidance` story (3 sections) per 2026-04-26 user mandate to
// consolidate decision-related stories. PureBehaviorPrimitiveRule kept as separate principle.
// @story-trait-allow: missing-opensnapshot — 同 hover-card.stories.tsx 檔頭 rationale:
// 原則頁多個 inline hover demo,forced defaultOpen 會多張浮層互疊;open-state 快照由
// consumer canonical(ProfileCard / OverflowIndicator)的 OpenSnapshot 涵蓋。
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { ExternalLink } from 'lucide-react'
import { HoverCard, HoverCardTrigger, HoverCardContent } from './hover-card'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Internal/HoverCard/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-body-lg font-semibold text-foreground mb-3 pb-1 border-b border-divider">{title}</h2>
    <div>{children}</div>
  </section>
)

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3 max-w-md">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── UsageGuidance — 使用指引(何時用 / 何時不用 + 替代 / vs 近親) ──

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <div className="prose prose-sm max-w-prose">
          <p>適合 HoverCard 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <ul className="space-y-1">
            <li>
              <LinkTo kind="Design System/Internal/HoverCard/展示" name="人員頭像 ProfileCard"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">人員頭像 ProfileCard</span></LinkTo>
            </li>
            <li>
              <LinkTo kind="Design System/Internal/HoverCard/展示" name="連結預覽卡"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">連結預覽卡</span></LinkTo>
            </li>
            <li>
              <LinkTo kind="Design System/Internal/HoverCard/展示" name="溢出清單"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">溢出清單</span></LinkTo>
            </li>
            <li>
              <LinkTo kind="Design System/Internal/HoverCard/展示" name="儲存庫資訊卡"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">Repository 資訊卡</span></LinkTo>
            </li>
            <li>
              <LinkTo kind="Design System/Internal/HoverCard/展示" name="觸發點類型與延遲"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">Trigger 類型與 delay</span></LinkTo>
            </li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方「vs 近親」)。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代">
        <Rule
          title="❌ 關鍵資訊不放 HoverCard(觸控裝置無法 hover)"
          note="手機 / 平板沒有 hover 事件,HoverCard 根本不會觸發。關鍵資訊(錯誤警告、必要操作說明、付款條款)如果只靠 HoverCard,觸控使用者會完全錯過"
        >
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="primary" danger>刪除帳號</Button>
            </HoverCardTrigger>
            <HoverCardContent className="bg-surface-raised border border-error rounded-lg p-4">
              <div className="w-64">
                <div className="text-body font-medium text-error mb-1">永久刪除警告</div>
                <p className="text-caption">此動作會永久刪除所有資料</p>
              </div>
            </HoverCardContent>
          </HoverCard>
          <Label warn>↑ 刪除警告只靠 hover → 手機使用者點按鈕前根本沒看到 → 改用 Dialog 確認</Label>
        </Rule>

        <Rule
          title="✅ 補充資訊 / 預覽 / 人員卡適合 HoverCard"
          note="看到更好、看不到也不影響主流程的場景。即便觸控裝置沒 hover,使用者透過點擊人員 / 連結仍能取得完整資訊(HoverCard 只是桌機的快捷預覽)"
        >
          <HoverCard>
            <HoverCardTrigger asChild>
              <a
                href="https://help.acme.com/user-manual"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline cursor-pointer inline-flex items-center gap-1"
              >
                使用者手冊 <ExternalLink size={12} />
              </a>
            </HoverCardTrigger>
            <HoverCardContent className="bg-surface-raised border border-border rounded-lg p-4">
              <div className="w-64">
                <div className="text-body font-medium mb-1">使用者手冊</div>
                <p className="text-caption text-fg-muted">完整操作指南與常見問題</p>
              </div>
            </HoverCardContent>
          </HoverCard>
          <Label>↑ 連結預覽,hover 才看到是加分,沒看到點進去也行</Label>
        </Rule>
      </Section>

      <Section title="vs 近親 — HoverCard vs Tooltip(主檔)">
        <Rule
          title="HoverCard — 內容可互動、滑鼠移到浮層上不消失"
          note="適合放按鈕、連結、需要選取的文字。使用者 hover trigger → 浮層出現 → 滑鼠移到浮層上繼續停留並點擊按鈕 / 連結都沒問題"
        >
          <HoverCard>
            <HoverCardTrigger asChild>
              <span className="underline cursor-pointer">@Ada Chen</span>
            </HoverCardTrigger>
            <HoverCardContent className="bg-surface-raised border border-border rounded-lg p-4 shadow-[var(--elevation-200)]">
              <div className="flex flex-col gap-2 w-64">
                <div className="flex items-center gap-3">
                  <Avatar src="https://i.pravatar.cc/80?u=ada-chen" alt="Ada Chen" size={40} />
                  <div>
                    <div className="text-body font-medium">Ada Chen</div>
                    <div className="text-caption text-fg-muted">Design Engineer</div>
                  </div>
                </div>
                <Button variant="tertiary" size="sm">傳訊息</Button>
              </div>
            </HoverCardContent>
          </HoverCard>
          <Label>↑ hover @mention 彈出 ProfileCard,滑鼠可移到浮層點「傳訊息」</Label>
        </Rule>

        <Rule
          title="Tooltip — 純文字、不可互動、離開 trigger 即消失"
          note="適合一句話的提示(icon-only 的 aria-label、字串截斷補全)。無法互動,滑鼠離開 trigger 立刻消失。完整對照見 spec 的「與 Tooltip 的分界」"
        >
          <Label>完整情境對照與三角度分析見 hover-card.spec.md「與 Tooltip 的分界」(主檔)</Label>
        </Rule>

        <Rule
          title="判斷法:「使用者會想移到浮層上做事嗎?」"
          note="需要 → HoverCard;純看一句話 → Tooltip"
        >
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-1">
              <HoverCard>
                <HoverCardTrigger asChild>
                  <Avatar src="https://i.pravatar.cc/64?u=ada-chen" alt="Ada Chen" size={32} />
                </HoverCardTrigger>
                <HoverCardContent className="bg-surface-raised border border-border rounded-lg p-3">
                  <div className="flex flex-col gap-2 w-56">
                    <div className="text-body font-medium">Ada Chen</div>
                    <Button variant="tertiary" size="sm">查看 profile</Button>
                  </div>
                </HoverCardContent>
              </HoverCard>
              <Label>HoverCard(可點按鈕)</Label>
            </div>
            <div className="flex flex-col gap-1 items-center">
              <span title="此設定影響全域" className="text-footnote text-fg-muted underline decoration-dotted">全域設定 (hover)</span>
              <Label>Tooltip(純文字提示)</Label>
            </div>
          </div>
        </Rule>
      </Section>
    </div>
  ),
}

export const PureBehaviorPrimitiveRule: Story = {
  name: '純行為元件——視覺由使用方決定',
  render: () => (
    <div>
      <Rule
        title="HoverCard 只擁有觸發、定位與開關行為"
        note="背景、邊框、陰影、圓角與內距必須由真正的內容 owner 決定：ProfileCard 是明色人員資訊卡，OverflowIndicator 可是緊湊清單。若 HoverCard 自帶一套 chrome，兩個 consumer 都必須 override，結果反而會產生漂移。"
      >
        <Label>完整的亮色／深色渲染對照請看「設計規格 / 視覺變體」；這裡保留的是 ownership 判斷。</Label>
      </Rule>

      <Rule
        title="人員 Avatar 由 Avatar / ProfileCard 組合擁有視覺"
        note="人員場景使用 Avatar 的 `hoverCard` prop 連接互動，content 依 ProfileCard 規格撰寫；consumer 不重複手組 HoverCardTrigger，也不讓底層 primitive 擁有人員卡片樣式。"
      >
        <div className="flex items-center gap-3">
          <Avatar src="https://i.pravatar.cc/80?u=ada-chen" alt="Ada Chen" size={40} hoverCard={
            <div className="flex flex-col gap-2 w-56">
              <div className="text-body font-medium">Ada Chen</div>
              <div className="text-caption text-fg-muted">Design Engineer · 台北</div>
              <Button variant="tertiary" size="sm">傳訊息</Button>
            </div>
          } />
          <span className="text-body">Ada Chen</span>
        </div>
        <Label>Avatar 負責 trigger 整合，ProfileCard 負責內容與 chrome，HoverCard 只負責行為。</Label>
      </Rule>
    </div>
  ),
}

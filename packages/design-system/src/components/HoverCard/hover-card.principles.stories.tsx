// @principles-rationale: Merged WhenToUse + VsTooltipRule + NotForCriticalInfoRule
// into a single `UsageGuidance` story (3 sections) per 2026-04-26 user mandate to
// consolidate decision-related stories. PureBehaviorPrimitiveRule kept as separate principle.
// @story-trait-allow: missing-opensnapshot — 同 hover-card.stories.tsx 檔頭 rationale:
// 原則頁多個 inline hover demo,forced defaultOpen 會多張浮層互疊;open-state 快照由
// consumer canonical(ProfileCard / OverflowIndicator)的 OpenSnapshot 涵蓋。
import type { Meta, StoryObj } from '@storybook/react'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HoverCard, HoverCardTrigger, HoverCardContent, HOVER_CARD_SURFACE_CLASS } from './hover-card'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Button } from '@/design-system/components/Button/button'
import { FieldLabel } from '@/design-system/components/Field/field'
import { ItemContent } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { ProfileCard, ProfileCardDefaultActions } from '@/design-system/components/ProfileCard/profile-card'
import { ExampleCaption, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Internal/HoverCard/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, examplesClassName: 'max-w-md' })
// 範例是一顆觸發按鈕 / 掛著標記的按鈕:範例維持自然寬度(naturalWidth),不逐顆寫 self-start(T15)
const TriggerRule = createTutorialRule({ examples: true, naturalWidth: true, examplesClassName: 'max-w-md' })

// ── UsageGuidance — 使用指引(何時用 / 何時不用 + 替代 / vs 近親) ──

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <div className="max-w-prose">
          <p>適合 HoverCard 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <TutorialList>
            <li>
              <StoryLink kind="Design System/Internal/HoverCard/展示" name="人員頭像 ProfileCard">人員頭像 ProfileCard</StoryLink>
            </li>
            <li>
              <StoryLink kind="Design System/Internal/HoverCard/展示" name="連結預覽卡">連結預覽卡</StoryLink>
            </li>
            <li>
              <StoryLink kind="Design System/Internal/HoverCard/展示" name="溢出清單">溢出清單</StoryLink>
            </li>
            <li>
              <StoryLink kind="Design System/Internal/HoverCard/展示" name="儲存庫資訊卡">Repository 資訊卡</StoryLink>
            </li>
            <li>
              <StoryLink kind="Design System/Internal/HoverCard/展示" name="觸發點類型與延遲">Trigger 類型與 delay</StoryLink>
            </li>
          </TutorialList>
        </div>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TriggerRule
          title="❌ 關鍵資訊不放 HoverCard(觸控裝置無法 hover)"
          note="手機 / 平板沒有 hover 事件,HoverCard 根本不會觸發。關鍵資訊(錯誤警告、必要操作說明、付款條款)如果只靠 HoverCard,觸控使用者會完全錯過"
        >
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="primary" danger>刪除帳號</Button>
            </HoverCardTrigger>
            <HoverCardContent className={cn(HOVER_CARD_SURFACE_CLASS, 'border-error p-[var(--layout-space-loose)]')}>
              <ItemContent className="w-64" label="永久刪除警告" description="此動作會永久刪除所有資料" mode="scanning" labelClassName="text-body font-medium text-error" />
            </HoverCardContent>
          </HoverCard>
          <ExampleCaption warn>↑ 刪除警告只靠 hover → 手機使用者點按鈕前根本沒看到 → 改用 Dialog 確認</ExampleCaption>
        </TriggerRule>

        <TutorialRule
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
            <HoverCardContent className={cn(HOVER_CARD_SURFACE_CLASS, 'p-[var(--layout-space-loose)]')}>
              <ItemContent className="w-64" label="使用者手冊" description="完整操作指南與常見問題" mode="scanning" labelClassName="text-body font-medium" descriptionTone="muted" />
            </HoverCardContent>
          </HoverCard>
          <ExampleCaption>↑ 連結預覽,hover 才看到是加分,沒看到點進去也行</ExampleCaption>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="siblings">
        <TriggerRule
          title="HoverCard — 內容可互動、滑鼠移到浮層上不消失"
          note="適合放按鈕、連結、需要選取的文字。使用者 hover trigger → 浮層出現 → 滑鼠移到浮層上繼續停留並點擊按鈕 / 連結都沒問題"
        >
          <HoverCard>
            <HoverCardTrigger asChild>
              {/* 觸發點要能用 Tab 抵達(hover-card.spec.md A11y「Tab — 進入 trigger」「Trigger 的可聚焦性需 consumer 自補」):
                  @mention 是連結 —— 2026-10-20 前是不可聚焦的 <span>,鍵盤使用者打不開這張卡(獨立驗證 OV-V02) */}
              <a href="#member-ada-chen" onClick={(e) => e.preventDefault()} className="text-primary underline underline-offset-2 cursor-pointer">@Ada Chen</a>
            </HoverCardTrigger>
            {/* 人員內容一律 ProfileCard(內容與 chrome 的 owner)。外殼 = hover-card.tsx HOVER_CARD_SURFACE_CLASS(與 Avatar hoverCard 內建同一份):
                不設內距、不設寬度 —— 寬度由 ProfileCard 自己決定(profile-card.spec.md「寬度(元件級常數)」),外殼另給寬度會把卡片右側裁掉 */}
            <HoverCardContent className={HOVER_CARD_SURFACE_CLASS}>
              <ProfileCard
                name="Ada Chen"
                avatar={{ src: 'https://i.pravatar.cc/80?u=ada-chen', alt: 'Ada Chen' }}
                subtitle="Design Engineer"
                actions={<ProfileCardDefaultActions onChat={() => {}} onCall={() => {}} />}
                defaultFieldValues={{ id: 'ADACHEN', employeeNumber: '1048217' }}
                onViewMore={() => {}}
              />
            </HoverCardContent>
          </HoverCard>
          <ExampleCaption>↑ hover @mention 彈出 ProfileCard,滑鼠可移到浮層點「傳訊息」</ExampleCaption>
        </TriggerRule>

        <TutorialRule
          title="Tooltip — 純文字、不可互動、離開 trigger 即消失"
          note="適合一句話的提示(icon-only 的 aria-label、字串截斷補全)。無法互動,滑鼠離開 trigger 立刻消失。"
        />

        <TutorialRule
          title="判斷法:「使用者會想移到浮層上做事嗎?」"
          note="需要 → HoverCard;純看一句話 → Tooltip"
        >
          {/* 兩組「範例在上、說明在下」並排:靠下對齊,兩則說明才在同一條線上(範例高度不同:頭像 32px、欄位標籤一行字)。
              2026-10-20 前 items-center → 說明差 9.5px(獨立驗證 OV-13;說明在上的並排則靠上對齊,見 hover-card.stories TriggerShowcase) */}
          <div className="flex items-end gap-[var(--layout-space-loose)]">
            <ExampleGroup align="start">
              <Avatar
                src="https://i.pravatar.cc/64?u=ada-chen"
                alt="Ada Chen"
                size={32}
                hoverCard={<ProfileCard name="Ada Chen" avatar={{ src: 'https://i.pravatar.cc/80?u=ada-chen', alt: 'Ada Chen' }} subtitle="Design Engineer" actions={<ProfileCardDefaultActions onChat={() => {}} onCall={() => {}} />} defaultFieldValues={{ id: 'ADACHEN', employeeNumber: '1048217' }} onViewMore={() => {}} />}
              />
              <ExampleCaption>HoverCard(可點按鈕)</ExampleCaption>
            </ExampleGroup>
            <ExampleGroup align="start">
              {/* 純文字提示用 DS 的 Tooltip(FieldLabel 的 info ⓘ,同 tooltip.principles「Tooltip vs HoverCard」);
                  2026-10-20 前是瀏覽器原生 title 屬性 —— 不是 DS 元件,鍵盤也到不了(獨立驗證 OV-07) */}
              <FieldLabel info="這個設定會影響所有專案的預設值">預設時區</FieldLabel>
              <ExampleCaption>Tooltip(純文字提示)</ExampleCaption>
            </ExampleGroup>
          </div>
        </TutorialRule>
      </UsageSection>
    </TutorialPage>
  ),
}

export const PureBehaviorPrimitiveRule: Story = {
  name: '純行為元件——視覺由使用方決定',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="HoverCard 只擁有觸發、定位與開關行為"
        note="背景、邊框、陰影、圓角與內距必須由真正的內容 owner 決定：ProfileCard 是明色人員資訊卡，OverflowIndicator 可是緊湊清單。若 HoverCard 自帶一套 chrome，兩個 consumer 都必須 override，結果反而會產生漂移。"
      >
        <ExampleCaption>完整的亮色／深色渲染對照請看「設計規格 / 視覺變體」；這裡保留的是 ownership 判斷。</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="人員 Avatar 由 Avatar / ProfileCard 組合擁有視覺"
        note={<>人員場景使用 Avatar 的 <code>hoverCard</code> prop 連接互動，content 依 ProfileCard 規格撰寫；consumer 不重複手組 HoverCardTrigger，也不讓底層 primitive 擁有人員卡片樣式。</>}
      >
        {/* @layout-space-magic-ok: 頭像 ↔ 姓名(同一列 label / value)(layoutSpace.spec.md:166 micro) */}
        <div className="flex items-center gap-3">
          <Avatar src="https://i.pravatar.cc/80?u=ada-chen" alt="Ada Chen" size={40} hoverCard={
            <ProfileCard
              name="Ada Chen"
              avatar={{ src: 'https://i.pravatar.cc/80?u=ada-chen', alt: 'Ada Chen' }}
              subtitle="Design Engineer · 台北"
              actions={<ProfileCardDefaultActions onChat={() => {}} onCall={() => {}} />}
              defaultFieldValues={{ id: 'ADACHEN', employeeNumber: '1048217' }}
              onViewMore={() => {}}
            />
          } />
          <span className="text-body">Ada Chen</span>
        </div>
        <ExampleCaption>Avatar 負責 trigger 整合，ProfileCard 負責內容與 chrome，HoverCard 只負責行為。</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

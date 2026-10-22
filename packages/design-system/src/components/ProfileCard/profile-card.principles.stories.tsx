// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { ProfileCard, ProfileCardDefaultActions } from './profile-card'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/ProfileCard/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true })

const AVATAR_URL = 'https://i.pravatar.cc/128?u=alice-designsys'

// 預設動作一律消費 ProfileCardDefaultActions(profile-card.spec.md「Consumer 跨 story / 跨 consumer 必須用同一組 canonical actions」);
// 2026-10-20 前這裡手刻「Chat / Call」—— 名字還跟元件預設的「Audio call」不一樣(獨立驗證 OV-10 同族)
const sampleActions = <ProfileCardDefaultActions onChat={() => {}} onCall={() => {}} />

// Canonical path(avatar.spec.md DS-wide rule;抄 profile-card.stories.tsx ProfileCardHover baseline):
// 透過 <Avatar hoverCard={...}> — Avatar 內部處理 HoverCardTrigger / Content / keyboard focus /
// 浮層 chrome,不在 story 層手刻 HoverCard 三件套(避免 raw button UA chrome 污染視覺)。
function InlineHoverExample() {
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar
        src={AVATAR_URL}
        alt="Alice"
        size={32}
        hoverCard={
          <ProfileCard
            name="Alice Chen"
            avatar={{ src: AVATAR_URL, alt: 'Alice' }}
            subtitle="Product Designer｜D-0042"
            status="online"
            actions={sampleActions}
            defaultFieldValues={{ id: 'YHANAX', employeeNumber: '1234567' }}
            onViewMore={() => {}}
          />
        }
      />
      <span className="text-body">@Alice Chen</span>
      <span className="text-body text-fg-muted">留言：「這版 spacing 看起來好多了！」</span>
    </span>
  )
}

// ── 定位與分界 ───────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 ProfileCard ──────────────────────

// ── 觸發情境 ───────────────────────────────────────────────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsAvatarRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>滑過頭像或 @提及時展開人員詳情:留言者、指派者、PR 審核者、成員列表的快速預覽;卡上可放快速動作(傳訊息、通話)。</p>
        <TutorialList>
          <li><StoryLink kind="Design System/Components/ProfileCard/展示" name="懸停展開 ProfileCard">懸停留言者 / PR reviewer / 成員列表的頭像,展開人員詳情卡</StoryLink></li>
        </TutorialList>
        <TutorialRule
          title="ProfileCard — 「hover 展開詳情」的人員資訊卡"
          note="@mention、PR reviewer、留言者 avatar 等場景:使用者看到頭像想知道「這人是誰」,hover 彈出 ProfileCard。卡內有 status、動作鍵(傳訊息 / 語音通話)、結構化欄位、查看更多"
        >
          <InlineHoverExample />
          <ExampleCaption>↑ hover avatar 彈出 ProfileCard（典型 @mention 互動）</ExampleCaption>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 單純顯示名字用 ProfileCard → 過重"
          note="列表項目只顯示名字 + 頭像時,用 Avatar + Text 就好。ProfileCard 是 hover 才展開的詳情卡,不是 list item 樣式"
        >
          {/* @layout-space-magic-ok: 頭像 ↔ 姓名(反例主題不是間距)(layoutSpace.spec.md:166 micro) */}
          <div className="flex items-center gap-2">
            <Avatar src={AVATAR_URL} alt="Alice" size={24} />
            <span className="text-body">Alice Chen</span>
          </div>
          <ExampleCaption>↑ 評論列表 / 成員 row 這種場景,純 Avatar + Text 就夠</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 點擊進 profile 頁用 ProfileCard → 應該用 link"
          note="ProfileCard 是 hover 預覽,不承載 navigation。點名字進 profile 頁用 <a> 或 router Link,不要包在 HoverCard 裡"
        >
          <ExampleCaption warn>（範例省略）navigation 用 link,不要 hover 才給 profile 入口</ExampleCaption>
        </TutorialRule>
        <TutorialList>
          <li>編輯角色 / 權限這類複雜表單 → Dialog 或專用頁面:ProfileCard 只是快速預覽</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>HoverCard</strong> —— 浮層的外殼(觸發、定位、外框);ProfileCard 是放在裡面的人員內容</li>
          <li><strong>Avatar</strong> —— 身份的視覺;用它的 hoverCard 就能一鍵接上 ProfileCard</li>
          <li><strong>Tooltip</strong> —— 純文字的滑過提示,不可互動;要結構化的人員資訊才用 ProfileCard</li>
          <li><strong>AccountMenu</strong> —— 「自己」的帳號入口;ProfileCard 是看「別人」</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

export const TriggerContextRule: Story = {
  name: '觸發點:頭像懸停(不作獨立使用)',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="✅ 唯一觸發點 — avatar hover 顯示 HoverCard 內容"
        note="留言列表、@mention、PR reviewer list、Sidebar 使用者列等場景:主要內容是留言 / PR / commit,hover avatar 才浮出人員詳情,不佔版面。ProfileCard 的觸發點只有 avatar,沒有別的。"
      >
        <InlineHoverExample />
      </TutorialRule>

      <TutorialRule
        title="❌ 不要當 standalone 頁面區塊嵌入"
        note="ProfileCard 是 avatar hover 觸發的 HoverCard 內容模板,不是獨立 Card primitive——缺浮層外殼(radius / border / shadow)與定位邏輯。需要頁面內人員卡佈局時,請用 avatar hoverCard,或自組 Surface / 專屬元件。"
      >
        <div className="border border-dashed border-error rounded-lg opacity-60">
          <ProfileCard
            name="Alice Chen"
            avatar={{ src: AVATAR_URL, alt: 'Alice' }}
            subtitle="Product Designer｜D-0042"
            status="online"
            defaultFieldValues={{ id: 'YHANAX', employeeNumber: '1234567' }}
          />
        </div>
        <ExampleCaption warn>↑ 反例:直接嵌頁面缺浮層外殼 + 繞過 avatar 觸發語意</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── 寬度固定 ────────────────────────────────────────────────────────────────

export const FixedWidthRule: Story = {
  name: '寬度固定 320px',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="ProfileCard 永遠 320px，不隨內容伸縮"
        note="HoverCard 浮層寬度由 ProfileCard 決定。若寬度隨內容變化,使用者在不同人員的卡之間切換時,浮層會左右跳動,體驗破碎。固定寬度保證穩定預測。對照 Material Snackbar 固定 344px,世界級 DS 一致採「單一元件 設計準則 寬度固定」策略"
      >
        <div className="flex flex-col gap-[var(--layout-space-loose)]">
          <div className="border border-border rounded-lg">
            <ProfileCard name="Bob" avatar={{ src: AVATAR_URL, alt: 'Bob' }} subtitle="Engineering" status="online" />
          </div>
          <div className="border border-border rounded-lg">
            <ProfileCard
              name="Alice Chen"
              avatar={{ src: AVATAR_URL, alt: 'Alice' }}
              subtitle="Product Designer｜Design Systems Lead"
              status="busy"
              statusMessage="In back-to-back meetings until 4pm. Please DM for urgent matters."
              defaultFieldValues={{ id: 'YHANAX', employeeNumber: '1234567' }}
              onViewMore={() => {}}
            />
          </div>
        </div>
        <ExampleCaption>↑ 內容多寡不同,卡寬都是 320px,避免 hover 切換時浮層左右跳動</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 手動覆蓋 w-[xxx]"
        note="每張卡寬度不一樣 = 整個產品的人員預覽體驗不一致。固定寬度是 設計準則 設計決策,不建議 consumer 覆蓋"
      >
        <ExampleCaption warn>（設計規則）寬度是 ProfileCard 的元件級常數,不屬於可調參數</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── 結構選擇 ────────────────────────────────────────────────────────────

export const SectionRule: Story = {
  name: '區段各自獨立（選擇性出現）',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="每個 section 各有渲染規則"
        note="Profile header + Info fields 永遠顯示（fields 為 always-render：缺值顯「-」佔位，固定結構防漂移）;status / actions / viewMore 則各自按有無資料決定渲染。不強制全部塞滿——不同情境（basic contact / full profile）自然長出不同形狀"
      >
        <div className="flex items-center gap-[var(--layout-space-loose)] flex-wrap">
          <div className="border border-border rounded-lg">
            <ProfileCard name="Alice Chen" avatar={{ src: AVATAR_URL, alt: 'Alice' }} subtitle="Designer" />
          </div>
          <div className="border border-border rounded-lg">
            <ProfileCard
              name="Alice Chen"
              avatar={{ src: AVATAR_URL, alt: 'Alice' }}
              subtitle="Designer"
              status="online"
              actions={sampleActions}
            />
          </div>
        </div>
        <ExampleCaption>↑ 左：極簡（無 status / actions）｜右：含 status + actions</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

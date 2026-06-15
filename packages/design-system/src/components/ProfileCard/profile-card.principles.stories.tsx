// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'
import { MessageCircle, Phone, ChevronDown } from 'lucide-react'
import { ProfileCard } from './profile-card'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Internal/ProfileCard/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ───────────────────────────────────────────────────────────────────

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

const AVATAR_URL = 'https://i.pravatar.cc/128?u=alice-designsys'

const sampleActions = (
  <>
    <Button variant="tertiary" size="sm" startIcon={MessageCircle} className="flex-1">Chat</Button>
    <Button variant="tertiary" size="sm" startIcon={Phone} endIcon={ChevronDown} className="flex-1">Call</Button>
  </>
)

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
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 ProfileCard 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Internal/ProfileCard/展示" name="懸停展開 ProfileCard"><span className="text-primary hover:underline font-medium cursor-pointer">懸停留言者 / PR reviewer / 成員列表的頭像,展開人員詳情卡</span></LinkTo>
        </li>
      </ul>
      <p>判斷時對照 spec.md「何時用 / 何時不用」段落。</p>
    </div>

      {/* vs 近親 — VsAvatarRule — 原 VsAvatarRule */}
      <div>
      <Rule
        title="ProfileCard — 「hover 展開詳情」的人員資訊卡"
        note="@mention、PR reviewer、留言者 avatar 等場景:使用者看到頭像想知道「這人是誰」,hover 彈出 ProfileCard。卡內有 status、action button（Chat / Call）、結構化欄位、View more"
      >
        <InlineHoverExample />
        <Label>↑ hover avatar 彈出 ProfileCard（典型 @mention 互動）</Label>
      </Rule>

      <Rule
        title="❌ 單純顯示名字用 ProfileCard → 過重"
        note="列表項目只顯示名字 + 頭像時,用 Avatar + Text 就好。ProfileCard 是 hover 才展開的詳情卡,不是 list item 樣式"
      >
        <div className="flex items-center gap-2">
          <Avatar src={AVATAR_URL} alt="Alice" size={24} />
          <span className="text-body">Alice Chen</span>
        </div>
        <Label>↑ 評論列表 / 成員 row 這種場景,純 Avatar + Text 就夠</Label>
      </Rule>

      <Rule
        title="❌ 點擊進 profile 頁用 ProfileCard → 應該用 link"
        note="ProfileCard 是 hover 預覽,不承載 navigation。點名字進 profile 頁用 <a> 或 router Link,不要包在 HoverCard 裡"
      >
        <Label warn>（範例省略）navigation 用 link,不要 hover 才給 profile 入口</Label>
      </Rule>
    </div>
    </div>
  ),
}

export const TriggerContextRule: Story = {
  name: '觸發點:頭像懸停(不作獨立使用)',
  render: () => (
    <div>
      <Rule
        title="✅ 唯一觸發點 — avatar hover 顯示 HoverCard 內容"
        note="留言列表、@mention、PR reviewer list、Sidebar 使用者列等場景:主要內容是留言 / PR / commit,hover avatar 才浮出人員詳情,不佔版面。ProfileCard 的觸發點只有 avatar,沒有別的。"
      >
        <InlineHoverExample />
      </Rule>

      <Rule
        title="❌ 不要當 standalone 頁面區塊嵌入"
        note="ProfileCard 是 avatar hover 觸發的 HoverCard 內容模板,不是獨立 Card primitive——缺浮層外殼(radius / border / shadow)與定位邏輯。需要頁面內人員卡佈局時,請用 avatar hoverCard,或自組 Surface / 專屬元件。詳 spec.md「禁止事項」。"
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
        <Label warn>↑ 反例:直接嵌頁面缺浮層外殼 + 繞過 avatar 觸發語意</Label>
      </Rule>
    </div>
  ),
}

// ── 寬度固定 ────────────────────────────────────────────────────────────────

export const FixedWidthRule: Story = {
  name: '寬度固定 320px',
  render: () => (
    <div>
      <Rule
        title="ProfileCard 永遠 320px，不隨內容伸縮"
        note="HoverCard 浮層寬度由 ProfileCard 決定。若寬度隨內容變化,使用者在不同人員的卡之間切換時,浮層會左右跳動,體驗破碎。固定寬度保證穩定預測。對照 Material Snackbar 固定 344px,世界級 DS 一致採「單一元件 設計準則 寬度固定」策略"
      >
        <div className="flex flex-col gap-3">
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
        <Label>↑ 內容多寡不同,卡寬都是 320px,避免 hover 切換時浮層左右跳動</Label>
      </Rule>

      <Rule
        title="❌ 手動覆蓋 w-[xxx]"
        note="每張卡寬度不一樣 = 整個產品的人員預覽體驗不一致。固定寬度是 設計準則 設計決策,不建議 consumer 覆蓋"
      >
        <Label warn>（設計規則）寬度是 ProfileCard 的元件級常數,不屬於可調參數</Label>
      </Rule>
    </div>
  ),
}

// ── 結構選擇 ────────────────────────────────────────────────────────────

export const SectionRule: Story = {
  name: '區段各自獨立（選擇性出現）',
  render: () => (
    <div>
      <Rule
        title="每個 section 各有渲染規則"
        note="Profile header + Info fields 永遠顯示（fields 為 always-render：缺值顯 — 佔位，固定結構防漂移）;status / actions / viewMore 則各自按有無資料決定渲染。不強制全部塞滿——不同情境（basic contact / full profile）自然長出不同形狀"
      >
        <div className="flex items-center gap-4 flex-wrap">
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
        <Label>↑ 左：極簡（無 status / actions）｜右：含 status + actions</Label>
      </Rule>
    </div>
  ),
}

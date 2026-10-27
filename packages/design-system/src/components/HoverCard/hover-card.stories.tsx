// @story-history: HoverCard 是「行為 primitive」非視覺 variant — `isOverlay` trait
//   要求的 OpenSnapshot/defaultOpen 用 hover trigger 真實情境(MultiAvatarTooltip / Avatar
//   滑過顯人物卡 / DateContextOnHover 等)展示遠比 forced-open snapshot 更貼近 user 真實
//   體驗。Default/AllVariants N/A — HoverCard 自身無視覺(bg/border/shadow 由 consumer 決定),
//   無 variant API,Default story 等於 consumer canonical wrapper(ProfileCard / OverflowIndicator
//   各有自己的 Default 範例)。
// @story-trait-allow: missing-default missing-opensnapshot
import type { Meta, StoryObj } from '@storybook/react'
import { ExternalLink, Github, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HoverCard, HoverCardTrigger, HoverCardContent, HOVER_CARD_SURFACE_CLASS } from './hover-card'
import { Avatar, AVATAR_STACK_CLASS, AVATAR_STACK_ITEM_CLASS, avatarStackItemStyle } from '@/design-system/components/Avatar/avatar'
import { Button } from '@/design-system/components/Button/button'
import { OverflowIndicator } from '@/design-system/components/OverflowIndicator/overflow-indicator'
import { Toaster, toast } from '@/design-system/components/Toast/toast'
import { ItemContent } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { SAMPLE_PEOPLE, samplePersonCard } from '@/design-system/stories-helpers/scene/person-card'
import { demoNavigate } from '@/design-system/stories-helpers/scene/demo-actions'

const meta: Meta = {
  title: 'Design System/Internal/HoverCard/展示',
  tags: ['!dev'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'HoverCard 是 hover 觸發的可互動浮層 primitive(基於 Radix HoverCard)。與 Tooltip 的差異:內容可互動(按鈕、連結、hover 子元素)。HoverCard 本身**不含視覺樣式**——bg / border / shadow / padding 由 consumer 決定。以下情境展示最常見的兩種 consumer pattern(亮色 ProfileCard / 深色 tooltip)以及自訂情境。',
      },
    },
  },
}
export default meta
type Story = StoryObj

/* ═══════════════════════════════════════════════════════════════════════════
   Story 1:人員頭像 + ProfileCard(亮色樣式,最常見)
   ═══════════════════════════════════════════════════════════════════════════ */

export const PersonProfileCard: Story = {
  name: '人員頭像 ProfileCard',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-xl">
      <p className="text-caption text-fg-muted">
        GitHub PR reviewer hover 看人員卡 — 可點「傳訊息」或「查看個人頁」。
      </p>
      {/* @layout-space-magic-ok: 行內「Reviewer:」標籤 ↔ 頭像值 12px 是範例原值(與已發布版同值,F-S8),規格沒寫(放行章 (d)) */}
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted">Reviewer:</span>
        {/* 人員頭像一律走 Avatar 的 hoverCard(avatar.spec.md「Avatar HoverCard 原則」;外殼 / 可聚焦 / 主題由 Avatar 內建)。
            名片走全 DS 同一支建構器與同一份人員名錄(stories-helpers/scene/person-card.tsx;稽核 M041 / 登記簿 B22「所有地方的namecard預設都是秀一樣的資訊的」)——
            2026-10-28 前這裡自己組一張、多一欄「時區」、三顆動作接空函式 */}
        <Avatar
          src={SAMPLE_PEOPLE.ada.avatarSrc}
          alt={SAMPLE_PEOPLE.ada.name}
          color="indigo"
          size={28}
          hoverCard={samplePersonCard(SAMPLE_PEOPLE.ada)}
        />
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 2:連結預覽(亮色樣式 + 自訂內容)
   ═══════════════════════════════════════════════════════════════════════════ */

export const LinkPreview: Story = {
  name: '連結預覽卡',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-xl">
      <p className="text-caption text-fg-muted">
        Notion / Linear 風格的連結預覽 — hover 看目標頁面標題、摘要、元資料,不 hover 不干擾閱讀。
      </p>
      <p className="text-body">
        本次 sprint 的重點是
        <HoverCard>
          <HoverCardTrigger asChild>
            {/* 連結照連結規範:藍字、滑過換色、不加底線(color.spec.md「連結 hover = 換色(text-primary-hover),不用底線」;PE6);
                點下去 = 前往文件(範例裡記到 Actions 面板,demoNavigate) */}
            <a
              href="#q2-okr-roadmap"
              onClick={demoNavigate('Q2 OKR roadmap')}
              // @layout-space-magic-ok: 句子裡的行內連結左右 4px 是範例原值(與已發布版同值,F-S8),規格沒寫(放行章 (d))
              className="text-primary hover:text-primary-hover mx-1"
            >
              Q2 OKR roadmap
            </a>
          </HoverCardTrigger>
          <HoverCardContent
            className={cn(HOVER_CARD_SURFACE_CLASS, 'p-[var(--layout-space-loose)]')}
            style={{ width: 320 }}
          >
            {/* 預覽卡三段(來源 / 標題 + 摘要 / meta)之間 = tight(layoutSpace 規則 3:來源與 meta 都在說明同一則標題);
                標題 ↔ 摘要是同一個文字塊 = --item-gap-label-desc-scanning(item-anatomy.spec.md「Label ↔ Desc 間距」;body 14 + caption 12 = scanning) */}
            <div className="flex flex-col gap-[var(--layout-space-tight)]">
              {/* @layout-space-magic-ok: 圖示 ↔ 來源文字 8px 是範例原值(與已發布版同值,F-S8),規格沒寫(放行章 (d)) */}
              <div className="flex items-center gap-2 text-footnote text-fg-muted">
                <ExternalLink size={12} />
                <span>notion.so / platform-team</span>
              </div>
              <div className="flex flex-col gap-[var(--item-gap-label-desc-scanning)]">
                <h3 className="text-h6 font-medium text-foreground">Q2 OKR roadmap</h3>
                <p className="text-caption text-fg-secondary">
                  本季三個 objective:多工作區、SSO、audit log。每項由各 squad 認領,預計 6 月底前完成。
                </p>
              </div>
              {/* @layout-space-magic-ok: meta 行內兩段(更新時間 · 閱讀時間)12px 是範例原值(與已發布版同值,F-S8),規格沒寫(放行章 (d)) */}
              <div className="flex items-center gap-3 text-footnote text-fg-muted">
                <span className="inline-flex items-center gap-1">
                  <Calendar size={12} /> 更新於 2 天前
                </span>
                <span>· 閱讀約 5 分鐘</span>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
        ,負責人是 Platform team。
      </p>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 3:溢出清單(深色 tooltip 樣式)
   ═══════════════════════════════════════════════════════════════════════════ */

export const OverflowList: Story = {
  name: '溢出清單',
  render: () => {
    const people = [
      { name: 'Ada Chen', account: 'ADACHEN', employeeNumber: '1048217', role: 'Design Engineer', color: 'indigo' as const, avatarUrl: 'https://i.pravatar.cc/48?u=ada-chen' },
      { name: '張美真', account: 'MEIZHEN', employeeNumber: '1051302', role: 'Product Manager', color: 'magenta' as const, avatarUrl: 'https://i.pravatar.cc/48?u=zhang-meizhen' },
      { name: '林伯彥', account: 'BOYAN', employeeNumber: '1062145', role: 'Backend Engineer', color: 'green' as const, avatarUrl: 'https://i.pravatar.cc/48?u=lin-boyan' },
      { name: '黃怡君', account: 'YIJUN', employeeNumber: '1070388', role: 'QA Engineer', color: 'turquoise' as const, avatarUrl: 'https://i.pravatar.cc/48?u=huang-yijun' },
      { name: '王文彬', account: 'WENBIN', employeeNumber: '1074920', role: 'Data Analyst', color: 'purple' as const, avatarUrl: 'https://i.pravatar.cc/48?u=wang-wenbin' },
      { name: '李思妤', account: 'SIYU', employeeNumber: '1081536', role: 'UX Researcher', color: 'yellow' as const, avatarUrl: 'https://i.pravatar.cc/48?u=li-siyu' },
    ]
    const visible = people.slice(0, 3)
    const hidden = people.slice(3)
    // 人員頭像一律 hover 出 ProfileCard(avatar.spec.md「Avatar HoverCard 原則」,無例外);名片走全 DS 同一支建構器(person-card.tsx),
    // 副標 = {部門}｜{ID}｜{員工編號}、三顆預設動作有反應(2026-10-28 前「傳訊息 / 語音通話」沒接線、「查看更多」接空函式)
    const personCard = (p: (typeof people)[number]) =>
      samplePersonCard({
        name: p.name,
        avatarSrc: p.avatarUrl,
        subtitle: `${p.role}｜${p.account}｜${p.employeeNumber}`,
        id: p.account,
        employeeNumber: p.employeeNumber,
        status: 'online',
        statusMessage: '本週在台北辦公室',
      })
    return (
      <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-md">
        <p className="text-caption text-fg-muted">
          深色 tooltip 樣式的正主是 OverflowIndicator —— 頭像堆疊尾端的 +N,滑過看完整清單。
        </p>
        {/* 消費元件本身(OverflowIndicator 的深色清單外殼、+N 觸發點)與 Avatar 的堆疊 SSOT
            (avatar.spec.md「頭像堆疊(疊在一起時)」),同 OverflowIndicator 展示頁「人員頭像 疊合 +N」,不手刻外殼 */}
        <div className={`flex items-center ${AVATAR_STACK_CLASS}`}>
          {visible.map((p, i) => (
            <span key={p.name} className={AVATAR_STACK_ITEM_CLASS} style={avatarStackItemStyle(i, visible.length + 1)}>
              <Avatar src={p.avatarUrl} alt={p.name} color={p.color} size={24} stacked hoverCard={personCard(p)} />
            </span>
          ))}
          <span className={AVATAR_STACK_ITEM_CLASS} style={avatarStackItemStyle(visible.length, visible.length + 1)}>
            <OverflowIndicator count={hidden.length} shape="circle" size="md">
              {/* @layout-space-magic-ok: +N 浮層內人員列之間 4px 是範例原值(與已發布版同值,F-S8),規格沒寫(放行章 (d)) */}
              <div className="flex flex-col gap-1 min-w-[160px] text-caption">
                {hidden.map((p) => (
                  // @layout-space-magic-ok: 人員列內 頭像 ↔ 姓名 8px 是範例原值(與已發布版同值,F-S8),規格沒寫(放行章 (d))
                  <div key={p.name} className="flex items-center gap-2">
                    <Avatar src={p.avatarUrl} alt={p.name} color={p.color} size={20} hoverCard={personCard(p)} />
                    <span>{p.name}</span>
                  </div>
                ))}
              </div>
            </OverflowIndicator>
          </span>
        </div>
      </div>
    )
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 4:倉庫卡(亮色 + 多 action)
   ═══════════════════════════════════════════════════════════════════════════ */

// 儲存庫資訊卡:卡內只留在原地做得完的動作 —— 「複製 clone 網址」跳 Toast(複製類 neutral);「Open in IDE」在範例裡沒有去處,拿掉
// (稽核 L050:2026-10-28 前兩顆都是 xs、點了沒反應;按鈕回到預設尺寸,登記簿 A27「沒有特殊具體理由都應該先用預設尺寸」)
export const RepoCard: Story = {
  name: '儲存庫資訊卡',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-xl">
      <Toaster />
      <p className="text-caption text-fg-muted">
        GitHub-like repo hover card — hover 倉庫連結看 star 數、分支資訊、快速動作。
      </p>
      <p className="text-body">
        CI 剛剛在
        <HoverCard>
          <HoverCardTrigger asChild>
            <a
              href="#platform-monitoring"
              onClick={demoNavigate('platform/monitoring 儲存庫')}
              // @layout-space-magic-ok: 句子裡的行內連結左右 4px 是範例原值(與已發布版同值,F-S8),規格沒寫(放行章 (d))
              className="text-primary hover:text-primary-hover mx-1 font-mono"
            >
              platform/monitoring
            </a>
          </HoverCardTrigger>
          <HoverCardContent
            className={cn(HOVER_CARD_SURFACE_CLASS, 'p-[var(--layout-space-loose)]')}
            style={{ width: 320 }}
          >
            <div className="flex flex-col gap-[var(--layout-space-tight)]">
              {/* 40px 圖示方塊 > 24px 閾值 → item-anatomy「Card header 大 prefix 對齊」(同 ProfileCard 標頭):
                  文字欄 justify-center + minHeight = 圖示高;標題 ↔ 說明的 2px 由 ItemContent 擁有 */}
              {/* @layout-space-magic-ok: 卡片標頭 大 prefix ↔ 文字欄 12px = item-anatomy.spec.md:321 card header 模式的規格寫法(layoutSpace.spec.md:166 micro) */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 shrink-0 rounded-md bg-primary-subtle grid place-content-center text-primary">
                  <Github size={18} />
                </div>
                <ItemContent
                  label="platform/monitoring"
                  description="觀測指標、alert、SLO dashboard"
                  mode="scanning"
                  descriptionTone="muted"
                  descriptionWrap={false}
                  labelClassName="text-body font-medium text-foreground"
                  className="justify-center"
                  style={{ minHeight: 40 }}
                />
              </div>
              {/* @layout-space-magic-ok: meta 行內三段(語言 · stars · contributors)16px 是範例原值(與已發布版同值,F-S8),規格沒寫(放行章 (d)) */}
              <div className="flex items-center gap-4 text-footnote text-fg-muted">
                <span>TypeScript</span>
                <span>· 42 stars</span>
                <span>· 8 contributors</span>
              </div>
              <div>
                <Button variant="tertiary" onClick={() => toast({ title: '已複製 clone 網址' })}>
                  複製 clone 網址
                </Button>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
        上成功部署。
      </p>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 5:開啟 / 關閉延遲
   ═══════════════════════════════════════════════════════════════════════════ */

// 2026-10-28(稽核 M017):原本三格(頭像 / 按鈕「查看位置」/ 連結「PR #1,234」)—— 後兩格的內容沒有 DS 元件或規格依據,拿掉,只留頭像與延遲說明;
// 頭像那格走同一份名錄與建構器。延遲數值的出處:tokens/motion/motion.ts 的 MOTION_DELAY_RICH_MS / MOTION_DELAY_CLOSE_MS。
export const TriggerShowcase: Story = {
  name: '觸發延遲',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-xl">
      <p className="text-caption text-fg-muted">
        滑過頭像停 0.7 秒才開名片、滑開 0.2 秒才收;延遲已內建在 Avatar 的 hoverCard 裡,一般不需要自己設。
      </p>
      <div>
        <Avatar
          src={SAMPLE_PEOPLE.ada.avatarSrc}
          alt={SAMPLE_PEOPLE.ada.name}
          color="indigo"
          size={32}
          hoverCard={samplePersonCard(SAMPLE_PEOPLE.ada)}
        />
      </div>
      <div className="text-footnote text-fg-muted">
        開啟延遲避免滑鼠路過就觸發載入;關閉延遲讓不小心滑出去的人來得及回來。特殊情況才用 HoverCard 的 openDelay / closeDelay 覆寫。
      </div>
    </div>
  ),
}

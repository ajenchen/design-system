// @story-history: HoverCard 是「行為 primitive」非視覺 variant — `isOverlay` trait
//   要求的 OpenSnapshot/defaultOpen 用 hover trigger 真實情境(MultiAvatarTooltip / Avatar
//   滑過顯人物卡 / DateContextOnHover 等)展示遠比 forced-open snapshot 更貼近 user 真實
//   體驗。Default/AllVariants N/A — HoverCard 自身無視覺(bg/border/shadow 由 consumer 決定),
//   無 variant API,Default story 等於 consumer canonical wrapper(ProfileCard / OverflowIndicator
//   各有自己的 Default 範例)。
// @story-trait-allow: missing-default missing-opensnapshot
import type { Meta, StoryObj } from '@storybook/react'
import { ExternalLink, Github, Calendar, MapPin } from 'lucide-react'
import { HoverCard, HoverCardTrigger, HoverCardContent } from './hover-card'
import { Avatar, AVATAR_STACK_CLASS, AVATAR_STACK_ITEM_CLASS, avatarStackItemStyle } from '@/design-system/components/Avatar/avatar'
import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup } from '@/design-system/components/Button/button-group'
import { ProfileCard, ProfileCardDefaultActions } from '@/design-system/components/ProfileCard/profile-card'
import { OverflowIndicator } from '@/design-system/components/OverflowIndicator/overflow-indicator'
import { MOTION_DELAY_RICH_MS, MOTION_DELAY_CLOSE_MS } from '@/design-system/tokens/motion/motion'
import { ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { ItemContent } from '@/design-system/patterns/element-anatomy/item-anatomy'

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
      {/* @layout-space-magic-ok: 行內「Reviewer:」標籤 ↔ 頭像值(同一組 label / value)(layoutSpace.spec.md:166 micro) */}
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted">Reviewer:</span>
        <HoverCard>
          <HoverCardTrigger asChild>
            <button type="button" aria-label="Ada Chen 個人資訊" className="cursor-default rounded-full">
              <Avatar src="https://i.pravatar.cc/56?u=ada-chen" alt="Ada Chen" color="indigo" size={28} />
            </button>
          </HoverCardTrigger>
          {/* 外殼照 Avatar hoverCard 內建那一層(avatar.tsx「HoverCardContent canonical」):不設內距、不設寬度 ——
              寬度由 ProfileCard 自己決定(profile-card.spec.md「寬度(元件級常數)」);原本外殼寫死 280 會把 320 寬的卡片右側裁掉 41px */}
          <HoverCardContent
            className="bg-surface-raised border border-border rounded-lg"
            style={{ boxShadow: 'var(--elevation-200)' }}
          >
            <ProfileCard
              name="Ada Chen"
              avatar={{ src: 'https://i.pravatar.cc/80?u=ada-chen', alt: 'Ada Chen', color: 'indigo' }}
              subtitle="Design Engineer · Frontend"
              status="online"
              statusMessage="正在處理 login 頁重構"
              defaultFieldValues={{ id: 'ADACHEN', employeeNumber: 'E-4821' }}
              fields={[{ label: 'Timezone', value: 'UTC+8 台北' }]}
              onViewMore={() => {}}
            />
          </HoverCardContent>
        </HoverCard>
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
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              // @layout-space-magic-ok: 句子裡的行內連結左右 4px(行內文字 micro)(layoutSpace.spec.md:166 micro)
              className="text-primary underline underline-offset-2 mx-1 cursor-pointer"
            >
              Q2 OKR roadmap
            </a>
          </HoverCardTrigger>
          <HoverCardContent
            className="bg-surface-raised border border-border rounded-lg p-[var(--layout-space-loose)]"
            style={{ boxShadow: 'var(--elevation-200)', width: 320 }}
          >
            {/* 預覽卡三段(來源 / 標題 + 摘要 / meta)之間 = tight(layoutSpace 規則 3:來源與 meta 都在說明同一則標題);
                標題 ↔ 摘要是同一個文字塊 = --item-gap-label-desc-scanning(item-anatomy.spec.md「Label ↔ Desc 間距」;body 14 + caption 12 = scanning) */}
            <div className="flex flex-col gap-[var(--layout-space-tight)]">
              {/* @layout-space-magic-ok: 圖示 ↔ 來源文字(layoutSpace.spec.md:166 micro) */}
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
              {/* @layout-space-magic-ok: meta 行內兩段(更新時間 · 閱讀時間)(layoutSpace.spec.md:166 micro) */}
              <div className="flex items-center gap-3 text-footnote text-fg-muted">
                <span className="inline-flex items-center gap-1">
                  <Calendar size={12} /> 更新於 2 天前
                </span>
                <span>· 5 min read</span>
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
    // 人員頭像一律 hover 出 ProfileCard(avatar.spec.md「Avatar HoverCard 原則」,無例外)
    const personCard = (p: (typeof people)[number]) => (
      <ProfileCard
        name={p.name}
        subtitle={p.role}
        avatar={{ src: p.avatarUrl, alt: p.name, color: p.color }}
        status="online"
        statusMessage="本週在台北辦公室"
        actions={<ProfileCardDefaultActions />}
        defaultFieldValues={{ id: p.account, employeeNumber: p.employeeNumber }}
        onViewMore={() => {}}
      />
    )
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
              {/* @layout-space-magic-ok: +N 浮層內的同質人員列(layoutSpace.spec.md:165 同質清單列) */}
              <div className="flex flex-col gap-1 min-w-[160px] text-caption">
                {hidden.map((p) => (
                  // @layout-space-magic-ok: 人員列內 頭像 ↔ 姓名(layoutSpace.spec.md:166 micro)
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

export const RepoCard: Story = {
  name: '儲存庫資訊卡',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-xl">
      <p className="text-caption text-fg-muted">
        GitHub-like repo hover card — hover 倉庫連結看 star 數、分支資訊、快速動作。
      </p>
      <p className="text-body">
        CI 剛剛在
        <HoverCard>
          <HoverCardTrigger asChild>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              // @layout-space-magic-ok: 句子裡的行內連結左右 4px(行內文字 micro)(layoutSpace.spec.md:166 micro)
              className="text-primary underline underline-offset-2 mx-1 font-mono cursor-pointer"
            >
              platform/monitoring
            </a>
          </HoverCardTrigger>
          <HoverCardContent
            className="bg-surface-raised border border-border rounded-lg p-[var(--layout-space-loose)]"
            style={{ boxShadow: 'var(--elevation-200)', width: 320 }}
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
              {/* @layout-space-magic-ok: meta 行內三段(語言 · stars · contributors)(layoutSpace.spec.md:166 micro) */}
              <div className="flex items-center gap-4 text-footnote text-fg-muted">
                <span>TypeScript</span>
                <span>· 42 stars</span>
                <span>· 8 contributors</span>
              </div>
              <ButtonGroup>
                <Button variant="tertiary" size="xs">
                  Clone
                </Button>
                <Button variant="tertiary" size="xs">
                  Open in IDE
                </Button>
              </ButtonGroup>
            </div>
          </HoverCardContent>
        </HoverCard>
        上成功部署。
      </p>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 5:多 trigger 展示 + delay 對照
   ═══════════════════════════════════════════════════════════════════════════ */

export const TriggerShowcase: Story = {
  name: '觸發點類型與延遲',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-xl">
      <p className="text-caption text-fg-muted">
        HoverCard 接受任何 trigger(透過 asChild)——Avatar / Button / text link / icon 皆可。openDelay /
        closeDelay 控制 hover 節奏。
      </p>

      <div className="flex items-center gap-[var(--layout-space-loose)] flex-wrap">
        <ExampleGroup align="start">
          <span className="text-footnote text-fg-muted font-mono">trigger: Avatar</span>
          <HoverCard openDelay={MOTION_DELAY_RICH_MS} closeDelay={MOTION_DELAY_CLOSE_MS}>
            <HoverCardTrigger asChild>
              <button type="button" aria-label="Ada Chen 個人資訊" className="cursor-default rounded-full">
                <Avatar src="https://i.pravatar.cc/64?u=ada-chen" alt="Ada Chen" color="indigo" size={32} />
              </button>
            </HoverCardTrigger>
            <HoverCardContent className="bg-surface-raised border border-border rounded-lg p-[var(--layout-space-loose)]">
              <div className="text-caption">Ada Chen · Design Engineer</div>
            </HoverCardContent>
          </HoverCard>
        </ExampleGroup>

        <ExampleGroup align="start">
          <span className="text-footnote text-fg-muted font-mono">trigger: Button</span>
          <HoverCard openDelay={MOTION_DELAY_RICH_MS} closeDelay={MOTION_DELAY_CLOSE_MS}>
            <HoverCardTrigger asChild>
              <Button variant="tertiary" size="sm">
                查看位置
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="bg-surface-raised border border-border rounded-lg p-[var(--layout-space-loose)]">
              {/* @layout-space-magic-ok: 位置提示卡內 圖示 ↔ 地址文字(行內 micro)(layoutSpace.spec.md:166 micro) */}
              <div className="flex items-center gap-2 text-caption">
                <MapPin size={14} className="text-fg-muted" />
                <span>台北市信義區松仁路 100 號</span>
              </div>
            </HoverCardContent>
          </HoverCard>
        </ExampleGroup>

        <ExampleGroup align="start">
          <span className="text-footnote text-fg-muted font-mono">trigger: text link</span>
          <HoverCard openDelay={MOTION_DELAY_RICH_MS} closeDelay={MOTION_DELAY_CLOSE_MS}>
            <HoverCardTrigger asChild>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="text-primary underline underline-offset-2 cursor-pointer text-caption"
              >
                PR #1,234
              </a>
            </HoverCardTrigger>
            <HoverCardContent className="bg-surface-raised border border-border rounded-lg p-[var(--layout-space-loose)]">
              <div className="text-caption">feat: 支援多工作區切換</div>
            </HoverCardContent>
          </HoverCard>
        </ExampleGroup>
      </div>

      <div className="text-footnote text-fg-muted">
        預設 delay 已內建(<code /* @layout-space-magic-ok: 句子裡的行內 code 左右 4px(行內文字 micro)(layoutSpace.spec.md:166 micro) */ className="font-mono mx-1">MOTION_DELAY_RICH_MS / MOTION_DELAY_CLOSE_MS</code> SSOT),特殊 tier 才需 override
        (motion.spec.md,當前 700ms / 200ms)——避免 hover 過路誤觸發 fetch waterfall;close 延遲讓 user 誤滑出可回來。
      </div>
    </div>
  ),
}

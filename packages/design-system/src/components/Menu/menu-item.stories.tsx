import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Mail, Star, Bell, Settings, Plus, Folder, FileText, BarChart3, Bug, Rocket } from 'lucide-react'
import { MenuItem, MenuGroup, MenuFooter } from './menu-item'
import { CAT_SOLID, type CategoricalHue } from '@/design-system/tokens/categorical-color'
import { ProfileCard, ProfileCardDefaultActions } from '@/design-system/components/ProfileCard/profile-card'

// DS-wide canonical:person avatar 必 hover → ProfileCard(含 status / statusMessage / fields
// / actions / onViewMore,profile-card.spec.md 重要資訊)。demo helper:
// 真實人像(2026-07-08 sweep):固定 u= key 保 determinism(對齊 avatar.stories.tsx pravatar 慣例)
const avatarSrc = (name: string, px = 96) => `https://i.pravatar.cc/${px}?u=${name.toLowerCase().replace(/\s+/g, '-')}`
const personHover = (name: string, subtitle?: string) => (
  <ProfileCard
    name={name}
    subtitle={subtitle ?? 'Design｜D-0042｜EMP-1001'}
    avatar={{ src: avatarSrc(name), alt: name }}
    status="online"
    statusMessage="Out of Office: Back on Monday!"
    actions={<ProfileCardDefaultActions />}
    fields={[
      { label: 'ID', value: 'YHANAX' },
      { label: 'Employee number', value: '1234567' },
    ]}
    onViewMore={() => {}}
  />
)

const meta: Meta<typeof MenuItem> = {
  title: 'Design System/Internal/Menu/展示',
  component: MenuItem,
  tags: ['!dev'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof MenuItem>

/** Menu 容器 — 模擬浮層外觀。demo 用 role='listbox' 滿足 MenuItem role='option' 的 parent 要求(axe aria-required-parent)。 */
const MenuContainer = ({ children, width = 320 }: { children: React.ReactNode; width?: number }) => (
  <div role="listbox" aria-label="Menu demo items" className="rounded-lg bg-surface-raised border border-border overflow-hidden"
    style={{ boxShadow: 'var(--elevation-200)', width }}>
    {children}
  </div>
)

// ── 基本 ──

export const Default: Story = {
  name: '基本',
  render: () => (
    <MenuContainer><MenuGroup>
      <MenuItem>收件匣</MenuItem>
      <MenuItem>草稿</MenuItem>
      <MenuItem>已傳送</MenuItem>
    </MenuGroup></MenuContainer>
  ),
}

// @story-trait-rationale: WithStartIcon retired 2026-05-17 per audit Dim 24/25 strict re-run —
//   違 story-rules.md L42 explicit ban「❌ WithStartIcon+WithEndIcon → ✓ WithIcon grid」。
//   anatomy.stories.tsx Overview/Inspector/ColorMatrix/SizeMatrix(L218/276/395/572)已 cover startIcon。
//   WithDescription(下)教 icon+description block layout 是 distinct teaching,保留。

// ── startIcon + description ──

export const WithDescription: Story = {
  name: '前置圖示 + 說明文字',
  render: () => (
    <MenuContainer><MenuGroup>
      <MenuItem startIcon={Mail} description="每日摘要信件">電子郵件通知</MenuItem>
      <MenuItem startIcon={Bell} description="即時推播到裝置">推播通知</MenuItem>
      <MenuItem startIcon={Settings} description="自訂通知偏好">進階設定</MenuItem>
    </MenuGroup></MenuContainer>
  ),
}

// ── Avatar（無 description → inline 20/24px）──

export const AvatarInline: Story = {
  name: '頭像',
  render: () => (
    <MenuContainer><MenuGroup>
      <MenuItem avatar={{ src: avatarSrc('Alice Chen', 48), alt: "Alice Chen", color: "indigo", hoverCard: personHover('Alice Chen') }}>Alice Chen</MenuItem>
      <MenuItem avatar={{ src: avatarSrc('Bob Wang', 48), alt: "Bob Wang", color: "magenta", hoverCard: personHover('Bob Wang') }}>Bob Wang</MenuItem>
      <MenuItem avatar={{ src: avatarSrc('Carol Lin', 48), alt: "Carol Lin", color: "green", hoverCard: personHover('Carol Lin') }}>Carol Lin</MenuItem>
    </MenuGroup></MenuContainer>
  ),
}

// ── Avatar + description（block 32/40px) ──

export const AvatarBlock: Story = {
  name: '頭像 + 說明文字',
  render: () => (
    <MenuContainer><MenuGroup>
      <MenuItem avatar={{ src: avatarSrc('Alice Chen', 64), alt: "Alice Chen", color: "indigo", hoverCard: personHover('Alice Chen', '設計部門') }} description="設計部門">Alice Chen</MenuItem>
      <MenuItem avatar={{ src: avatarSrc('Bob Wang', 64), alt: "Bob Wang", color: "magenta", hoverCard: personHover('Bob Wang', '工程部門') }} description="工程部門">Bob Wang</MenuItem>
      <MenuItem avatar={{ src: avatarSrc('Carol Lin', 64), alt: "Carol Lin", color: "green", hoverCard: personHover('Carol Lin', '行銷部門') }} description="行銷部門">Carol Lin</MenuItem>
    </MenuGroup></MenuContainer>
  ),
}

// ── startContent(自訂 leading 徽章;佔位排列 = startIcon 同容器,見 menu-item.spec.md「結構」)──

/** 類型徽章 demo helper — 消費 CAT_SOLID token pair(彩底 + 深/白字由 token 決定);size-4 = ICON_SIZE sm/md */
const TypeBadge = ({ hue, glyph: Glyph }: { hue: CategoricalHue; glyph: typeof FileText }) => (
  <span aria-hidden className={`inline-flex size-4 shrink-0 items-center justify-center rounded-md ${CAT_SOLID[hue]}`}>
    <Glyph className="size-3" strokeWidth={2.5} />
  </span>
)

export const WithStartContent: Story = {
  name: '自訂前綴內容',
  render: () => (
    // 工作項類型設定的左側導覽(Jira / Meegle type settings):類型徽章 = 彩底 + glyph,
    // LucideIcon 表達不了 → startContent;selected = 目前編輯中的類型
    <MenuContainer width={224}>
      <MenuGroup>
        <MenuItem size="sm" startContent={<TypeBadge hue="indigo" glyph={FileText} />} selected>Task</MenuItem>
        <MenuItem size="sm" startContent={<TypeBadge hue="red" glyph={Bug} />}>Bug</MenuItem>
        <MenuItem size="sm" startContent={<TypeBadge hue="turquoise" glyph={Rocket} />}>Release</MenuItem>
        <MenuItem size="sm" startContent={<TypeBadge hue="purple" glyph={FileText} />} disabled>Epic（已停用）</MenuItem>
      </MenuGroup>
    </MenuContainer>
  ),
}

// ── 狀態 ──

export const States: Story = {
  name: '狀態',
  render: () => (
    <MenuContainer><MenuGroup>
      <MenuItem startIcon={Mail}>收件匣</MenuItem>
      <MenuItem startIcon={Mail} selected>已星標（單選）</MenuItem>
      <MenuItem startIcon={Mail} disabled>已封存</MenuItem>
    </MenuGroup></MenuContainer>
  ),
}

// ── 多選（checkbox）──

const MultiSelectDemo = () => {
  const [selected, setSelected] = useState<Record<string, boolean>>({
    email: true, push: true, slack: false,
  })
  const toggle = (key: string) => setSelected((s) => ({ ...s, [key]: !s[key] }))
  const allKeys = ['email', 'push', 'slack']
  const checkedCount = allKeys.filter((k) => selected[k]).length
  const allState = checkedCount === 0 ? false : checkedCount === allKeys.length ? true : ('indeterminate' as const)
  const toggleAll = () => {
    const next = allState !== true
    setSelected(Object.fromEntries(allKeys.map((k) => [k, next])))
  }

  return (
    <>
      <MenuGroup>
        <MenuItem checkbox checked={selected.email} startIcon={Mail} onClick={() => toggle('email')}>電子郵件</MenuItem>
        <MenuItem checkbox checked={selected.push} startIcon={Bell} onClick={() => toggle('push')}>推播通知</MenuItem>
        <MenuItem checkbox checked={selected.slack} startIcon={Settings} onClick={() => toggle('slack')}>Slack</MenuItem>
        <MenuItem checkbox checked={false} disabled startIcon={Star}>SMS（已停用）</MenuItem>
      </MenuGroup>
      <MenuFooter>
        <MenuItem checkbox checked={allState} onClick={toggleAll}>全部</MenuItem>
      </MenuFooter>
    </>
  )
}

export const MultiSelect: Story = {
  name: '多選',
  render: () => <MenuContainer><MultiSelectDemo /></MenuContainer>,
}

// ── Group header ──

export const Groups: Story = {
  name: '群組',
  render: () => (
    <MenuContainer>
      <MenuGroup>
        <MenuItem header>最近使用</MenuItem>
        <MenuItem startIcon={FileText}>Q3 產品路線圖.md</MenuItem>
        <MenuItem startIcon={FileText}>客戶反饋整理</MenuItem>
      </MenuGroup>
      <MenuGroup>
        <MenuItem header>所有專案</MenuItem>
        <MenuItem startIcon={Folder}>設計系統升級 v2</MenuItem>
        <MenuItem startIcon={Folder}>行銷活動 2026</MenuItem>
        <MenuItem startIcon={BarChart3}>業務儀表板</MenuItem>
      </MenuGroup>
    </MenuContainer>
  ),
}

// ── Creatable ──

export const Creatable: Story = {
  name: '可建立新項',
  render: () => (
    <MenuContainer><MenuGroup>
      <MenuItem startIcon={Plus}>直接使用「新標籤」</MenuItem>
    </MenuGroup></MenuContainer>
  ),
}

// @story-trait-rationale: AllSizes retired per F migration 2026-05-15 — anatomy.stories.tsx SizeMatrix auto-compile owns size showcase。
// ── 完整範例 ──

const FullExampleDemo = () => {
  const [selected, setSelected] = useState<Record<string, boolean>>({
    alice: true, bob: false,
  })
  const toggle = (key: string) => setSelected((s) => ({ ...s, [key]: !s[key] }))
  const keys = ['alice', 'bob']
  const checkedCount = keys.filter((k) => selected[k]).length
  const allState = checkedCount === 0 ? false : checkedCount === keys.length ? true : ('indeterminate' as const)
  const toggleAll = () => {
    const next = allState !== true
    setSelected(Object.fromEntries(keys.map((k) => [k, next])))
  }

  return (
    <MenuContainer>
      <MenuGroup>
        <MenuItem header>成員</MenuItem>
        <MenuItem checkbox checked={selected.alice} onClick={() => toggle('alice')} avatar={{ src: avatarSrc('Alice Chen', 64), alt: "Alice", color: "indigo" }} description="設計部門">Alice Chen</MenuItem>
        <MenuItem checkbox checked={selected.bob} onClick={() => toggle('bob')} avatar={{ src: avatarSrc('Bob Wang', 64), alt: "Bob", color: "magenta" }} description="工程部門">Bob Wang</MenuItem>
        <MenuItem checkbox checked={false} avatar={{ src: avatarSrc('Carol Lin', 64), alt: "Carol", color: "green" }} description="行銷部門" disabled>Carol Lin（已離職）</MenuItem>
      </MenuGroup>
      <MenuFooter>
        <MenuItem checkbox checked={allState} onClick={toggleAll}>全部</MenuItem>
      </MenuFooter>
    </MenuContainer>
  )
}

export const FullExample: Story = {
  name: '完整範例',
  render: () => <FullExampleDemo />,
}

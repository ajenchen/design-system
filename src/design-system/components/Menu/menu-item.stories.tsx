import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Mail, Star, Bell, Settings, Plus, Folder, FileText, BarChart3 } from 'lucide-react'
import { MenuItem, MenuGroup, MenuFooter } from './menu-item'
import { NameCard, NameCardDefaultActions } from '@/design-system/components/NameCard/name-card'

// DS-wide canonical:person avatar 必 hover → NameCard(含 onViewMore)。
// 見 `avatar.spec.md`「Avatar HoverCard 原則」。demo helper:
const personHover = (name: string, subtitle?: string) => (
  <NameCard name={name} subtitle={subtitle} actions={<NameCardDefaultActions />} onViewMore={() => {}} />
)

const meta: Meta<typeof MenuItem> = {
  title: 'Design System/Internal/Menu/展示',
  component: MenuItem,
  tags: ['!dev'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof MenuItem>

/** Menu 容器 — 模擬浮層外觀 */
const MenuContainer = ({ children, width = 320 }: { children: React.ReactNode; width?: number }) => (
  <div className="rounded-lg bg-surface-raised border border-border overflow-hidden"
    style={{ boxShadow: 'var(--elevation-200)', width }}>
    {children}
  </div>
)

// ── 基本 ──

export const Basic: Story = {
  name: '基本',
  render: () => (
    <MenuContainer><MenuGroup>
      <MenuItem>收件匣</MenuItem>
      <MenuItem>草稿</MenuItem>
      <MenuItem>已傳送</MenuItem>
    </MenuGroup></MenuContainer>
  ),
}

// ── startIcon ──

export const WithStartIcon: Story = {
  name: 'startIcon',
  render: () => (
    <MenuContainer><MenuGroup>
      <MenuItem startIcon={Mail}>電子郵件</MenuItem>
      <MenuItem startIcon={Bell}>通知</MenuItem>
      <MenuItem startIcon={Settings}>設定</MenuItem>
    </MenuGroup></MenuContainer>
  ),
}

// ── startIcon + description ──

export const WithDescription: Story = {
  name: 'startIcon + description',
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
  name: 'Avatar（inline)',
  render: () => (
    <MenuContainer><MenuGroup>
      <MenuItem avatar={{ alt: "Alice Chen", color: "indigo", hoverCard: personHover('Alice Chen') }}>Alice Chen</MenuItem>
      <MenuItem avatar={{ alt: "Bob Wang", color: "magenta", hoverCard: personHover('Bob Wang') }}>Bob Wang</MenuItem>
      <MenuItem avatar={{ alt: "Carol Lin", color: "green", hoverCard: personHover('Carol Lin') }}>Carol Lin</MenuItem>
    </MenuGroup></MenuContainer>
  ),
}

// ── Avatar + description（block 32/40px) ──

export const AvatarBlock: Story = {
  name: 'Avatar + description(block)',
  render: () => (
    <MenuContainer><MenuGroup>
      <MenuItem avatar={{ alt: "Alice Chen", color: "indigo", hoverCard: personHover('Alice Chen', '設計部門') }} description="設計部門">Alice Chen</MenuItem>
      <MenuItem avatar={{ alt: "Bob Wang", color: "magenta", hoverCard: personHover('Bob Wang', '工程部門') }} description="工程部門">Bob Wang</MenuItem>
      <MenuItem avatar={{ alt: "Carol Lin", color: "green", hoverCard: personHover('Carol Lin', '行銷部門') }} description="行銷部門">Carol Lin</MenuItem>
    </MenuGroup></MenuContainer>
  ),
}

// ── 狀態 ──

export const States: Story = {
  name: '狀態',
  render: () => (
    <MenuContainer><MenuGroup>
      <MenuItem startIcon={Mail}>Default</MenuItem>
      <MenuItem startIcon={Mail} selected>Selected（單選）</MenuItem>
      <MenuItem startIcon={Mail} disabled>Disabled</MenuItem>
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
  name: '多選（checkbox）',
  render: () => <MenuContainer><MultiSelectDemo /></MenuContainer>,
}

// ── Group header ──

export const Groups: Story = {
  name: '群組',
  render: () => (
    <MenuContainer>
      <MenuGroup>
        <MenuItem header>最近使用</MenuItem>
        <MenuItem startIcon={FileText}>文件 A</MenuItem>
        <MenuItem startIcon={FileText}>文件 B</MenuItem>
      </MenuGroup>
      <MenuGroup>
        <MenuItem header>所有專案</MenuItem>
        <MenuItem startIcon={Folder}>專案一</MenuItem>
        <MenuItem startIcon={Folder}>專案二</MenuItem>
        <MenuItem startIcon={BarChart3}>儀表板</MenuItem>
      </MenuGroup>
    </MenuContainer>
  ),
}

// ── Creatable ──

export const Creatable: Story = {
  name: 'Creatable（搜尋無結果）',
  render: () => (
    <MenuContainer><MenuGroup>
      <MenuItem startIcon={Plus}>直接使用「新標籤」</MenuItem>
    </MenuGroup></MenuContainer>
  ),
}

// ── 尺寸比較 ──

export const Sizes: Story = {
  name: '尺寸比較',
  render: () => (
    <div className="flex flex-col gap-6">
      {(['sm', 'md', 'lg'] as const).map((sz) => (
        <div key={sz} className="flex flex-col gap-1">
          <span className="text-caption text-fg-muted font-mono">{sz}{sz === 'md' ? '（預設）' : ''}</span>
          <MenuContainer width={360}>
            <MenuGroup>
              <MenuItem size={sz} startIcon={Mail} description="每日寄送摘要信件">電子郵件通知</MenuItem>
              <MenuItem size={sz} avatar={{ alt: "Alice", color: "indigo" }}>Alice Chen</MenuItem>
              <MenuItem size={sz} avatar={{ alt: "Bob", color: "magenta" }} description="工程部門">Bob Wang</MenuItem>
            </MenuGroup>
          </MenuContainer>
        </div>
      ))}
    </div>
  ),
}

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
        <MenuItem checkbox checked={selected.alice} onClick={() => toggle('alice')} avatar={{ alt: "Alice", color: "indigo" }} description="設計部門">Alice Chen</MenuItem>
        <MenuItem checkbox checked={selected.bob} onClick={() => toggle('bob')} avatar={{ alt: "Bob", color: "magenta" }} description="工程部門">Bob Wang</MenuItem>
        <MenuItem checkbox checked={false} avatar={{ alt: "Carol", color: "green" }} description="行銷部門" disabled>Carol Lin（已離職）</MenuItem>
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

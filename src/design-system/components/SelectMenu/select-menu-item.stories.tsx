import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Mail, Check, Circle, Star, Bell, User, Settings, Plus, Folder, FileText, BarChart3 } from 'lucide-react'
import { SelectMenuItem, SelectMenuGroup, SelectMenuFooter } from './select-menu-item'

const meta: Meta<typeof SelectMenuItem> = {
  title: 'Design System/Components/SelectMenu/MenuItem 展示',
  component: SelectMenuItem,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-[320px] rounded-lg bg-surface-raised border border-border overflow-hidden"
        style={{ boxShadow: 'var(--elevation-200)' }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof SelectMenuItem>

// ── 基本 ──

export const Basic: Story = {
  name: '基本',
  render: () => (
    <SelectMenuGroup>
      <SelectMenuItem>選項一</SelectMenuItem>
      <SelectMenuItem>選項二</SelectMenuItem>
      <SelectMenuItem>選項三</SelectMenuItem>
    </SelectMenuGroup>
  ),
}

// ── startIcon ──

export const WithStartIcon: Story = {
  name: 'startIcon',
  render: () => (
    <SelectMenuGroup>
      <SelectMenuItem startIcon={Mail}>電子郵件</SelectMenuItem>
      <SelectMenuItem startIcon={Bell}>通知</SelectMenuItem>
      <SelectMenuItem startIcon={Settings}>設定</SelectMenuItem>
    </SelectMenuGroup>
  ),
}

// ── startIcon + description ──

export const WithDescription: Story = {
  name: 'startIcon + description',
  render: () => (
    <SelectMenuGroup>
      <SelectMenuItem startIcon={Mail} description="每日摘要信件">電子郵件通知</SelectMenuItem>
      <SelectMenuItem startIcon={Bell} description="即時推播到裝置">推播通知</SelectMenuItem>
      <SelectMenuItem startIcon={Settings} description="自訂通知偏好">進階設定</SelectMenuItem>
    </SelectMenuGroup>
  ),
}

// ── Avatar（無 description → inline 20/24px）──

const AvatarImg = ({ bg = '#e0e7ff' }: { bg?: string }) => (
  <div className="w-full h-full rounded-full flex items-center justify-center text-[10px] font-medium" style={{ backgroundColor: bg }}>
    <User size={12} className="text-fg-muted" />
  </div>
)

export const AvatarInline: Story = {
  name: 'Avatar（inline）',
  render: () => (
    <SelectMenuGroup>
      <SelectMenuItem avatar={<AvatarImg />}>Alice Chen</SelectMenuItem>
      <SelectMenuItem avatar={<AvatarImg bg="#fce7f3" />}>Bob Wang</SelectMenuItem>
      <SelectMenuItem avatar={<AvatarImg bg="#d1fae5" />}>Carol Lin</SelectMenuItem>
    </SelectMenuGroup>
  ),
}

// ── Avatar + description（block 32/40px）──

export const AvatarBlock: Story = {
  name: 'Avatar + description（block）',
  render: () => (
    <SelectMenuGroup>
      <SelectMenuItem avatar={<AvatarImg />} description="設計部門">Alice Chen</SelectMenuItem>
      <SelectMenuItem avatar={<AvatarImg bg="#fce7f3" />} description="工程部門">Bob Wang</SelectMenuItem>
      <SelectMenuItem avatar={<AvatarImg bg="#d1fae5" />} description="行銷部門">Carol Lin</SelectMenuItem>
    </SelectMenuGroup>
  ),
}

// ── 狀態 ──

export const States: Story = {
  name: '狀態',
  render: () => (
    <SelectMenuGroup>
      <SelectMenuItem startIcon={Check}>Default</SelectMenuItem>
      <SelectMenuItem startIcon={Check} selected>Selected（單選）</SelectMenuItem>
      <SelectMenuItem startIcon={Check} disabled>Disabled</SelectMenuItem>
    </SelectMenuGroup>
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
      <SelectMenuGroup>
        <SelectMenuItem checkbox checked={selected.email} startIcon={Mail} onClick={() => toggle('email')}>電子郵件</SelectMenuItem>
        <SelectMenuItem checkbox checked={selected.push} startIcon={Bell} onClick={() => toggle('push')}>推播通知</SelectMenuItem>
        <SelectMenuItem checkbox checked={selected.slack} startIcon={Settings} onClick={() => toggle('slack')}>Slack</SelectMenuItem>
        <SelectMenuItem checkbox checked={false} disabled startIcon={Star}>SMS（已停用）</SelectMenuItem>
      </SelectMenuGroup>
      <SelectMenuFooter>
        <SelectMenuItem checkbox checked={allState} onClick={toggleAll}>全部</SelectMenuItem>
      </SelectMenuFooter>
    </>
  )
}

export const MultiSelect: Story = {
  name: '多選（checkbox）',
  render: () => <MultiSelectDemo />,
}

// ── Group header ──

export const Groups: Story = {
  name: '群組',
  render: () => (
    <>
      <SelectMenuGroup>
        <SelectMenuItem header>最近使用</SelectMenuItem>
        <SelectMenuItem startIcon={FileText}>文件 A</SelectMenuItem>
        <SelectMenuItem startIcon={FileText}>文件 B</SelectMenuItem>
      </SelectMenuGroup>
      <SelectMenuGroup>
        <SelectMenuItem header>所有專案</SelectMenuItem>
        <SelectMenuItem startIcon={Folder}>專案一</SelectMenuItem>
        <SelectMenuItem startIcon={Folder}>專案二</SelectMenuItem>
        <SelectMenuItem startIcon={BarChart3}>儀表板</SelectMenuItem>
      </SelectMenuGroup>
    </>
  ),
}

// ── Creatable ──

export const Creatable: Story = {
  name: 'Creatable（搜尋無結果）',
  render: () => (
    <SelectMenuGroup>
      <SelectMenuItem startIcon={Plus}>直接使用「新標籤」</SelectMenuItem>
    </SelectMenuGroup>
  ),
}

// ── 尺寸比較 ──

export const Sizes: Story = {
  name: '尺寸比較',
  decorators: [(Story) => <div className="flex flex-col gap-6"><Story /></div>],
  render: () => (
    <>
      {(['sm', 'md', 'lg'] as const).map((sz) => (
        <div key={sz} className="flex flex-col gap-1">
          <span className="text-caption text-fg-muted font-mono">{sz}{sz === 'md' ? '（預設）' : ''}</span>
          <div className="w-[360px] rounded-lg bg-surface-raised border border-border overflow-hidden"
            style={{ boxShadow: 'var(--elevation-200)' }}>
            <SelectMenuGroup>
              <SelectMenuItem size={sz} startIcon={Mail} description="每日寄送摘要信件">電子郵件通知</SelectMenuItem>
              <SelectMenuItem size={sz} avatar={<AvatarImg />}>Alice Chen</SelectMenuItem>
              <SelectMenuItem size={sz} avatar={<AvatarImg bg="#fce7f3" />} description="工程部門">Bob Wang</SelectMenuItem>
            </SelectMenuGroup>
          </div>
        </div>
      ))}
    </>
  ),
}

// ── 完整範例 ──

export const FullExample: Story = {
  name: '完整範例',
  render: () => (
    <>
      <SelectMenuGroup>
        <SelectMenuItem header>成員</SelectMenuItem>
        <SelectMenuItem checkbox checked={true} avatar={<AvatarImg />} description="設計部門">Alice Chen</SelectMenuItem>
        <SelectMenuItem checkbox checked={false} avatar={<AvatarImg bg="#fce7f3" />} description="工程部門">Bob Wang</SelectMenuItem>
        <SelectMenuItem checkbox checked={false} avatar={<AvatarImg bg="#d1fae5" />} description="行銷部門" disabled>Carol Lin（已離職）</SelectMenuItem>
      </SelectMenuGroup>
      <SelectMenuFooter>
        <SelectMenuItem checkbox checked="indeterminate">全部</SelectMenuItem>
      </SelectMenuFooter>
    </>
  ),
}

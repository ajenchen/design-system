// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { FileText } from 'lucide-react'
import { Chip, ChipGroup } from './chip'
import { Badge } from '@/design-system/components/Badge/badge'

const meta: Meta<typeof ChipGroup> = {
  title: 'Design System/Components/Chip/展示',
  tags: ['autodocs'],
  component: ChipGroup,
  parameters: {
    layout: 'padded',
    docs: { description: { component: '表示可切換的篩選條件或輕量選項，ChipGroup 管理單選、多選與水平溢出。使用者需要在內容上方快速套用少量篩選時使用；純分類標籤改用 Tag。' } },
  },
}
export default meta

type Story = StoryObj<typeof ChipGroup>

// ── Default ──────────────────────────────────────────────────────────────────

export const Default: Story = {
  name: '預設',
  render: () => {
    const [value, setValue] = useState<string[]>(['TypeScript'])
    return (
      <ChipGroup type="multiple" value={value} onValueChange={setValue}>
        <Chip value="JavaScript">JavaScript</Chip>
        <Chip value="TypeScript">TypeScript</Chip>
        <Chip value="Python">Python</Chip>
        <Chip value="Rust">Rust</Chip>
        <Chip value="Go">Go</Chip>
      </ChipGroup>
    )
  },
}

// ── States ───────────────────────────────────────────────────────────────────

export const States: Story = {
  name: '狀態',
  render: () => (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-caption text-fg-muted mb-2">Default / hover / selected / disabled</div>
        <ChipGroup type="multiple" defaultValue={['typescript']}>
          <Chip value="react">React</Chip>
          <Chip value="typescript">TypeScript</Chip>
          <Chip value="deprecated" disabled>Deprecated</Chip>
        </ChipGroup>
      </div>
    </div>
  ),
}

// @story-history: WithIcon retired per F migration 2026-05-15 — anatomy.stories.tsx auto-compile owns icon slot showcase。
// ── With badge ──────────────────────────────────────────────────────────────

export const WithBadge: Story = {
  name: '帶 Badge',
  render: () => {
    const [value, setValue] = useState<string[]>(['all'])
    return (
      <ChipGroup type="multiple" value={value} onValueChange={setValue}>
        <Chip value="all" badge={<Badge count={24} />}>全部</Chip>
        <Chip value="active" badge={<Badge count={3} />}>進行中</Chip>
        <Chip value="done" badge={<Badge count={21} />}>已完成</Chip>
      </ChipGroup>
    )
  },
}

// ── Single type ─────────────────────────────────────────────────────────────

export const SingleSelection: Story = {
  name: '單選',
  render: () => {
    const [value, setValue] = useState('typescript')
    return (
      <ChipGroup type="single" value={value} onValueChange={(v) => v && setValue(v as string)}>
        <Chip value="javascript">JavaScript</Chip>
        <Chip value="typescript">TypeScript</Chip>
        <Chip value="python">Python</Chip>
      </ChipGroup>
    )
  },
}

// @story-history: LayoutWrap / LayoutScroll / LayoutMenu retired 2026-05-17 per audit Dim 24 —
//   anatomy.stories.tsx LayoutMatrix(3 layout values side-by-side)+ principles.stories.tsx LayoutRule
//   已 cover layout 機制比較與業務情境。展示層保留 typical 情境(Default / States / WithBadge / SingleSelection)。
//   注意:Chip 是 filter chip,不提供 dismiss / 可移除態(spec「禁止事項」),故無 Removable story。

/** assist 分支(2026-09-02):按鈕語意、可獨立使用——智慧代理訊息內的附件開啟(真實消費場景)。 */
export const AssistAttachments: Story = {
  name: '按鈕語意附件',
  render: () => (
    <div className="max-w-xs rounded-md bg-secondary px-3 py-2">
      <div className="mb-2 flex flex-wrap gap-1">
        <Chip variant="assist" startIcon={FileText} aria-label="附件:sprint-42-backlog.csv" onClick={() => {}}>
          sprint-42-backlog.csv
        </Chip>
        <Chip variant="assist" startIcon={FileText} aria-label="附件:排程規則.md" onClick={() => {}}>
          排程規則.md
        </Chip>
      </div>
      <p className="text-body">把這份待辦按優先級重排,衝突的排程幫我標出來。</p>
    </div>
  ),
}

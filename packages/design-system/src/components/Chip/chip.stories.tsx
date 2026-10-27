// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Chip, ChipGroup } from './chip'
import { Badge } from '@/design-system/components/Badge/badge'
import { AgentMessage } from '@/design-system/components/AgentPanel/agent-panel'
import { FileViewer } from '@/design-system/components/FileViewer/file-viewer'
import type { FileInfo } from '@/design-system/components/FileViewer/file-viewer-types'

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

// @story-history: States(狀態)退役 2026-10-28 —— 狀態只放設計規格「狀態行為」、尺寸只放「尺寸對照表」(D17 甲「d17照你建議」;F-S10 精簡不重複)。
// @story-history: WithIcon retired per F migration 2026-05-15 — anatomy.stories.tsx auto-compile owns icon slot showcase。
// ── With badge ──────────────────────────────────────────────────────────────

export const WithBadge: Story = {
  name: '帶 Badge',
  render: () => {
    // 全部 / 進行中 / 已完成 三者互斥(選「全部」就不會同時是「進行中」)→ 單選(chip.spec.md single = 從群裡選唯一)
    const [value, setValue] = useState('all')
    return (
      <ChipGroup type="single" value={value} onValueChange={(v) => v && setValue(v as string)}>
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
//   已 cover layout 機制比較與業務情境。展示層保留 typical 情境(Default / WithBadge / SingleSelection)。
//   注意:Chip 是 filter chip,不提供 dismiss / 可移除態(spec「禁止事項」),故無 Removable story。

// assist 分支(2026-09-02):按鈕語意、可獨立使用——智慧代理訊息內的附件開啟(真實消費場景)。
// 直接渲染消費端 AgentMessage(使用者訊息氣泡 + 附件列),不手抄它的內距 / 附件列間距(那兩個值的主人是 agent-panel.tsx 的 AgentMessage)。
// 點附件 = 開 FileViewer 看那個檔(稽核 M025「附件 Chip 點開 FileViewer」)。
const ATTACHMENTS: FileInfo[] = [
  { id: 'backlog', url: 'https://picsum.photos/seed/sprint-42-backlog/1200/800', name: 'sprint-42-backlog.csv', mimeType: 'text/csv', size: 18_400 },
  { id: 'rules', url: 'https://picsum.photos/seed/schedule-rules/1200/800', name: '排程規則.md', mimeType: 'text/markdown', size: 3_200 },
]

export const AssistAttachments: Story = {
  name: '按鈕語意附件',
  parameters: {
    docs: { description: { story: '附件以按鈕語意的 Chip 呈現在智慧代理的訊息裡,點一下就打開檔案檢視器看那個檔。' } },
  },
  render: () => {
    const [open, setOpen] = useState(false)
    const [index, setIndex] = useState(0)
    return (
      <div className="max-w-xs">
        <AgentMessage
          role="user"
          attachments={ATTACHMENTS.map((f) => ({ id: f.id, label: f.name }))}
          onAttachmentClick={(attachment) => {
            setIndex(Math.max(0, ATTACHMENTS.findIndex((f) => f.id === attachment.id)))
            setOpen(true)
          }}
        >
          把這份待辦按優先級重排,衝突的排程幫我標出來。
        </AgentMessage>
        <FileViewer files={ATTACHMENTS} open={open} onOpenChange={setOpen} index={index} onIndexChange={setIndex} />
      </div>
    )
  },
}

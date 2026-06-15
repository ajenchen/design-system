// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Pencil, Copy, Trash2 } from 'lucide-react'
import { Separator } from './separator'
import { Button } from '@/design-system/components/Button/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/design-system/components/DropdownMenu/dropdown-menu'

const meta: Meta = {
  title: 'Design System/Components/Separator/設計原則',
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
    <div className="flex flex-col gap-4">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── Stories ───────────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 Separator ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Separator 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Separator/展示" name="水平"><span className="text-primary hover:underline font-medium cursor-pointer">水平分隔</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Separator/展示" name="垂直"><span className="text-primary hover:underline font-medium cursor-pointer">垂直分隔</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Separator/展示" name="在 DropdownMenu 內"><span className="text-primary hover:underline font-medium cursor-pointer">在 DropdownMenu 內</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Separator/展示" name="在 DescriptionList 區塊之間"><span className="text-primary hover:underline font-medium cursor-pointer">在 DescriptionList 區塊之間</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* 何時不用 / 替代元件 — 原 WhenNotToUse */}
      <div>
      <Rule
        title="❌ 不用 Separator 元件做元件固定結構的邊框"
        note="Dialog / Sidebar header-footer 的邊界用 CSS border，不用 Separator 元件。Separator 只用 consumer 手動放置的分隔。Notion dialog 的 header bottom 邊界是 CSS，不是 Separator"
      >
        <Label warn>固定結構邊界 → CSS border-divider，不用元件</Label>
      </Rule>

      <Rule
        title="❌ 不用 --border token 做分隔線"
        note="分隔線一律用 --divider（較淡），--border 只用控件邊框。Jira menu 項目間的線用 --divider"
      >
        <Label warn>分隔線 → --divider，--border 只用容器邊框</Label>
      </Rule>

      <Rule
        title="❌ 不用 Separator 做裝飾性邊框"
        note="輪廓邊框（Input / Card / DataTable 邊線）用 CSS border-border，不用 Separator。Separator 有 role 語意，裝飾邊不需要"
      >
        <Label warn>裝飾邊框 → CSS border-border，Separator 只用分隔內容</Label>
      </Rule>
    </div>
    </div>
  ),
}

export const DecorativeSemanticRule: Story = {
  name: '裝飾性 vs 語意分隔（讀屏的差別）',
  render: () => (
    <div>
      <Rule
        title="預設 decorative=true — 純視覺分隔,screen reader 跳過"
        note="大多數場景(settings panel 內的區塊分組、toolbar 間隔、menu 項目分組)屬視覺性分隔。讓 screen reader 跳過,避免語意噪音"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="tertiary" size="sm">更多操作</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem startIcon={Pencil}>重新命名</DropdownMenuItem>
            <DropdownMenuItem startIcon={Copy}>複製連結</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem startIcon={Trash2}>刪除</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Label>↑ DropdownMenu 的 separator 讓「編輯類」與「破壞類」視覺分組,a11y 已由 Radix 處理</Label>
      </Rule>

      <Rule
        title="明確結構性分組(語意分隔)→ decorative={false}"
        note={'當 Separator 真的代表內容層級的結構邊界(例如 profile page 的「個人」vs「團隊」兩個 section),設 decorative={false},讓 screen reader 讀出 role="separator"'}
      >
        <div className="border border-border rounded-lg p-4 max-w-md flex flex-col gap-3">
          <div>
            <div className="text-body font-medium">個人資訊</div>
            <div className="text-caption text-fg-muted">姓名、email、時區</div>
          </div>
          <Separator decorative={false} />
          <div>
            <div className="text-body font-medium">團隊資訊</div>
            <div className="text-caption text-fg-muted">所屬團隊、職稱</div>
          </div>
        </div>
        <Label>↑ 兩個 section 是頁面結構的主層級 → 需要 a11y 語意</Label>
      </Rule>
    </div>
  ),
}


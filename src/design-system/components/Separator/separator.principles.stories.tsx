// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Pencil, Copy, Trash2 } from 'lucide-react'
import { Separator } from './separator'
import { Button } from '@/design-system/components/Button/button'
import { Input } from '@/design-system/components/Input/input'
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
          <LinkTo kind="Design System/Components/Separator/展示" name="Horizontal"><span className="text-primary hover:underline font-medium cursor-pointer">Horizontal</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Separator/展示" name="Vertical"><span className="text-primary hover:underline font-medium cursor-pointer">Vertical</span></LinkTo>
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

export const WhoDecidesRule: Story = {
  name: '分隔的決策者:Separator vs CSS border',
  render: () => (
    <div>
      <Rule
        title="✅ Consumer 手動放置 → 用 Separator"
        note={'Consumer 在 JSX 裡明確決定「這裡要分隔」時使用 Separator。提供 role="separator" 的 ARIA 語意,讓輔助技術辨識內容群組邊界'}
      >
        <div className="border border-border rounded-lg p-4 max-w-md flex flex-col gap-3">
          <div>
            <div className="text-body font-medium">一般</div>
            <div className="text-caption text-fg-muted">語言、時區、外觀</div>
          </div>
          <Separator />
          <div>
            <div className="text-body font-medium">通知</div>
            <div className="text-caption text-fg-muted">Email、推播、週報</div>
          </div>
        </div>
        <Label>↑ consumer 放 &lt;Separator /&gt; 把「一般」與「通知」標為不同群組</Label>
      </Rule>

      <Rule
        title="✅ 元件自己的外框或內部固定結構 → 用 CSS border"
        note="Input 外框、Dialog Header/Footer 底線、Card 輪廓等——這些不是 consumer 決定的分隔,是元件結構本身的一部分。不需要語意標記,用 CSS `border` / `border-t` 即可"
      >
        <div className="flex flex-col gap-2 max-w-md">
          <Input placeholder="Input 外框是 border-border,不是 Separator" />
          <Label>↑ Input 的外框 = 元件自己的邊界,不是分隔群組,用 CSS border</Label>
        </div>
      </Rule>

      <Rule
        title="❌ 把 Separator 當成「畫一條線」的工具"
        note="Separator 不是通用的線——它是分組語意元件。把它當裝飾線使用(像 `<hr />` 只為好看)會讓 screen reader 誤讀出虛假的群組邊界"
      >
        <div className="border border-border rounded-lg p-4 max-w-md">
          <div className="text-body font-medium">購買摘要</div>
          <Separator className="my-2" />
          <div className="flex justify-between text-body">
            <span>小計</span>
            <span>NT$ 1,200</span>
          </div>
        </div>
        <Label warn>
          ↑ 這條線是「標題下方的裝飾」而非「分組」。應改用 `border-b` 在標題下邊 — 不是 Separator
        </Label>
      </Rule>
    </div>
  ),
}

export const DecorativeSemanticRule: Story = {
  name: 'decorative vs semantic(a11y)',
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

export const NotAsBorderRule: Story = {
  name: '不用 Separator 模仿邊框',
  render: () => (
    <div>
      <Rule
        title="Token 分工:--divider vs --border"
        note="兩者視覺接近但語意不同。分隔線(內容群組之間)用 `--divider`(neutral-4,較淡);控件邊框(Input / Card 輪廓)用 `--border`(neutral-5,較深)。用錯會讓「邊界」與「分隔」視覺混亂"
      >
        <div className="flex flex-col gap-4 max-w-md">
          <div className="border border-border rounded-lg p-3">
            <span className="text-body">border-border</span>
            <span className="text-caption text-fg-muted ml-2">← 控件輪廓(neutral-5)</span>
          </div>
          <div className="py-3">
            <div className="text-body">群組 A</div>
            <Separator className="my-2" />
            <div className="text-body">群組 B</div>
            <span className="text-caption text-fg-muted">↑ Separator 用 bg-divider(neutral-4)</span>
          </div>
        </div>
      </Rule>

      <Rule
        title="❌ 用 Separator 當成 Dialog footer 的上邊線"
        note="Dialog header/footer 的線是元件固定結構,不是 consumer 決定的分組 → 應在元件內部用 `border-t border-divider`,不在 JSX 放 Separator"
      >
        <div className="border border-border rounded-lg max-w-md overflow-hidden">
          <div className="p-4">
            <div className="text-body font-medium">刪除專案?</div>
            <div className="text-caption text-fg-muted mt-1">此操作無法復原。</div>
          </div>
          <Separator />
          <div className="p-3 flex justify-end gap-2">
            <Button variant="tertiary" size="sm">取消</Button>
            <Button variant="primary" size="sm" danger>刪除</Button>
          </div>
        </div>
        <Label warn>
          ↑ consumer 在 Dialog 外放 Separator 是錯的 — Dialog footer 上邊線屬元件結構,應在元件 CSS 內用 border-t
        </Label>
      </Rule>

      <Rule
        title="❌ 用 Separator 模仿 Table 格線 / Card 輪廓"
        note={'格線與輪廓屬於容器邊界,不是內容分組。格線應是 table cell 的 `border-b`,Card 輪廓應是 `border border-border`。濫用 Separator 會產生大量 role="separator",讓 screen reader 讀出雜訊'}
      >
        <div className="max-w-md">
          <div className="py-1 text-body">2026-04-18 登入</div>
          <Separator />
          <div className="py-1 text-body">2026-04-17 變更密碼</div>
          <Separator />
          <div className="py-1 text-body">2026-04-15 新增裝置</div>
        </div>
        <Label warn>
          ↑ 活動紀錄逐行分隔 = table 格線語意 → 該用 CSS `[&+&]:border-t border-divider`,不是 Separator
        </Label>
      </Rule>
    </div>
  ),
}


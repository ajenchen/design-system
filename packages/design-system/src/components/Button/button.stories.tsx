// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @story-trait-rationale: hasSizes 由 anatomy.stories.tsx SizeMatrix auto-compile owns size showcase(2026-05-15 F-migration);Default scenario 由 Pressed / IconOnly / 各 variant 真實業務情境 story 覆蓋。
import type { Meta, StoryObj } from '@storybook/react'
import { Plus, Trash2, Search, ChevronDown, Settings, Download, Bell, RefreshCw, Maximize2, Save } from 'lucide-react'
import { Button } from './button'
import { Badge } from '@/design-system/components/Badge/badge'

const meta: Meta<typeof Button> = {
  title: 'Design System/Components/Button/展示',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '觸發操作或導覽的基礎互動元件。支援五種視覺強調等級（variant）、danger 語意疊加、四種尺寸、icon-only 模式。',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'tertiary', 'text', 'link'],
      description: '視覺強調等級。`destructive` / `ghost` 為 shadcn 內部 compat alias，應用層請勿直接使用。',
    },
    danger: {
      control: 'boolean',
      description: '套用危險色（紅色）。僅 `primary` / `secondary` / `text` 支援（`tertiary` 視覺與 secondary+danger 重複、`link` 語義矛盾，見 spec 禁止事項）。',
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg'],
      description: '`xs` 固定尺寸；`sm` / `md`（預設）/ `lg` 會隨 density 自動縮放。',
    },
    startIcon: {
      control: false,
      description: '左側 icon（`LucideIcon`），最多一個。`loading` 時自動替換為 spinner。',
    },
    endIcon: {
      control: false,
      description: '右側 icon（`LucideIcon`），放在 badge 右邊。語意：告訴使用者按鈕會展開下一層（如 `ChevronDown`），不應放動詞性 icon。',
    },
    badge: {
      control: false,
      description: '右側 badge 內容（`ReactNode`），通常傳入計數指示器。',
    },
    iconOnly: {
      control: 'boolean',
      description: '移除水平 padding，讓按鈕變為正方形。必須同時設定 `aria-label`。',
    },
    loading: {
      control: 'boolean',
      description: '載入中狀態：左側顯示 spinner，自動設為 `disabled`，同時設定 `aria-busy`。',
    },
    disabled: {
      control: 'boolean',
      description: '停用按鈕。不代表載入中，若需傳達載入請同時設定 `loading`。',
    },
    fullWidth: {
      control: 'boolean',
      description: '加上 `w-full`，撐滿父容器。垂直排列按鈕群組時使用。',
    },
    asChild: {
      control: false,
      description: '將樣式套用至子元件（e.g. React Router `<Link>`），使用 Radix `Slot` 實作。',
    },
  },
}

export default meta
type Story = StoryObj<typeof Button>

// 2026-05-18 加(per user 抓「為何開頭是按下狀態」):Default story 放最頂,
// 入口顯預設 variant 五連發(primary / secondary / tertiary / text / link),
// 讓 user 第一眼看到按鈕長什麼樣 — 而非 transient state demo。
export const Default: Story = {
  name: '預設',
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">主要動作</Button>
      <Button variant="secondary">次要動作</Button>
      <Button variant="tertiary">第三動作</Button>
      <Button variant="text">純文字</Button>
      <Button variant="link">連結樣式</Button>
    </div>
  ),
}

export const Pressed: Story = {
  name: '按下狀態',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-caption text-fg-muted w-24">secondary</span>
        <Button variant="secondary">顯示側欄</Button>
        <Button variant="secondary" pressed>已顯示側欄</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-caption text-fg-muted w-24">tertiary</span>
        <Button variant="tertiary">自動儲存</Button>
        <Button variant="tertiary" pressed>自動儲存中</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-caption text-fg-muted w-24">text</span>
        <Button variant="text">靜音</Button>
        <Button variant="text" pressed>已靜音</Button>
      </div>
    </div>
  ),
}

// ── danger prop ─────────────────────────────────────────────────

export const Danger: Story = {
  name: '危險 語意',
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" danger>刪除專案</Button>
        <Button variant="secondary" danger>移除成員</Button>
        <Button variant="text" danger>撤銷授權</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
        <Button variant="secondary" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
        <Button variant="text" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
      </div>
    </div>
  ),
}

// ── startIcon / endIcon display retired 2026-04-24 ──
// `WithStartIcon` retired(Dim 25 earn-existence):同教 principle 已在 `startIconRule`
// principles story(含視覺 + do/don't + 規則註解),display 層重複教相同原則 = noise。
// 需要 startIcon / endIcon 的 quick reference → 參考 `.principles.stories.tsx`。

// ── badge slot(獨立 rule,跟 Chip 一致)────────────────────────────────

export const WithBadge: Story = {
  // badge 是獨立 slot rule(inline 在 pill 內),不合進 WithIcon — 對齊 Chip 一致。
  // Compound(badge + endIcon)順帶展示 layering 真實情境(教 layering coexistence)。
  name: 'Badge 槽位',
  args: { size: 'sm' },
  render: (args) => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="w-full text-caption text-fg-muted">badge — inline 計數</p>
        <Button size={args.size} variant="tertiary" startIcon={Bell} badge={<Badge count={3} />}>通知</Button>
        <Button size={args.size} variant="tertiary" badge={<Badge count={12} />}>訊息</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="w-full text-caption text-fg-muted">badge + endIcon compound</p>
        <Button size={args.size} variant="tertiary" badge={<Badge count={5} />} endIcon={ChevronDown}>更多通知</Button>
        <Button size={args.size} variant="tertiary" badge={<Badge count={2} />} endIcon={ChevronDown}>待辦</Button>
      </div>
    </div>
  ),
}

// ── Icon-only ──────────────────────────────────────────────────

export const IconOnly: Story = {
  name: '純圖示',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="w-full text-caption text-fg-muted">variants — size="sm"</p>
        <Button size="sm" iconOnly variant="primary"   startIcon={Plus}     aria-label="新增" />
        <Button size="sm" iconOnly variant="secondary" startIcon={Download}  aria-label="下載" />
        <Button size="sm" iconOnly variant="tertiary"  startIcon={Search}    aria-label="搜尋" />
        <Button size="sm" iconOnly variant="text"      startIcon={Settings}  aria-label="設定" />
        <Button size="sm" iconOnly variant="text" pressed startIcon={Maximize2} aria-label="全螢幕（開啟中）" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="w-full text-caption text-fg-muted">danger — size="sm"</p>
        <Button size="sm" iconOnly variant="primary"    danger startIcon={Trash2} aria-label="永久刪除" />
        <Button size="sm" iconOnly variant="secondary" danger startIcon={Trash2} aria-label="刪除（有確認）" />
        <Button size="sm" iconOnly variant="text"      danger startIcon={Trash2} aria-label="刪除" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="w-full text-caption text-fg-muted">sizes — variant="text"</p>
        <Button size="xs" iconOnly variant="text" startIcon={Settings} aria-label="設定 xs" />
        <Button size="sm" iconOnly variant="text" startIcon={Settings} aria-label="設定 sm" />
        <Button size="md" iconOnly variant="text" startIcon={Settings} aria-label="設定 md" />
        <Button size="lg" iconOnly variant="text" startIcon={Settings} aria-label="設定 lg" />
      </div>
    </div>
  ),
}

// ── 狀態 ────────────────────────────────────────────────────────

export const Disabled: Story = {
  name: '停用',
  render: () => (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-caption text-fg-muted">全 variants(form footer 情境)</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" disabled>儲存</Button>
          <Button variant="secondary" disabled>取消</Button>
          <Button variant="tertiary" disabled>預覽</Button>
          <Button variant="text" disabled>查看版本紀錄</Button>
          <Button variant="text" pressed disabled>已啟用自動儲存</Button>
          <Button variant="link" disabled>了解更多</Button>
        </div>
      </div>
      <div>
        <p className="mb-2 text-caption text-fg-muted">danger</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" danger disabled>刪除專案</Button>
          <Button variant="secondary" danger disabled>移除成員</Button>
          <Button variant="text" danger disabled>撤銷授權</Button>
        </div>
      </div>
      <div>
        <p className="mb-2 text-caption text-fg-muted">icon-only — 全 variants</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" disabled size="sm" iconOnly startIcon={Plus} aria-label="新增" />
          <Button variant="secondary" disabled size="sm" iconOnly startIcon={Download} aria-label="下載" />
          <Button variant="tertiary" disabled size="sm" iconOnly startIcon={Settings} aria-label="設定" />
          <Button variant="text" disabled size="sm" iconOnly startIcon={Search} aria-label="搜尋" />
          <Button variant="text" pressed disabled size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕" />
        </div>
      </div>
      <div>
        <p className="mb-2 text-caption text-fg-muted">icon-only — danger</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" danger disabled size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
          <Button variant="secondary" danger disabled size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
          <Button variant="text" danger disabled size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
        </div>
      </div>
    </div>
  ),
}

export const Loading: Story = {
  name: '載入中',
  render: () => (
    <div className="flex flex-col gap-6">
      {/* 行為對照 */}
      <div>
        <p className="mb-2 text-caption text-fg-muted">行為對照：原始 → loading</p>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Button variant="primary" startIcon={Download}>匯出</Button>
            <span className="text-caption text-fg-muted">→</span>
            <Button variant="primary" startIcon={Download} loading>匯出中</Button>
            <span className="text-caption text-fg-muted">startIcon 被 spinner 替換，位置不變</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="primary">儲存</Button>
            <span className="text-caption text-fg-muted">→</span>
            <Button variant="primary" loading>儲存中</Button>
            <span className="text-caption text-fg-muted">spinner 出現在文字左側，按鈕略寬</span>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" iconOnly startIcon={Download} aria-label="下載" />
            <span className="text-caption text-fg-muted">→</span>
            <Button size="sm" iconOnly startIcon={Download} loading aria-label="下載中" />
            <span className="text-caption text-fg-muted">icon-only：spinner 替換 icon</span>
          </div>
        </div>
      </div>

      {/* 全 variants — with startIcon */}
      <div>
        <p className="mb-2 text-caption text-fg-muted">全 variants — with startIcon(匯出 / 同步情境)</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" startIcon={Download} loading>匯出報表</Button>
          <Button variant="secondary" startIcon={Download} loading>同步 Stripe</Button>
          <Button variant="tertiary" startIcon={Download} loading>重新整理</Button>
          <Button variant="text" startIcon={Download} loading>取消</Button>
          <Button variant="text" pressed startIcon={Download} loading>下載中</Button>
          <Button variant="primary" danger startIcon={Trash2} loading>刪除專案</Button>
        </div>
      </div>

      {/* 全 variants — without startIcon */}
      <div>
        <p className="mb-2 text-caption text-fg-muted">全 variants — without startIcon(匯出 / 同步情境)</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading>匯出報表</Button>
          <Button variant="secondary" loading>同步 Stripe</Button>
          <Button variant="tertiary" loading>重新整理</Button>
          <Button variant="text" loading>取消</Button>
          <Button variant="text" pressed loading>處理中</Button>
          <Button variant="primary" danger loading>刪除專案</Button>
        </div>
      </div>

      {/* icon-only */}
      <div>
        <p className="mb-2 text-caption text-fg-muted">icon-only</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading size="sm" iconOnly startIcon={Download} aria-label="下載" />
          <Button variant="secondary" loading size="sm" iconOnly startIcon={Download} aria-label="下載" />
          <Button variant="tertiary" loading size="sm" iconOnly startIcon={RefreshCw} aria-label="刷新" />
          <Button variant="text" loading size="sm" iconOnly startIcon={Settings} aria-label="設定" />
          <Button variant="text" pressed loading size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕" />
        </div>
      </div>
    </div>
  ),
}

export const FullWidth: Story = {
  name: '全寬',
  render: () => (
    <div className="flex flex-col gap-3 max-w-xs">
      <Button variant="primary" fullWidth>確認送出</Button>
      <Button variant="tertiary" fullWidth>取消</Button>
      <Button variant="primary" danger fullWidth startIcon={Trash2}>永久刪除</Button>
    </div>
  ),
}

// ── Interactive State Pilot(視覺稽核用)─────────────────────────────
// 用 play() + @storybook/test 觸發 hover / focus / tooltip 等互動狀態,
// 讓 Playwright 截圖抓到 post-interaction 視覺(而非靜態 className 模擬)。
// 詳見 .claude/skills/visual-audit/SKILL.md 的「Layer A interactive state coverage」。

export const HoverFocusState: Story = {
  name: '滑鼠移過 / 鍵盤聚焦',
  tags: ['!autodocs'],
  render: () => (
    <div className="flex gap-4">
      <Button variant="primary" data-testid="hover-target">Hover 我</Button>
      <Button variant="primary" data-testid="focus-target">Focus 我</Button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/test')
    const canvas = within(canvasElement)
    const hoverEl = await canvas.findByTestId('hover-target')
    const focusEl = await canvas.findByTestId('focus-target')
    await userEvent.hover(hoverEl)
    focusEl.focus()
    // Wait transitions settle (hover bg ~150ms + focus ring render)
    await new Promise((r) => setTimeout(r, 400))
  },
}

export const TooltipVisible: Story = {
  name: '純圖示加 Tooltip',
  tags: ['!autodocs'],
  render: () => (
    <div className="p-12">
      <Button iconOnly startIcon={Save} aria-label="儲存" data-testid="tooltip-target" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const { within } = await import('@storybook/test')
    const canvas = within(canvasElement)
    const btn = await canvas.findByTestId('tooltip-target')
    btn.focus()
    // Tooltip open delay(Radix 預設 ~700ms warm-up / instant after warm);
    // 給足 1000ms 確保 content 已 render 到 Portal
    await new Promise((r) => setTimeout(r, 1000))
  },
}


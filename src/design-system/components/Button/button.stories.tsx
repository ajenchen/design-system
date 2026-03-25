import type { Meta, StoryObj } from '@storybook/react'
import { Plus, Trash2, Search, ChevronDown, Settings, Download, Bell, RefreshCw, Maximize2 } from 'lucide-react'
import { Button } from './button'

// ── 輕量 Badge helper（stories 內部用，非正式 Badge 元件）──────────
const BadgeCount = ({ count }: { count: number }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '16px',
      height: '16px',
      padding: '0 4px',
      borderRadius: '99px',
      backgroundColor: 'var(--notification)',
      color: 'white',
      fontSize: '10px',
      fontWeight: 600,
      lineHeight: 1,
    }}
  >
    {count}
  </span>
)

const meta: Meta<typeof Button> = {
  title: 'Design System/Button/展示',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `
shadcn 風格 Button，橋接設計系統 token，支援 lucide-react icon。

**Variants：** \`primary\` · \`secondary\` · \`tertiary\` · \`text\` · \`checked\` · \`link\`

**danger prop：** 疊加在任何 variant 上，將顏色改為紅色。

**Sizes：** \`xs\`(24px 固定) · \`sm\`(28px 預設) · \`md\`(32px) · \`lg\`(36px)

**Icons：** \`startIcon\`（左側）· \`endIcon\`（右側）· \`iconOnly\` prop 讓任何尺寸變正方形
        `,
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'tertiary', 'text', 'checked', 'link'],
      description: '視覺強調等級。`destructive` / `ghost` 為 shadcn 內部 compat alias，應用層請勿直接使用。',
    },
    danger: {
      control: 'boolean',
      description: '套用危險色（紅色）。可與任何 variant 組合，與 variant 正交。',
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg'],
      description: '`xs` 固定 24px；`sm`（預設）/ `md` / `lg` 會隨 `data-ui-size="lg"` 自動縮放。',
    },
    startIcon: {
      control: false,
      description: '左側 icon（`LucideIcon`），最多一個。`loading` 時自動替換為 spinner，位置不變（零 layout shift）。',
    },
    endIcon: {
      control: false,
      description: '右側 icon（`LucideIcon`），放在 badge 右邊。語意：告訴使用者按鈕會展開下一層（如 `ChevronDown`），不應放動詞性 icon。',
    },
    badge: {
      control: false,
      description: '右側 badge 內容（`ReactNode`），通常傳入 Badge 元件。',
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

// ── 基本 variants ──────────────────────────────────────────────

export const Primary: Story = {
  args: { variant: 'primary', children: 'Primary' },
}

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Secondary' },
}

export const Tertiary: Story = {
  args: { variant: 'tertiary', children: 'Tertiary' },
}

export const Text: Story = {
  args: { variant: 'text', children: 'Text' },
}

export const Checked: Story = {
  name: 'Checked (toggle)',
  render: () => (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-fg-muted">功能啟用中用 checked，未啟用可用任何較低 variant</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="tertiary" startIcon={Maximize2}>全螢幕（關閉）</Button>
        <Button variant="checked"  startIcon={Maximize2}>全螢幕（開啟中）</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="text" size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕（關閉）" />
        <Button variant="checked" size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕（開啟中）" />
      </div>
    </div>
  ),
}

export const Link: Story = {
  name: 'Link',
  render: () => (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-fg-muted">樣式像連結的按鈕，本質仍是 button（不可嵌入段落文字）</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="link">前往設定</Button>
        <Button variant="link" disabled>停用連結</Button>
      </div>
    </div>
  ),
}

// ── danger prop ─────────────────────────────────────────────────

export const Danger: Story = {
  name: 'Danger prop',
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" danger>Primary danger</Button>
        <Button variant="secondary" danger>Secondary danger</Button>
        <Button variant="text" danger>Text danger</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
        <Button variant="secondary" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
        <Button variant="text" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
      </div>
    </div>
  ),
}

// ── startIcon（左側 icon）──────────────────────────────────────────

export const WithStartIcon: Story = {
  name: 'startIcon',
  args: { size: 'sm' },
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size={args.size} startIcon={Plus}>新增項目</Button>
      <Button size={args.size} variant="tertiary" startIcon={Download}>匯出</Button>
      <Button size={args.size} variant="text" startIcon={Settings}>設定</Button>
    </div>
  ),
}

// ── endIcon / badge（右側）────────────────────────────────────

export const WithEndIcon: Story = {
  name: 'endIcon / badge',
  args: { size: 'sm' },
  render: (args) => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="w-full text-caption text-fg-muted">endIcon only</p>
        <Button size={args.size} variant="secondary" endIcon={ChevronDown}>展開選單</Button>
        <Button size={args.size} variant="tertiary" endIcon={ChevronDown}>更多選項</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="w-full text-caption text-fg-muted">badge only</p>
        <Button size={args.size} startIcon={Bell} badge={<BadgeCount count={3} />}>通知</Button>
        <Button size={args.size} variant="tertiary" badge={<BadgeCount count={12} />}>訊息</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="w-full text-caption text-fg-muted">badge + endIcon</p>
        <Button size={args.size} badge={<BadgeCount count={5} />} endIcon={ChevronDown}>更多通知</Button>
        <Button size={args.size} variant="tertiary" badge={<BadgeCount count={2} />} endIcon={ChevronDown}>待辦</Button>
      </div>
    </div>
  ),
}

// ── Icon-only ──────────────────────────────────────────────────

export const IconOnly: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="w-full text-caption text-fg-muted">variants — size="sm"</p>
        <Button size="sm" iconOnly variant="primary"   startIcon={Plus}     aria-label="新增" />
        <Button size="sm" iconOnly variant="secondary" startIcon={Download}  aria-label="下載" />
        <Button size="sm" iconOnly variant="tertiary"  startIcon={Search}    aria-label="搜尋" />
        <Button size="sm" iconOnly variant="text"      startIcon={Settings}  aria-label="設定" />
        <Button size="sm" iconOnly variant="checked"   startIcon={Maximize2} aria-label="全螢幕（開啟中）" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="w-full text-caption text-fg-muted">danger — size="sm"</p>
        <Button size="sm" iconOnly variant="primary"  danger startIcon={Trash2} aria-label="永久刪除" />
        <Button size="sm" iconOnly variant="tertiary" danger startIcon={Trash2} aria-label="刪除" />
        <Button size="sm" iconOnly variant="text"     danger startIcon={Trash2} aria-label="刪除" />
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

// ── 尺寸 ────────────────────────────────────────────────────────

export const AllSizes: Story = {
  name: 'Sizes',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Button size="xs" startIcon={Plus}>xs (24px 固定)</Button>
        <Button size="sm" startIcon={Plus}>sm (28px) ← 預設</Button>
        <Button size="md" startIcon={Plus}>md (32px)</Button>
        <Button size="lg" startIcon={Plus}>lg (36px)</Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <p className="w-full text-caption text-fg-muted">icon-only（同樣四種尺寸）</p>
        <Button size="xs" iconOnly startIcon={Plus} aria-label="新增 xs" />
        <Button size="sm" iconOnly startIcon={Plus} aria-label="新增 sm" />
        <Button size="md" iconOnly startIcon={Plus} aria-label="新增 md" />
        <Button size="lg" iconOnly startIcon={Plus} aria-label="新增 lg" />
      </div>
    </div>
  ),
}

// ── 狀態 ────────────────────────────────────────────────────────

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-caption text-fg-muted">全 variants</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" disabled>Primary</Button>
          <Button variant="secondary" disabled>Secondary</Button>
          <Button variant="tertiary" disabled>Tertiary</Button>
          <Button variant="text" disabled>Text</Button>
          <Button variant="checked" disabled>Checked</Button>
          <Button variant="link" disabled>Link</Button>
        </div>
      </div>
      <div>
        <p className="mb-2 text-caption text-fg-muted">danger</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" danger disabled>Primary danger</Button>
          <Button variant="secondary" danger disabled>Secondary danger</Button>
          <Button variant="text" danger disabled>Text danger</Button>
        </div>
      </div>
      <div>
        <p className="mb-2 text-caption text-fg-muted">icon-only — 全 variants</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" disabled size="sm" iconOnly startIcon={Plus} aria-label="新增" />
          <Button variant="secondary" disabled size="sm" iconOnly startIcon={Download} aria-label="下載" />
          <Button variant="tertiary" disabled size="sm" iconOnly startIcon={Settings} aria-label="設定" />
          <Button variant="text" disabled size="sm" iconOnly startIcon={Search} aria-label="搜尋" />
          <Button variant="checked" disabled size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕" />
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
  render: () => (
    <div className="flex flex-col gap-6">
      {/* 行為對照 */}
      <div>
        <p className="mb-2 text-caption text-fg-muted">行為對照：原始 → loading</p>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Button startIcon={Download}>匯出</Button>
            <span className="text-caption text-fg-muted">→</span>
            <Button startIcon={Download} loading>匯出中</Button>
            <span className="text-caption text-fg-muted">startIcon 被 spinner 替換，位置不變</span>
          </div>
          <div className="flex items-center gap-3">
            <Button>儲存</Button>
            <span className="text-caption text-fg-muted">→</span>
            <Button loading>儲存中</Button>
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
        <p className="mb-2 text-caption text-fg-muted">全 variants — with startIcon</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button startIcon={Download} loading>Primary</Button>
          <Button variant="secondary" startIcon={Download} loading>Secondary</Button>
          <Button variant="tertiary" startIcon={Download} loading>Tertiary</Button>
          <Button variant="text" startIcon={Download} loading>Text</Button>
          <Button variant="primary" danger startIcon={Trash2} loading>Danger</Button>
        </div>
      </div>

      {/* 全 variants — without startIcon */}
      <div>
        <p className="mb-2 text-caption text-fg-muted">全 variants — without startIcon</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button loading>Primary</Button>
          <Button variant="secondary" loading>Secondary</Button>
          <Button variant="tertiary" loading>Tertiary</Button>
          <Button variant="text" loading>Text</Button>
          <Button variant="primary" danger loading>Danger</Button>
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
          <Button variant="checked" loading size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕" />
        </div>
      </div>
    </div>
  ),
}

export const FullWidth: Story = {
  name: 'Full Width',
  render: () => (
    <div className="flex flex-col gap-3 max-w-xs">
      <Button fullWidth>確認送出</Button>
      <Button variant="tertiary" fullWidth>取消</Button>
      <Button variant="primary" danger fullWidth startIcon={Trash2}>永久刪除</Button>
    </div>
  ),
}


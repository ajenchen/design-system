import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'

const meta: Meta = {
  title: 'Design System/Tokens/Density',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
\`data-density\` 統一控制 **UI Size**（元件高度 / 內距）與 **Layout Space**（版面間距）。

- **md**（預設）：緊湊，適合資訊密集的桌面 UI
- **lg**：寬鬆，適合觸控或更大點擊目標

底層仍可用 \`data-ui-size\` / \`data-layout-space\` 單獨控制（逃生艙）。

CSS 定義：\`uiSize/uiSize.css\` · \`layoutSpace/layoutSpace.css\`
        `,
      },
    },
  },
}

export default meta
type Story = StoryObj


// ── Helpers ──────────────────────────────────────────────────────────────────

function ColHeader({ cols = '180px 1fr 80px 1fr 80px' }: { cols?: string }) {
  return (
    <div className="grid gap-x-4 pb-2 border-b border-border mb-1" style={{ gridTemplateColumns: cols }}>
      <span />
      <span className="text-caption text-fg-muted">md（預設）</span>
      <span />
      <span className="text-caption text-fg-muted">lg</span>
      <span />
    </div>
  )
}

function TokenRow({
  token, md, lg, desc, attr, isSolid = true, cols = '180px 1fr 80px 1fr 80px',
}: {
  token: string; md: string; lg: string; desc?: string
  attr: string; isSolid?: boolean; cols?: string
}) {
  return (
    <div className="grid items-center gap-x-4 border-b border-border py-3 last:border-0"
      style={{ gridTemplateColumns: cols }}>
      <div>
        <code className="block text-caption font-medium text-fg-secondary">{token}</code>
        {desc && <span className="text-caption text-fg-muted">{desc}</span>}
      </div>
      {/* md */}
      <div {...{ [attr]: 'md' }}>
        <div
          className={`rounded-md ${isSolid ? 'bg-primary opacity-70' : 'bg-primary-subtle'}`}
          style={isSolid
            ? { height: `var(${token})`, width: '100%' }
            : { height: '20px', width: `var(${token})` }
          }
        />
      </div>
      <span className="text-caption text-fg-muted text-right">{md}</span>
      {/* lg */}
      <div {...{ [attr]: 'lg' }}>
        <div
          className={`rounded-md ${isSolid ? 'bg-primary' : 'bg-primary-subtle'}`}
          style={isSolid
            ? { height: `var(${token})`, width: '100%' }
            : { height: '20px', width: `var(${token})` }
          }
        />
      </div>
      <span className="text-caption text-fg-muted text-right">{lg}</span>
    </div>
  )
}


// ── 1. Overview ──────────────────────────────────────────────────────────────

export const Overview: Story = {
  name: 'Overview',
  parameters: {
    docs: {
      description: {
        story: '`data-density` 同時切換 UI Size 與 Layout Space。左欄 md，右欄 lg。',
      },
    },
  },
  render: () => {
    function Row({ label, token, isSolid }: { label: string; token: string; isSolid: boolean }) {
      return (
        <div className="grid items-center gap-x-4 border-b border-border py-2.5 last:border-0"
          style={{ gridTemplateColumns: '200px 1fr 1fr' }}>
          <code className="text-caption font-medium text-fg-secondary">{label}</code>
          <div data-density="md">
            <div
              className={`rounded-md ${isSolid ? 'bg-primary opacity-70' : 'bg-primary-subtle'}`}
              style={{ height: isSolid ? `var(${token})` : '16px', width: isSolid ? '100%' : `var(${token})` }}
            />
          </div>
          <div data-density="lg">
            <div
              className={`rounded-md ${isSolid ? 'bg-primary' : 'bg-primary-subtle'}`}
              style={{ height: isSolid ? `var(${token})` : '16px', width: isSolid ? '100%' : `var(${token})` }}
            />
          </div>
        </div>
      )
    }
    return (
      <div className="max-w-2xl">
        <div className="grid gap-x-4 pb-2 border-b border-border mb-1"
          style={{ gridTemplateColumns: '200px 1fr 1fr' }}>
          <span />
          <span className="text-caption text-fg-muted">md（預設）</span>
          <span className="text-caption text-fg-muted">lg</span>
        </div>
        <p className="py-2 text-caption font-medium text-fg-muted">Field Height</p>
        <Row label="--field-height-lg" token="--field-height-lg" isSolid />
        <Row label="--field-height-md" token="--field-height-md" isSolid />
        <Row label="--field-height-sm" token="--field-height-sm" isSolid />
        <p className="py-2 text-caption font-medium text-fg-muted">Table Row</p>
        <Row label="--table-row-lg" token="--table-row-lg" isSolid />
        <Row label="--table-row-md" token="--table-row-md" isSolid />
        <Row label="--table-row-sm" token="--table-row-sm" isSolid />
        <p className="py-2 text-caption font-medium text-fg-muted">Layout Space — 版面間距</p>
        <Row label="--layout-space-loose" token="--layout-space-loose" isSolid={false} />
        <Row label="--layout-space-tight" token="--layout-space-tight" isSolid={false} />
      </div>
    )
  },
}


// ── 2. UI Size ───────────────────────────────────────────────────────────────

export const UISize: Story = {
  name: 'UI Size',
  parameters: {
    docs: {
      description: {
        story: '元件高度 semantic token。Field height 用於 Button、TextField 等互動元件。Table row 用於 DataTable。',
      },
    },
  },
  render: () => (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="mb-2 text-caption font-medium text-fg-muted">Field Height（Button、TextField、SelectionItem）</p>
        <ColHeader />
        <TokenRow attr="data-ui-size" token="--field-height-xs" md="24px" lg="24px" />
        <TokenRow attr="data-ui-size" token="--field-height-sm" md="28px" lg="32px" />
        <TokenRow attr="data-ui-size" token="--field-height-md" md="32px" lg="36px" />
        <TokenRow attr="data-ui-size" token="--field-height-lg" md="36px" lg="40px" />
      </div>
      <div>
        <p className="mb-2 text-caption font-medium text-fg-muted">Table Row（DataTable）</p>
        <ColHeader />
        <TokenRow attr="data-ui-size" token="--table-row-sm" md="32px" lg="40px" />
        <TokenRow attr="data-ui-size" token="--table-row-md" md="40px" lg="48px" />
        <TokenRow attr="data-ui-size" token="--table-row-lg" md="48px" lg="56px" />
      </div>
    </div>
  ),
}


// ── 3. Layout Space ──────────────────────────────────────────────────────────

const LS_COLS = '220px 1fr 80px 1fr 80px'

export const LayoutSpace: Story = {
  name: 'Layout Space',
  parameters: {
    docs: {
      description: {
        story: '版面間距 token。用於頁面側邊、header 內距、底部留白。',
      },
    },
  },
  render: () => (
    <div className="max-w-2xl">
      <ColHeader cols={LS_COLS} />
      <TokenRow attr="data-layout-space" cols={LS_COLS} token="--layout-space-loose"  md="16px" lg="24px" desc="頁面側邊、內容區外層" isSolid={false} />
      <TokenRow attr="data-layout-space" cols={LS_COLS} token="--layout-space-tight"  md="12px" lg="16px" desc="Header 上下內距" isSolid={false} />
      <TokenRow attr="data-layout-space" cols={LS_COLS} token="--layout-space-bottom" md="48px" lg="48px" desc="頁面底部留白" isSolid={false} />
    </div>
  ),
}


// ── 4. Page Layout ───────────────────────────────────────────────────────────

export const PageLayout: Story = {
  name: 'Page Layout',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story: '兩種密度下的版面呼吸感對比。左側 md，右側 lg。',
      },
    },
  },
  render: () => {
    const Page = ({ mode }: { mode: 'md' | 'lg' }) => (
      <div data-density={mode} className="flex-1 border-r border-border last:border-0">
        <div
          className="border-b border-border bg-surface flex items-center"
          style={{ paddingLeft: 'var(--layout-space-loose)', paddingRight: 'var(--layout-space-loose)', paddingTop: 'var(--layout-space-tight)', paddingBottom: 'var(--layout-space-tight)' }}
        >
          <span className="text-caption font-medium text-fg-secondary">
            {mode.toUpperCase()} density
          </span>
        </div>
        <div style={{ padding: `var(--layout-space-tight) var(--layout-space-loose)` }}>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 rounded-md bg-neutral-hover" />
            ))}
          </div>
        </div>
        <div style={{ height: 'var(--layout-space-bottom)', borderTop: '1px dashed var(--border)' }}
          className="flex items-center justify-center">
          <span className="text-caption text-fg-muted">bottom space</span>
        </div>
      </div>
    )

    return (
      <div className="flex min-h-64">
        <Page mode="md" />
        <Page mode="lg" />
      </div>
    )
  },
}

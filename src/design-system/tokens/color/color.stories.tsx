import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'

const meta: Meta = {
  title: 'Design System/Tokens/Color',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
色彩 token 系統。元件只使用語義 token，不直接引用原始色票。

完整規則：\`src/design-system/tokens/color/color.spec.md\`
        `,
      },
    },
  },
}

export default meta
type Story = StoryObj


// ── Helpers ──────────────────────────────────────────────────────────────────

function SwatchBg({
  bg,
  label,
  desc,
  bordered = false,
}: {
  bg: string
  label: string
  desc: string
  bordered?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <div
        className={`h-14 w-full rounded-md ${bordered ? 'border border-border' : ''}`}
        style={{ background: bg }}
      />
      <code className="block text-caption font-medium">{label}</code>
      <span className="block text-caption text-fg-muted">{desc}</span>
    </div>
  )
}

function SwatchText({
  className,
  label,
  desc,
}: {
  className: string
  label: string
  desc: string
}) {
  return (
    <div className="border-b border-border py-3 last:border-0">
      <p className={`text-body mb-1 ${className}`}>
        此操作將永久刪除該筆資料，確認後無法復原。
      </p>
      <div className="flex gap-3">
        <code className="text-caption font-medium">{label}</code>
        <span className="text-caption text-fg-muted">{desc}</span>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption font-medium uppercase tracking-wider text-fg-muted">
      {children}
    </p>
  )
}


// ── 1. Primitives ────────────────────────────────────────────────────────────

export const Primitives: Story = {
  name: 'Primitives',
  parameters: {
    docs: {
      description: {
        story:
          '原始色票（Layer 1）。元件**不得直接使用**，一律透過語義 token。\n\n' +
          '**已映射為語義 token 的色相：** blue → primary、deep-orange → error、green → success、yellow → warning、red → notification\n\n' +
          '**其餘色相（orange、amber、lime、turquoise、indigo、purple、magenta）** 保留給 data visualization、categorization tag、avatar 等需要多色區分的場景。',
      },
    },
  },
  render: () => {
    const SEMANTIC_MAP: Record<string, string> = {
      blue: 'primary',
      'deep-orange': 'error',
      green: 'success',
      yellow: 'warning',
      red: 'notification',
    }
    const HUES: Array<{ name: string; suffix?: string }> = [
      { name: 'neutral', suffix: '-opaque' },
      { name: 'blue' },
      { name: 'deep-orange' },
      { name: 'orange' },
      { name: 'amber' },
      { name: 'yellow' },
      { name: 'lime' },
      { name: 'green' },
      { name: 'turquoise' },
      { name: 'indigo' },
      { name: 'purple' },
      { name: 'magenta' },
      { name: 'red' },
    ]
    return (
      <div className="space-y-1 max-w-2xl">
        <div className="grid pb-2 border-b border-border mb-2" style={{ gridTemplateColumns: '160px repeat(9, 1fr)' }}>
          <span className="text-caption text-fg-muted">hue</span>
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <span key={n} className="text-caption text-fg-muted text-center">{n}</span>
          ))}
        </div>
        {HUES.map(({ name, suffix = '' }) => {
          const semantic = SEMANTIC_MAP[name]
          return (
            <div key={name} className="grid items-center gap-x-1 py-0.5" style={{ gridTemplateColumns: '160px repeat(9, 1fr)' }}>
              <div className="flex items-center gap-1.5 truncate">
                <span className="text-caption text-fg-muted">{name}</span>
                {semantic && <span className="text-footnote text-[var(--primary)] font-medium">→ {semantic}</span>}
              </div>
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <div
                  key={n}
                  className="h-6 rounded-sm border border-[var(--black-a06)]"
                  style={{ background: `var(--color-${name}-${n}${suffix})` }}
                  title={`--color-${name}-${n}${suffix}`}
                />
              ))}
            </div>
          )
        })}
        <p className="pt-3 text-caption text-fg-muted">
          neutral 顯示 opaque 版本。-6 為基底色，其餘由相對色語法推導。無 → 標記的色相保留給 data visualization / categorization。
        </p>
      </div>
    )
  },
}


// ── 2. Surface ───────────────────────────────────────────────────────────────

export const Surface: Story = {
  name: 'Surface',
  parameters: {
    docs: {
      description: {
        story:
          'Surface = 空間容器（內容坐在上面的背景），不帶語義。' +
          'canvas → surface → surface-raised 三層由底到高疊加。overlay / tooltip-bg 也屬於 surface（空間用途）。',
      },
    },
  },
  render: () => (
    <div className="max-w-xl space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <SwatchBg bg="var(--canvas)"         bordered label="bg-canvas"         desc="頁面最底層背景" />
        <SwatchBg bg="var(--surface)"        bordered label="bg-surface"        desc="card、sidebar、table" />
        <SwatchBg bg="var(--surface-raised)" bordered label="bg-surface-raised" desc="modal、popover、dropdown" />
      </div>
      <div className="grid grid-cols-2 gap-4 max-w-sm">
        <div className="space-y-1.5">
          <div className="h-14 w-full rounded-md border border-border" style={{ background: 'var(--overlay)' }} />
          <code className="block text-caption font-medium">bg-overlay</code>
          <span className="block text-caption text-fg-muted">dialog backdrop 遮罩</span>
        </div>
        <div className="space-y-1.5">
          <div className="h-14 w-full rounded-md flex items-center justify-center" style={{ background: 'var(--tooltip-bg)' }}>
            <span className="text-caption text-white">tooltip</span>
          </div>
          <code className="block text-caption font-medium">bg-tooltip-bg</code>
          <span className="block text-caption text-fg-muted">tooltip 深色底（不透明）</span>
        </div>
      </div>
    </div>
  ),
}


// ── 3. Text ──────────────────────────────────────────────────────────────────

export const Text: Story = {
  name: 'Text',
  parameters: {
    docs: {
      description: {
        story:
          '文字從主要資訊到 disabled 的四個層級。一律使用 neutral alpha token，疊加在任何背景都能維持對比。',
      },
    },
  },
  render: () => (
    <div className="max-w-xl">
      <SwatchText className="text-foreground"   label="text-foreground"   desc="主要文字、一般資訊" />
      <SwatchText className="text-fg-secondary" label="text-fg-secondary" desc="次要資訊" />
      <SwatchText className="text-fg-muted"     label="text-fg-muted"     desc="placeholder、弱化 icon" />
      <SwatchText className="text-fg-disabled"  label="text-fg-disabled"  desc="disabled 文字" />
    </div>
  ),
}


// ── 4. Semantic ──────────────────────────────────────────────────────────────

export const Semantic: Story = {
  name: 'Semantic',
  parameters: {
    docs: {
      description: {
        story:
          '所有語義 token 一覽：Action、Status、Brand、Border。' +
          'subtle 為淡底填充，用於 tag、banner、checked 背景。',
      },
    },
  },
  render: () => (
    <div className="max-w-2xl space-y-8">
      {/* Action */}
      <div>
        <SectionLabel>Action — Primary（操作 + 進程指示）</SectionLabel>
        <p className="mt-1 mb-3 text-caption text-fg-muted">
          primary 同時服務 Action（按鈕、連結）和 Progress（進度條、active nav、step indicator）兩種語義。
        </p>
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <SwatchBg bg="var(--primary)"        label="bg-primary"        desc="主要操作色 / 進程色" />
          <SwatchBg bg="var(--primary-subtle)" bordered label="bg-primary-subtle" desc="淡底填充 / checked 底" />
        </div>
      </div>

      {/* Status */}
      <div>
        <SectionLabel>Status</SectionLabel>
        <div className="mt-3 grid grid-cols-4 gap-4">
          <SwatchBg bg="var(--error)"        label="bg-error"        desc="錯誤 / 危險" />
          <SwatchBg bg="var(--success)"      label="bg-success"      desc="成功" />
          <SwatchBg bg="var(--warning)"      label="bg-warning"      desc="警告" />
          <SwatchBg bg="var(--notification)" label="bg-notification" desc="未讀計數 / 通知紅點" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <SwatchBg bg="var(--error-subtle)"   bordered label="bg-error-subtle"   desc="淡底" />
          <SwatchBg bg="var(--success-subtle)" bordered label="bg-success-subtle" desc="淡底" />
          <SwatchBg bg="var(--warning-subtle)" bordered label="bg-warning-subtle" desc="淡底" />
        </div>
      </div>

      {/* Brand */}
      <div>
        <SectionLabel>Brand</SectionLabel>
        <div className="max-w-xs mt-3">
          <SwatchBg bg="var(--tsmc-logo)" label="bg-tsmc-logo" desc="品牌紅 #DF3232，固定色" />
        </div>
      </div>

      {/* Border */}
      <div>
        <SectionLabel>Border</SectionLabel>
        <div className="mt-3 space-y-2.5">
          {[
            { label: 'border-border',  desc: '元件標準邊框',   style: { border: '2px solid var(--border)' } },
            { label: 'border-divider', desc: '分隔線（更淡）', style: { borderBottom: '2px solid var(--divider)' } },
          ].map(({ label, desc, style }) => (
            <div key={label} className="flex items-center gap-4">
              <div className="h-10 w-24 rounded-md bg-surface" style={style} />
              <div>
                <code className="text-caption font-medium">{label}</code>
                <span className="ml-2 text-caption text-fg-muted">{desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
}


// ── 5. Interactive ───────────────────────────────────────────────────────────

export const Interactive: Story = {
  name: 'Interactive',
  parameters: {
    docs: {
      description: {
        story:
          '互動色的三種狀態。使用語義 token（`bg-primary-hover`），不直接引用 primitive step。\n\n' +
          '```tsx\n' +
          '<a className="text-primary hover:text-primary-hover">連結</a>\n' +
          '<button className="bg-primary hover:bg-primary-hover active:bg-primary-active" />\n' +
          '```\n\n' +
          '> 色盤對應（內部實作）：-1 = subtle、-5 = hover、-6 = base、-7 = active。\n\n' +
          '---\n\n' +
          '#### Neutral Interaction\n\n' +
          '低調互動背景，用於 list row、tree node。',
      },
    },
  },
  render: () => (
    <div className="max-w-lg space-y-8">
      {/* Colored interactive states */}
      {[
        { name: 'Primary', prefix: 'primary', hover: '--primary-hover', base: '--primary', active: '--primary-active' },
        { name: 'Error',   prefix: 'error',   hover: '--error-hover',   base: '--error',   active: '--error-active' },
        { name: 'Success', prefix: 'success', hover: '--success-hover', base: '--success', active: '--success-active' },
        { name: 'Warning', prefix: 'warning', hover: '--warning-hover', base: '--warning', active: '--warning-active' },
      ].map(({ name, prefix, hover, base, active }) => (
        <div key={name}>
          <span className="text-caption text-fg-muted mb-1.5 block">{name}</span>
          <div className="grid grid-cols-3 gap-2">
            <SwatchBg bg={`var(${hover})`}  label="hover"  desc={`bg-${prefix}-hover`} />
            <SwatchBg bg={`var(${base})`}   label="base"   desc={`bg-${prefix}`} />
            <SwatchBg bg={`var(${active})`} label="active" desc={`bg-${prefix}-active`} />
          </div>
        </div>
      ))}

      {/* Ghost */}
      <div>
        <SectionLabel>Neutral Interaction — 低調互動背景（list row、tree node）</SectionLabel>
        <div className="mt-3 space-y-1">
          {[
            { label: '正常狀態（無背景）', bg: 'transparent',           token: '' },
            { label: 'Hover 狀態',         bg: 'var(--neutral-hover)',     token: 'bg-neutral-hover' },
            { label: 'Selected 狀態',      bg: 'var(--neutral-selected)', token: 'bg-neutral-selected' },
          ].map(({ label, bg, token }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-body"
              style={{ background: bg }}
            >
              <span className="h-4 w-4 shrink-0 rounded-sm bg-[var(--neutral-selected)]" />
              <span className="flex-1">{label}</span>
              {token && <code className="text-caption text-fg-muted">{token}</code>}
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
}
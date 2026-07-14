// @story-baseline: tokens/density/density.stories.tsx#UISize — token bar 展示慣例同源;本頁展示 size-tier 軸(xs/sm/md/lg + icon 兩 tier),density md/lg 軸在 Tokens/Density 不重複
import type { Meta, StoryObj } from '@storybook/react'
import { Download } from 'lucide-react'
import { ICON_SIZE } from './icon-size'

const meta: Meta = {
  title: 'Design System/Tokens/UiSize',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
元件高度的語義 token(rem 單位,尊重使用者瀏覽器字體設定)。\`--field-height-*\` 是核心家族——Button / Input / Select 等互動元件共享 **default \`md\`**;另有 table-row / tab-height / chrome-header 等家族(見 spec)。

完整規則:\`packages/design-system/src/tokens/uiSize/uiSize.spec.md\`(family 成員清單 / default md 硬規則 / icon 兩 tier / chrome header 選型)

**md ↔ lg density 軸**的對照展示在 \`Design System/Tokens/Density\`,本頁不重複;此處展示 **size tier 軸**(xs / sm / md / lg)與 icon 尺寸的離散配對。
        `,
      },
    },
  },
}

export default meta
type Story = StoryObj


function HeightRow({ token, px, usage, isDefault }: {
  token: string; px: string; usage: string; isDefault?: boolean
}) {
  return (
    <div className="grid items-center gap-x-6 border-b border-border py-3 last:border-0"
      style={{ gridTemplateColumns: '200px 160px 60px 1fr' }}>
      <div>
        <code className="block text-caption font-medium text-fg-secondary">{token}</code>
        {isDefault && <span className="text-caption text-fg-muted">★ family default</span>}
      </div>
      <div
        className="rounded-md bg-primary"
        style={{ height: `var(${token})`, width: '100%' }}
      />
      <span className="text-caption font-mono text-fg-muted">{px}</span>
      <span className="text-body text-foreground">{usage}</span>
    </div>
  )
}

function IconTierRow({ tier, iconPx, note }: { tier: string; iconPx: number; note: string }) {
  return (
    <div className="grid items-center gap-x-6 border-b border-border py-3 last:border-0"
      style={{ gridTemplateColumns: '260px 120px 1fr' }}>
      <code className="text-caption font-medium text-fg-secondary">{tier}</code>
      <div className="flex items-center gap-2">
        <Download size={iconPx} className="text-foreground" aria-hidden />
        <span className="text-caption font-mono text-fg-muted">{iconPx}px</span>
      </div>
      <span className="text-body text-foreground">{note}</span>
    </div>
  )
}


export const Overview: Story = {
  name: '總覽',
  render: () => (
    <div className="max-w-3xl">
      <h2 className="text-h3 mb-2">Field Height</h2>
      <p className="text-body text-fg-secondary mb-4">
        Button / Input / Checkbox SelectionItem 等互動元件的高度。一般 field family 消費者
        <strong>不傳 size 時預設 md</strong>——Form / Toolbar 並排多控件默認等高。
        documented carve-outs 例外:Rating standalone 預設 xs(Field 內才跟 md)、
        Chip 等單一尺寸消費者不在 default-md 規則內(uiSize.spec.md「單一尺寸消費者」段)。
        下列為 md density 預設值(lg density 對照見 Tokens/Density)。
      </p>

      <HeightRow token="--field-height-xs" px="24px" usage="密集 UI 地板高度;固定不隨 density 縮放。獨立互動元件不得低於此高度" />
      <HeightRow token="--field-height-sm" px="28px" usage="輕量浮層(Popover body / footer)內的控件尺寸" />
      <HeightRow token="--field-height-md" px="32px" usage="Form / Dialog / 一般頁面的控件尺寸" isDefault />
      <HeightRow token="--field-height-lg" px="36px" usage="需要更大點擊目標的場景;同時切換到大 icon tier(20px)" />

      <h2 className="text-h3 mb-2 mt-10">Icon 尺寸兩 tier</h2>
      <p className="text-body text-fg-secondary mb-4">
        Icon 尺寸由元件引用的 field-height token 決定——離散兩組配對,無中間值、不需公式。
        程式化 SSOT 是 <code>ICON_SIZE</code> 常數(本表直接消費真值渲染)。
      </p>

      <IconTierRow
        tier="field-height-xs / sm / md"
        iconPx={ICON_SIZE.sm}
        note="搭配 text-body(14px);Checkbox / Radio 控件同 16px"
      />
      <IconTierRow
        tier="field-height-lg"
        iconPx={ICON_SIZE.lg}
        note="搭配 text-body-lg(16px);Checkbox / Radio 控件同 20px"
      />

      <p className="text-caption text-fg-muted mt-6">
        Stroke icon 下限 12px(僅出現在 Checkbox 等指示器內部);Rating / Avatar 等 8 個 carve-out
        見 <code>uiSize.spec.md</code>「跨 regime pointer index」。table-row / tab-height /
        chrome-header 等其餘 uiSize 家族與選型 decision tree 同見該 spec。
      </p>
    </div>
  ),
}

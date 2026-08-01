import type { Meta, StoryObj } from '@storybook/react'

const meta: Meta = {
  title: 'Design System/Tokens/Typography',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
字體 token 系統。token 只定義 \`font-size\` 與 \`line-height\`，\`font-weight\` 由使用端疊加。

完整規則：\`packages/design-system/src/tokens/typography/typography.spec.md\`
        `,
      },
    },
  },
}

export default meta
type Story = StoryObj


// ── Helpers ─────────────────────────────────────────────────────────────────

function TypeRow({ utility, meta, sample }: { utility: string; meta: string; sample: string }) {
  return (
    <div className="grid items-baseline gap-x-6 gap-y-1 border-b border-border py-4 last:border-0"
      style={{ gridTemplateColumns: '180px 1fr' }}>
      <div>
        <code className="block text-caption font-medium text-fg-secondary">{utility}</code>
        <span className="text-caption text-fg-muted">{meta}</span>
      </div>
      <div className={utility}>{sample}</div>
    </div>
  )
}


// ── Stories ──────────────────────────────────────────────────────────────────

export const TypeScale: Story = {
  name: '字型尺寸',
  parameters: {
    docs: {
      description: {
        story: '所有 typography role 的視覺對照。font-weight 預設 400，line-height 已烤進各 token。',
      },
    },
  },
  render: () => (
    <div className="max-w-2xl">
      <TypeRow utility="text-h1"       meta="48px · lh 1.3" sample="頁面主標題 Page Title" />
      <TypeRow utility="text-h2"       meta="32px · lh 1.3" sample="區塊標題 Section Heading" />
      <TypeRow utility="text-h3"       meta="24px · lh 1.3" sample="子區塊標題 Subsection" />
      <TypeRow utility="text-h4"       meta="20px · lh 1.3" sample="小節標題 Group Title" />
      <TypeRow utility="text-h5"       meta="16px · lh 1.3" sample="元件層級標題 Component Heading" />
      <TypeRow utility="text-h6"       meta="14px · lh 1.3" sample="最小層級標題 Inline Label" />
      <TypeRow utility="text-body-lg"  meta="16px · lh 1.5" sample="16px 版面的段落內文。充足的行距讓視線流暢移動，適合較寬鬆的閱讀情境。" />
      <TypeRow utility="text-body"     meta="14px · lh 1.5" sample="主要內文基準。產品中絕大多數的說明文字、列表內容、表單說明都使用這個尺寸。" />
      <TypeRow utility="text-caption"  meta="12px · lh 1.3" sample="圖表附註、helper text、標籤文字" />
      <TypeRow utility="text-footnote" meta="10px · lh 1.3" sample="法律文字、來源標注（極少用）" />
    </div>
  ),
}


export const FontWeight: Story = {
  name: '字重',
  parameters: {
    docs: {
      description: {
        story:
          'font-weight 不寫死在 token，由使用端疊加。' +
          '`font-medium`（500）對應中等強調，`font-bold`（700）對應 `<strong>`。',
      },
    },
  },
  render: () => (
    <div className="max-w-lg space-y-1">
      {[
        { label: '（預設）font-normal', cls: 'font-normal', weight: '400' },
        { label: 'font-medium',         cls: 'font-medium', weight: '500' },
        { label: 'font-bold',           cls: 'font-bold',   weight: '700' },
      ].map(({ label, cls, weight }) => (
        <div key={weight} className="flex items-baseline gap-6 border-b border-border py-3 last:border-0">
          <div className="w-44 shrink-0">
            <code className="text-caption font-medium text-fg-secondary">{label}</code>
            <span className="ml-2 text-caption text-fg-muted">{weight}</span>
          </div>
          <p className={`text-body ${cls}`}>
            此操作將永久刪除該筆資料，請確認後再繼續。
          </p>
        </div>
      ))}
    </div>
  ),
}


export const LineHeight: Story = {
  name: '行高',
  parameters: {
    docs: {
      description: {
        story:
          '`text-body` / `text-body-lg`（14/16px）唯二可覆蓋行高的 token，預設 1.5（閱讀段落），' +
          '可 `leading-compact` 覆蓋為 1.3 — 唯一合理情境是「單行固定高度容器」' +
          '（Button / Tabs trigger / Chip / Notice / MenuItem 等），避免 1lh > chrome height 造成垂直偏移。' +
          'h1-h6 / caption / footnote 全 lh 1.3 固定不可覆蓋。',
      },
    },
  },
  render: () => (
    <div className="grid max-w-2xl grid-cols-2 gap-6">
      <div>
        <code className="mb-2 block text-caption font-medium text-fg-secondary">
          text-body · leading-normal (1.5)
        </code>
        <p className="text-body leading-normal rounded-md bg-neutral-hover p-4">
          適合連續閱讀的段落內文。充足的行距讓眼睛在換行時容易找到下一行的起點，降低閱讀疲勞。
        </p>
      </div>
      <div>
        <code className="mb-2 block text-caption font-medium text-fg-secondary">
          text-body · leading-compact (1.3)
        </code>
        <p className="text-body leading-compact rounded-md bg-neutral-hover p-4">
          適合單行固定高度容器內文字（Button / Tabs trigger / Chip / Notice / MenuItem 等），避免 1lh 大於容器高度造成垂直偏移。
        </p>
      </div>
    </div>
  ),
}

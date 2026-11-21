import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '@/design-system/components/Button/button'
import { Toaster, toast } from '@/design-system/components/Toast/toast'
import { TutorialPage, TutorialSection } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Tokens/Density',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
\`data-density\` 統一控制 **UI Size**（元件高度 / 內距）與 **Layout Space**（版面間距）。

- **md**（預設）：緊湊，適合資訊密集的桌面 UI
- **lg**：元件高度與版面間距都放大一階（例：欄位高 md 32 → lg 36）

底層仍可用 \`data-ui-size\` / \`data-layout-space\` 單獨控制（逃生艙）。
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
    // @layout-space-magic-ok: token 表表頭列幾何 —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值)
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
    // @layout-space-magic-ok: token 表同質列 —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值)
    <div className="grid items-center gap-x-4 border-b border-border py-3 last:border-0"
      style={{ gridTemplateColumns: cols }}>
      <div>
        <code className="block text-caption font-medium text-fg-secondary">{token}</code>
        {desc && <span className="text-caption text-fg-muted">{desc}</span>}
      </div>
      {/* md */}
      <div {...{ [attr]: 'md' }}>
        <div
          className={`rounded-md ${isSolid ? 'bg-primary' : 'bg-primary-subtle'}`}
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

// 2026-09-17:這個元件本來定義在 story 的 `render()` 裡面。React 用「元件函式的身分」判斷是不是同一棵樹,
// 每次 setState 都會重新建立一個新的函式 → React 視為換了元件 → 底下整棵樹**卸載重掛**。
// 在 DataTable 那支上的實際後果:篩選面板一開著,點任何一個選項(不是只有新的全選按鈕)整個面板就消失。
// 抓到它的是 `scripts/select-all-footer-invariant.mjs`;同一天全 DS 掃出同一寫法五處,一起搬出來。
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
    <div style={{ padding: `var(--layout-space-tight) var(--layout-space-loose) 0` }}>
      {/* @layout-space-magic-ok: 密度示意頁內三條同質佔位列 —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值) */}
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-8 rounded-md bg-neutral-hover" />
        ))}
      </div>
    </div>
    {/* 按鈕跟在內容後:上方 = loose(layoutSpace.spec.md 規則 3;上方三條是同質佔位列、不是表單欄位 —— 表單欄位 → 表單按鈕列才是「組 ↔ 組」loose × 2;
        規則 4 核心「內容 → 按鈕」跟「最後一個東西 → 容器底邊」是兩回事)。
        動作列沒有標題 → 靠左(action-bar.spec.md:109;2026-10-20 XF-01:原本 justify-end 靠右) */}
    <div
      className="flex"
      style={{ padding: `var(--layout-space-loose) var(--layout-space-loose) 0` }}
    >
      <Button variant="primary" onClick={() => toast({ variant: 'success', title: '已儲存變更' })}>儲存變更</Button>
    </div>
    {/* 按鈕 → 整頁底 = bottom 48:整頁高度撐滿、最後是一般元素(layoutSpace.spec.md 規則 4 第 1 列;user 2026-10-28 對整頁 Main 改 48
        回「這個沒問題」)。2026-07-14 audit Dim 68 之後這段 48 一度畫在「內容 → 按鈕」之間,照規則 4 改回 body 最後一個元素之下。 */}
    <div style={{ height: 'var(--layout-space-bottom)', borderTop: '1px dashed var(--border)' }}
      className="flex items-center justify-center">
      <span className="text-caption text-fg-muted">bottom 48 — 最後一個元素 → 整頁底</span>
    </div>
  </div>
)

export const Overview: Story = {
  name: '總覽',
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
        // @layout-space-magic-ok: token 表同質列 —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值)
        <div className="grid items-center gap-x-4 border-b border-border py-2.5 last:border-0"
          style={{ gridTemplateColumns: '200px 1fr 1fr' }}>
          <code className="text-caption font-medium text-fg-secondary">{label}</code>
          <div data-density="md">
            <div
              className={`rounded-md ${isSolid ? 'bg-primary' : 'bg-primary-subtle'}`}
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
        {/* @layout-space-magic-ok: token 表表頭列幾何 —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值) */}
        <div className="grid gap-x-4 pb-2 border-b border-border mb-1"
          style={{ gridTemplateColumns: '200px 1fr 1fr' }}>
          <span />
          <span className="text-caption text-fg-muted">md（預設）</span>
          <span className="text-caption text-fg-muted">lg</span>
        </div>
        {/* @layout-space-magic-ok: token 表分組標題列的列內距 —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值) */}
        <p className="py-2 text-caption font-medium text-fg-muted">Field Height</p>
        <Row label="--field-height-lg" token="--field-height-lg" isSolid />
        <Row label="--field-height-md" token="--field-height-md" isSolid />
        <Row label="--field-height-sm" token="--field-height-sm" isSolid />
        {/* @layout-space-magic-ok: token 表分組標題列的列內距 —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值) */}
        <p className="py-2 text-caption font-medium text-fg-muted">Table Row</p>
        <Row label="--table-row-lg" token="--table-row-lg" isSolid />
        <Row label="--table-row-md" token="--table-row-md" isSolid />
        <Row label="--table-row-sm" token="--table-row-sm" isSolid />
        {/* @layout-space-magic-ok: token 表分組標題列的列內距 —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值) */}
        <p className="py-2 text-caption font-medium text-fg-muted">Layout Space — 版面間距</p>
        <Row label="--layout-space-loose" token="--layout-space-loose" isSolid={false} />
        <Row label="--layout-space-tight" token="--layout-space-tight" isSolid={false} />
      </div>
    )
  },
}


// ── 2. UI Size ───────────────────────────────────────────────────────────────

export const UISize: Story = {
  name: 'UI 尺寸',
  parameters: {
    docs: {
      description: {
        story: '元件高度 semantic token。Field height 用於 Button、Input 等互動元件。Table row 用於 DataTable。',
      },
    },
  },
  render: () => (
    // 段落 = 共用教學頁元件的 TutorialSection(2026-10-20 T7 甲:原本兩組表格之間只有 loose,與組內「標題 → 表格」同一個量級)
    <TutorialPage>
      {/* 表格寬 = 原本的整頁 max-w-2xl(頁根不再自訂寬,BA-tutorial-width) */}
      <TutorialSection title="Field Height（Button、Input、SelectionItem）">
        <div className="max-w-2xl">
          <ColHeader />
          <TokenRow attr="data-ui-size" token="--field-height-xs" md="24px" lg="24px" />
          <TokenRow attr="data-ui-size" token="--field-height-sm" md="28px" lg="32px" />
          <TokenRow attr="data-ui-size" token="--field-height-md" md="32px" lg="36px" />
          <TokenRow attr="data-ui-size" token="--field-height-lg" md="36px" lg="40px" />
        </div>
      </TutorialSection>
      <TutorialSection title="Table Row（DataTable）">
        <div className="max-w-2xl">
          <ColHeader />
          <TokenRow attr="data-ui-size" token="--table-row-sm" md="32px" lg="40px" />
          <TokenRow attr="data-ui-size" token="--table-row-md" md="40px" lg="48px" />
          <TokenRow attr="data-ui-size" token="--table-row-lg" md="48px" lg="56px" />
        </div>
      </TutorialSection>
    </TutorialPage>
  ),
}


// ── 3. Layout Space ──────────────────────────────────────────────────────────

const LS_COLS = '220px 1fr 80px 1fr 80px'

export const LayoutSpace: Story = {
  name: '版面間距',
  parameters: {
    docs: {
      description: {
        story: '版面間距 token。用於頁面側邊、header 內距、body 收尾的結論留白。',
      },
    },
  },
  render: () => (
    <div className="max-w-2xl">
      <ColHeader cols={LS_COLS} />
      <TokenRow attr="data-layout-space" cols={LS_COLS} token="--layout-space-loose"  md="16px" lg="24px" desc="頁面側邊、內容區外層" isSolid={false} />
      <TokenRow attr="data-layout-space" cols={LS_COLS} token="--layout-space-tight"  md="12px" lg="16px" desc="Header 上下內距" isSolid={false} />
      {/* 2026-07-14 audit Dim 68:bottom ≠ 通用「頁面底部留白」— layoutSpace.spec.md 定義為
          「結論留白」(body 收尾);容器底看最後一個東西(spec 規則 4)*/}
      <TokenRow attr="data-layout-space" cols={LS_COLS} token="--layout-space-bottom" md="48px" lg="48px" desc="body 收尾的結論留白" isSolid={false} />
    </div>
  ),
}


// ── 4. Page Layout ───────────────────────────────────────────────────────────

export const PageLayout: Story = {
  name: '頁面版型',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story: '兩種密度下的版面呼吸感對比。左側 md，右側 lg。',
      },
    },
  },
  render: () => {

    return (
      <>
        <div className="flex min-h-64">
          <Page mode="md" />
          <Page mode="lg" />
        </div>
        {/* 「儲存變更」的回饋 Toast(toast.spec.md:每個獨立 story root 一個 Toaster) */}
        <Toaster />
      </>
    )
  },
}

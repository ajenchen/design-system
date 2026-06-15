// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#NumberAlignment
// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @anatomy-rationale:
//   StateBehavior represented as OrientationBehavior — ScrollArea 是 OS chrome
//     類功能性 primitive,thumb 唯一狀態(default / hover)已於 ColorMatrix 展示。
//     真正的行為差異是 orientation(vertical / horizontal / both)與 type(hover /
//     scroll / always / auto)顯示時機,由 OrientationBehavior(5.)涵蓋。
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { ScrollArea, ScrollBar } from './scroll-area'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types' // ColumnMeta declaration merging
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/ScrollArea/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// 真實 Notion sidebar 頁面清單 — 垂直捲動 preview 內容(對齊展示頁 NOTION_NAV)
const NOTION_PAGES = [
  'Getting Started', 'Daily journal', 'Reading list', 'Recipes', 'Weekend projects',
  'Japan 2026 trip', 'Engineering wiki', 'Design system spec', 'Meeting notes',
  'Roadmap Q2', 'Incident retrospectives', 'Onboarding docs', 'Product handbook',
  'Brand guidelines', 'Customer interviews', 'Competitive analysis', 'Press & media kit',
  'Hiring pipeline',
]

const PreviewList = ({ count = 20 }: { count?: number }) => (
  <div className="p-2">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="px-3 py-2 text-caption border-b border-divider last:border-b-0">
        {NOTION_PAGES[i % NOTION_PAGES.length]}
      </div>
    ))}
  </div>
)

// 寬欄位商品表 — 水平捲動 demo 內容,消費真 DataTable(per data-table.spec.md「簡單展示場景
// 也用 DataTable」;對齊展示頁 HorizontalProductTable 同模式)。height="auto" + min-w-max:
// DataTable 無高度約束、不啟內部捲軸,捲動完全由外層 ScrollArea own。
type StripeProduct = {
  sku: string; name: string; category: string; stock: number
  price: string; margin: string; channel: string; status: string
}

const STRIPE_PRODUCTS: StripeProduct[] = [
  { sku: 'PRO-001', name: 'Stripe Atlas 新創設立方案', category: 'Incorporation', stock: 128, price: '$500.00', margin: '42%', channel: 'Direct', status: 'Active' },
  { sku: 'PRO-002', name: 'Stripe Radar 詐欺偵測加購', category: 'Add-on', stock: 256, price: '$0.05/tx', margin: '78%', channel: 'Direct', status: 'Active' },
  { sku: 'PRO-003', name: 'Stripe Tax 自動稅額計算', category: 'Compliance', stock: 64, price: '$0.50/tx', margin: '65%', channel: 'Partner', status: 'Active' },
  { sku: 'PRO-004', name: 'Stripe Connect 分潤平台帳號', category: 'Platform', stock: 32, price: '$2/acct', margin: '55%', channel: 'Direct', status: 'Beta' },
  { sku: 'PRO-005', name: 'Stripe Issuing 實體卡發行', category: 'Cards', stock: 16, price: '$3/card', margin: '38%', channel: 'Partner', status: 'Active' },
  { sku: 'PRO-006', name: 'Stripe Climate 碳移除貢獻', category: 'Sustainability', stock: 8, price: '1% gross', margin: '—', channel: 'Direct', status: 'Active' },
]

const productCol = createColumnHelper<StripeProduct>()

const PRODUCT_COLUMNS = [
  productCol.accessor('sku', { header: 'SKU', meta: { type: 'string', width: 100 } }),
  productCol.accessor('name', { header: 'Product', meta: { type: 'string', width: 240 } }),
  productCol.accessor('category', { header: 'Category', meta: { type: 'string', width: 130 } }),
  productCol.accessor('stock', { header: 'Stock', meta: { type: 'number', width: 90 } }),
  productCol.accessor('price', { header: 'Price', meta: { type: 'string', align: 'right', width: 110 } }),
  productCol.accessor('margin', { header: 'Margin', meta: { type: 'string', align: 'right', width: 90 } }),
  productCol.accessor('channel', { header: 'Channel', meta: { type: 'string', width: 100 } }),
  productCol.accessor('status', { header: 'Status', meta: { type: 'string', width: 110 } }),
]

const WideTable = () => (
  <div className="min-w-max">
    <DataTable columns={PRODUCT_COLUMNS} data={STRIPE_PRODUCTS} getRowId={(p) => p.sku} height="auto" bordered={false} />
  </div>
)

/* ═══════════════════════════════════════════════════════════════════════════
   1. 元件總覽
   ═══════════════════════════════════════════════════════════════════════════ */

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>結構(Anatomy)</H3>
        <Desc>
          ScrollArea 包 Radix 四層 primitive:Root(relative 容器)→ Viewport(實際可捲動區,內含 children)
          → Scrollbar(overlay 捲軸,10px 固定寬)→ Thumb(可抓握的圓角把手)。Root 額外包 Corner 處理雙向 scrollbar 交會。
        </Desc>
        <div className="border-2 border-dashed border-primary/30 rounded-lg p-4 max-w-xl">
          <div className="text-[11px] font-mono text-fg-muted mb-2">Root (relative + overflow-hidden)</div>
          <div className="border border-dashed border-info/50 rounded-md p-3 bg-info/5">
            <div className="text-[11px] font-mono text-info mb-2">Viewport (flex-1 min-h-0 w-full · rounded-[inherit])</div>
            <div className="border border-dashed border-success/50 rounded-md p-2 bg-success/5 text-[11px] font-mono text-success-hover">
              children (consumer 內容)
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 rounded-full bg-border" />
            <span className="text-[10px] font-mono text-fg-muted">Scrollbar + Thumb(overlay,不佔寬)</span>
          </div>
        </div>
      </div>

      <div>
        <H3>預覽 — 三種 orientation</H3>
        <div className="grid grid-cols-3 gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-footnote text-fg-muted">vertical(預設)</span>
            <ScrollArea className="h-[180px] border border-border rounded-md">
              <PreviewList count={12} />
            </ScrollArea>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-footnote text-fg-muted">horizontal</span>
            <ScrollArea className="border border-border rounded-md">
              <WideTable />
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-footnote text-fg-muted">vertical + horizontal</span>
            <ScrollArea className="h-[180px] border border-border rounded-md">
              <WideTable />
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </div>
      </div>

      <div>
        <H3>Props 速查 — ScrollArea (Radix Root)</H3>
        {/* doc-table:規格說明對照(說明文字非業務資料)— raw table 為 anatomy doc-table 慣例,不消費 DataTable */}
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['className',  'string',                            '—',       '傳入容器 className(常見:設定 height / border / rounded)'],
                ['children',   'ReactNode',                         '—',       '要被捲動的內容'],
                ['type',       "'auto'|'always'|'scroll'|'hover'",  "'hover'", 'Radix:scrollbar 顯示時機(hover = 游標進入才顯示)'],
                ['dir',        "'ltr'|'rtl'",                       "'ltr'",   '文字方向(影響 horizontal scrollbar 起點)'],
                ['scrollHideDelay', 'number',                       '600',     'type=scroll / hover 時 scrollbar 隱藏前的延遲(ms)'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Props 速查 — ScrollBar</H3>
        {/* doc-table:規格說明對照(說明文字非業務資料)— raw table 為 anatomy doc-table 慣例,不消費 DataTable */}
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['orientation', "'vertical' | 'horizontal'", "'vertical'", '捲軸方向'],
                ['className',   'string',                    '—',          '覆寫樣式(通常不需)'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. 元件檢閱器 — Preview + Blueprint + Token Panel
   ═══════════════════════════════════════════════════════════════════════════ */

export const Inspector: Story = {
  name: '元件檢閱器',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>元件檢閱器</H3>
        <Desc>即時預覽 ScrollArea 的 scrollbar 寬度、thumb token、hover 反饋。開發只需確認 token,theme / density 切換由系統處理。</Desc>
      </div>

      <div className="flex gap-6 items-start">
        {/* Left: preview */}
        <div className="flex flex-col gap-5 min-w-[340px]">
          <div className="px-6 py-6 rounded-lg bg-canvas border border-divider">
            <ScrollArea className="h-[200px] border border-border rounded-md bg-surface">
              <PreviewList count={16} />
            </ScrollArea>
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4 text-[10px]">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-md" style={{ background: 'rgba(166,208,245,0.6)', border: '1px dashed rgba(80,145,210,0.9)' }} />
                <span className="font-medium" style={{ color: 'var(--color-blue-7)' }}>Scrollbar(10px 固定)</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-md" style={{ background: 'rgba(194,225,154,0.6)', border: '1px dashed rgba(139,179,91,0.9)' }} />
                <span className="font-medium" style={{ color: 'var(--color-green-7)' }}>Thumb inset(p-[1px])</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center rounded-md shrink-0"
                style={{
                  width: 52, height: 52,
                  background: 'rgba(166,208,245,0.6)',
                  border: '1.5px dashed rgba(80,145,210,0.9)',
                }}
              >
                <span className="text-[11px] font-mono font-bold" style={{ color: 'var(--color-blue-7)' }}>10px</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[12px] text-fg-secondary">w-2.5 / h-2.5</span>
                <span className="font-mono text-[10px] text-fg-muted">固定 10px,跨 size 不變</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: inspect panel */}
        <div className="w-[320px] shrink-0 border border-divider rounded-lg bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-divider bg-neutral-hover">
            <span className="text-[12px] font-semibold text-foreground">Inspect</span>
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <InspectRow label="Scrollbar 寬"><span className="font-mono">w-2.5 / h-2.5 (10px)</span></InspectRow>
            <InspectRow label="Track inset"><span className="font-mono">p-[1px]</span></InspectRow>
            <InspectRow label="邊界"><span className="font-mono">border-l / border-t transparent</span></InspectRow>
            <InspectRow label="Viewport"><span className="font-mono">flex-1 min-h-0 w-full rounded-[inherit]</span></InspectRow>
          </div>

          {/* COLOR */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Color</span></div>
            <InspectRow label="Track"><TokenCell token="transparent" display="transparent" /></InspectRow>
            <InspectRow label="Thumb"><TokenCell token="--scrollbar-thumb" /></InspectRow>
            <InspectRow label="Thumb hover"><TokenCell token="--scrollbar-thumb-hover" /></InspectRow>
          </div>

          {/* STYLE */}
          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Style</span></div>
            <InspectRow label="Thumb radius"><span className="font-mono">rounded-full</span></InspectRow>
            <InspectRow label="過渡"><span className="font-mono">transition-colors</span></InspectRow>
            <InspectRow label="顯示時機"><span className="font-mono">type=&quot;hover&quot; (default)</span></InspectRow>
          </div>
        </div>
      </div>
    </div>
  ),
}

const InspectRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3 py-2 border-b border-divider last:border-b-0">
    <span className="text-[11px] text-fg-muted font-medium w-[88px] shrink-0 pt-0.5">{label}</span>
    <div className="flex-1 text-[12px] font-mono text-fg-secondary">{children}</div>
  </div>
)

/* ═══════════════════════════════════════════════════════════════════════════
   3. 色彩對照表
   ═══════════════════════════════════════════════════════════════════════════ */

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>Thumb × 狀態</H3>
        <Desc>Track 固定透明(overlay 不搶視覺);Thumb 靜態低存在感,hover 加深反饋可抓握。Dark mode 由 semantic token 自動切換。</Desc>
      </div>

      <div className="overflow-x-auto">
        {/* doc-table:規格說明對照(說明文字非業務資料)— raw table 為 anatomy doc-table 慣例,不消費 DataTable */}
        <table className="border-collapse">
          <thead><tr><Th>元素</Th><Th>Default</Th><Th>Hover</Th></tr></thead>
          <tbody>
            <tr>
              <Td mono>Track</Td>
              <Td><TokenCell token="transparent" display="transparent" /></Td>
              <Td><TokenCell token="transparent" display="transparent" /></Td>
            </tr>
            <tr>
              <Td mono>Thumb</Td>
              <Td><TokenCell token="--scrollbar-thumb" /></Td>
              <Td><TokenCell token="--scrollbar-thumb-hover" /></Td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <H3>實際渲染 — hover 感受差異</H3>
        <Desc>將游標移入下方容器,scrollbar 會淡入(type=&quot;hover&quot;);hover 到 thumb 上,色彩由 --scrollbar-thumb(resolves to --border = neutral-5)加深至 --scrollbar-thumb-hover(resolves to --border-hover = neutral-6)。世界級 SaaS 的 scrollbar thumb 都是這種 subtle 視覺,不搶主視覺。</Desc>
        <ScrollArea className="h-[200px] w-[320px] border border-border rounded-md bg-surface">
          <PreviewList count={18} />
        </ScrollArea>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. 尺寸對照表(Scrollbar 寬度跨 size 不變)
   ═══════════════════════════════════════════════════════════════════════════ */

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>Scrollbar 寬度 — 跨 size / density / content 固定 10px</H3>
        <Desc>
          ScrollArea 的 scrollbar 是「功能性 primitive」,不是「內容呈現」,因此寬度不隨 content size(sm/md/lg)、不隨 density(md/lg)變化。
          Polaris / Material / Radix / shadcn 同樣做法:scrollbar 是 OS chrome 類別,與內容字級脫鉤。
        </Desc>
      </div>

      <div className="overflow-x-auto">
        {/* doc-table:規格說明對照(說明文字非業務資料)— raw table 為 anatomy doc-table 慣例,不消費 DataTable */}
        <table className="text-caption border-collapse">
          <thead><tr><Th>屬性</Th><Th>值</Th><Th>備註</Th></tr></thead>
          <tbody>
            <tr><Td>Vertical scrollbar 寬</Td><Td mono>w-2.5 (10px)</Td><Td>本 DS ScrollBar 套 h-full;Radix 再以 absolute(top:0/bottom:corner)撐滿高度</Td></tr>
            <tr><Td>Horizontal scrollbar 高</Td><Td mono>h-2.5 (10px)</Td><Td>本 DS ScrollBar 套 flex-col;Radix 再以 absolute(left/right:0)撐滿寬度</Td></tr>
            <tr><Td>Thumb inset</Td><Td mono>p-[1px]</Td><Td>thumb 與 track 邊緣保持 1px 透氣</Td></tr>
            <tr><Td>Thumb radius</Td><Td mono>rounded-full</Td><Td>對齊 macOS / modern DS 慣例</Td></tr>
            <tr><Td>Density 反應</Td><Td mono>無</Td><Td>不隨 --field-height-* / --layout-space-* 放大</Td></tr>
          </tbody>
        </table>
      </div>

      <div>
        <H3>三種 orientation 渲染對照</H3>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-footnote text-fg-muted">vertical — 10px wide</span>
            <ScrollArea className="h-[160px] border border-border rounded-md bg-surface">
              <PreviewList count={12} />
            </ScrollArea>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-footnote text-fg-muted">horizontal — 10px high</span>
            <ScrollArea className="border border-border rounded-md bg-surface">
              <WideTable />
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-footnote text-fg-muted">both — corner 交會</span>
            <ScrollArea className="h-[160px] border border-border rounded-md bg-surface">
              <WideTable />
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. Orientation 行為
   ═══════════════════════════════════════════════════════════════════════════ */

export const OrientationBehavior: Story = {
  name: '方向 行為',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>三種模式 — 何時用哪個</H3>
        <Desc>垂直用於清單 / body 捲動;水平用於寬表格 / 溢出 pill 列;雙向用於大型資料網格。</Desc>
      </div>

      <div className="overflow-x-auto">
        {/* doc-table:規格說明對照(說明文字非業務資料)— raw table 為 anatomy doc-table 慣例,不消費 DataTable */}
        <table className="text-caption border-collapse">
          <thead><tr><Th>Orientation</Th><Th>場景</Th><Th>使用範例</Th></tr></thead>
          <tbody>
            <tr>
              <Td mono>vertical(預設)</Td>
              <Td>長清單、Sheet / Dialog body、Sidebar nav</Td>
              <Td mono>&lt;ScrollArea className=&quot;h-[320px]&quot;&gt;...&lt;/ScrollArea&gt;</Td>
            </tr>
            <tr>
              <Td mono>horizontal</Td>
              <Td>寬 DataTable、Tag 溢出列、水平時間軸</Td>
              <Td mono>
                &lt;ScrollArea&gt;...&lt;ScrollBar orientation=&quot;horizontal&quot;/&gt;&lt;/ScrollArea&gt;
              </Td>
            </tr>
            <tr>
              <Td mono>vertical + horizontal</Td>
              <Td>大型 DataTable(雙向都溢出)</Td>
              <Td mono>
                同時渲染 vertical(自動)+ horizontal ScrollBar
              </Td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <H3>雙向 — 實際渲染</H3>
        <ScrollArea className="h-[220px] w-[460px] border border-border rounded-md bg-surface">
          <WideTable />
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      <div>
        <H3>Scrollbar 顯示時機(Radix <code className="font-mono text-footnote bg-muted px-1 rounded">type</code> prop)</H3>
        <Desc>預設 type=&quot;hover&quot;——游標進入容器時 scrollbar 淡入;離開後延遲隱藏(scrollHideDelay=600ms)。其他選項 always / scroll / auto 依場景調整。</Desc>
        <div className="overflow-x-auto">
          {/* doc-table:規格說明對照(說明文字非業務資料)— raw table 為 anatomy doc-table 慣例,不消費 DataTable */}
          <table className="text-caption border-collapse">
            <thead><tr><Th>type</Th><Th>行為</Th><Th>何時用</Th></tr></thead>
            <tbody>
              <tr><Td mono>hover(預設)</Td><Td>游標進入容器才顯示</Td><Td>一般內容區,低視覺干擾</Td></tr>
              <tr><Td mono>scroll</Td><Td>捲動時才顯示</Td><Td>macOS 原生風格</Td></tr>
              <tr><Td mono>always</Td><Td>永遠顯示</Td><Td>明確要提示使用者可以捲動(如短內容但仍有少量 overflow)</Td></tr>
              <tr><Td mono>auto</Td><Td>overflow 時顯示,非 overflow 時隱藏</Td><Td>對齊 native scrollbar 習慣</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"詳 `scroll-area.spec.md` 「A11y 預設」段。摘要(Radix primitive + 本 DS 橋接):\n\n-   鍵盤捲動  :本 DS 在 Viewport 加  tabIndex={0}  使其可被鍵盤聚焦(Radix 不自動標 focusable,Safari 尤其需要),聚焦後支援  ArrowUp/Down/Left/Right  /  PageUp/Down  /  Home/End \n-   Focus 可見  :聚焦的 Viewport 顯示 DS focus ring(focus-visible:outline-ring,inset 2px)\n-   Scrollbar 非 tab stop  :scrollbar thumb 不搶焦點,使用鍵盤的使用者透過 viewport 捲動(Radix 內建)\n-   Pointer 支援  :thumb 可拖曳,track 可 click-to-jump(Radix 內建)\n\n本元件已內建 tabIndex 與 focus ring(滿足 axe scrollable-region-focusable);但 Viewport 預設無 role / accessible name——scroll 區域有具體語意(如「留言列表」「程式碼區塊」)時,consumer 應提供 aria-label,否則 SR 只報「可捲動區域」無內容描述;純視覺裝飾容器可省略。"}</p>
    </div>
  ),
}

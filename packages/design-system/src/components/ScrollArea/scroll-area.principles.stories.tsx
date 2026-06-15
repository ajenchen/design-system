// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#NumberAlignment
// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'
import { createColumnHelper } from '@tanstack/react-table'
import { ScrollArea, ScrollBar } from './scroll-area'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types' // ColumnMeta declaration merging

const meta: Meta = {
  title: 'Design System/Components/ScrollArea/設計原則',
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
    <div className="flex flex-wrap gap-6 items-start">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal mt-2 ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── Sample data ───────────────────────────────────────────────────────────────

const NOTION_PAGES = [
  'Getting Started', 'Daily journal', 'Reading list', 'Recipes', 'Weekend projects',
  'Japan 2026 trip', 'Engineering wiki', 'Design system spec', 'Meeting notes',
  'Roadmap Q2', 'Incident retrospectives', 'Onboarding docs',
]

// Stripe 寬欄位商品表 — 消費真 DataTable(per data-table.spec.md「簡單展示場景也用 DataTable」,
// 對齊展示頁 HorizontalProductTable 同模式)。height="auto" + min-w-max:DataTable 無高度約束、
// 不啟內部捲軸,捲動完全由外層 ScrollArea / native overflow 容器 own。
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

// 取 count 列(> 6 時循環 base 資料、SKU 連號 — 對齊展示頁 PULL_REQUESTS 生成模式)
const productRows = (count: number): StripeProduct[] =>
  Array.from({ length: count }, (_, i) => ({
    ...STRIPE_PRODUCTS[i % STRIPE_PRODUCTS.length],
    sku: `PRO-${String(i + 1).padStart(3, '0')}`,
  }))

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

// ── Stories ───────────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 ScrollArea ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 ScrollArea 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/ScrollArea/展示" name="垂直捲動 — Linear 議題清單"><span className="text-primary hover:underline font-medium cursor-pointer">垂直捲動 — Linear issue 清單</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/ScrollArea/展示" name="垂直捲動 — Notion 側欄 導覽"><span className="text-primary hover:underline font-medium cursor-pointer">垂直捲動 — Notion sidebar 導覽</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/ScrollArea/展示" name="水平捲動 — Stripe 寬欄位商品表"><span className="text-primary hover:underline font-medium cursor-pointer">水平捲動 — Stripe 寬欄位商品表</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/ScrollArea/展示" name="雙向捲動 — GitHub PR 大型檢閱表"><span className="text-primary hover:underline font-medium cursor-pointer">雙向捲動 — GitHub PR 大型檢閱表</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* vs Native scroll — 原 ScrollAreaVsNative */}
      <div>
      <Rule
        title="vs Native scroll — 整頁捲動保持 native document scroll"
        note="瀏覽器的 document 層級捲動是 OS 慣例——保留 native 讓使用者得到 reader mode / pull-to-refresh / 鍵盤快速鍵等原生能力。ScrollArea 是 sub-region 工具,不為整頁服務。"
      >
        <div className="w-[320px]">
          <div className="border border-border rounded-md bg-surface p-4">
            <div className="text-body font-medium mb-2">Stripe Dashboard</div>
            <div className="text-caption text-fg-muted">整個頁面長內容,交給瀏覽器 document scroll</div>
          </div>
          <Label>✅ 整頁:不包 ScrollArea,保留 native scrollbar + 瀏覽器能力</Label>
        </div>
      </Rule>

      <Rule
        title="子區塊捲動 + 跨 OS 視覺一致 → 用 ScrollArea"
        note="DataTable 橫向捲動 / Sheet body 垂直捲動 / Sidebar nav——這些 sub-region 若用 native scrollbar,Windows 會吃 17px 寬度造成跑版,ScrollArea 的 overlay 捲軸跨 OS 一致不吃寬度。"
      >
        <div className="w-[320px]">
          <ScrollArea className="h-[180px] border border-border rounded-md bg-surface">
            <div className="p-2">
              {NOTION_PAGES.map((p) => (
                <div key={p} className="px-3 py-1.5 text-body hover:bg-neutral-hover rounded">{p}</div>
              ))}
            </div>
          </ScrollArea>
          <Label>✅ Sidebar nav(sub-region):ScrollArea 跨 OS 一致</Label>
        </div>
      </Rule>

      {/* 何時不用 / 替代元件 — 原 WhenNotToUse */}
      <Rule
        title="❌ 錯誤 — 巢狀 ScrollArea,使用者分不清在捲哪一層"
        note="當外層與內層都是 ScrollArea 時,滑鼠滾輪捲動的目標不明確(外層?內層?),焦點管理也會崩壞——使用者體驗破碎,a11y 使用者尤其混亂。"
      >
        <div className="w-[320px]">
          <ScrollArea className="h-[220px] border border-error/40 rounded-md bg-surface p-3">
            <div className="text-body font-medium mb-2">外層 ScrollArea</div>
            <ScrollArea className="h-[120px] border border-error/40 rounded-md bg-canvas">
              <div className="p-2">
                {NOTION_PAGES.slice(0, 8).map((p) => (
                  <div key={p} className="px-2 py-1 text-caption">{p}</div>
                ))}
              </div>
            </ScrollArea>
            <div className="mt-2 text-caption">外層繼續內容...</div>
            {NOTION_PAGES.map((p) => <div key={p} className="text-caption py-1">{p}</div>)}
          </ScrollArea>
          <Label warn>滾輪捲動哪一層? 焦點跳到哪? 混亂</Label>
        </div>
      </Rule>

      <Rule
        title="✅ 正確 — 需要巢狀結構時拆成 Tabs / Accordion / Sheet"
        note="把第二層內容換成展開/收合的 Tabs 或 Accordion,或推進新的 Sheet / Dialog 呈現——同一個視覺層級只有一個捲動軸,使用者心智清晰。"
      >
        <div className="w-[320px]">
          <ScrollArea className="h-[220px] border border-success/40 rounded-md bg-surface">
            <div className="p-3">
              <div className="text-body font-medium mb-2">單層 ScrollArea</div>
              {NOTION_PAGES.map((p) => (
                <div key={p} className="px-2 py-1.5 text-body hover:bg-neutral-hover rounded">{p}</div>
              ))}
            </div>
          </ScrollArea>
          <Label>單一捲動軸,心智清晰</Label>
        </div>
      </Rule>
    </div>
    </div>
  ),
}

export const OrientationChoice: Story = {
  name: '方向 選擇',
  render: () => (
    <div>
      <Rule
        title="vertical — 一般垂直清單、Sheet / Dialog body、Sidebar nav"
        note="預設 orientation。長清單、文件捲動、導覽列——內容沿垂直軸延伸的最常見場景。"
      >
        <div className="w-[280px]">
          <ScrollArea className="h-[180px] border border-border rounded-md bg-surface">
            <div className="p-2">
              {NOTION_PAGES.map((p) => (
                <div key={p} className="px-3 py-1.5 text-body hover:bg-neutral-hover rounded">{p}</div>
              ))}
            </div>
          </ScrollArea>
          <Label>Notion sidebar — 垂直捲動 12 個頁面項目</Label>
        </div>
      </Rule>

      <Rule
        title="horizontal — 寬表格、Tag 溢出列、水平時間軸"
        note="內容沿水平軸延伸且容器寬度受限。須明確渲染 <ScrollBar orientation='horizontal' /> — Radix 預設只處理 vertical。"
      >
        <div className="w-[440px]">
          <ScrollArea className="border border-border rounded-md bg-surface">
            <div className="min-w-max">
              <DataTable columns={PRODUCT_COLUMNS} data={productRows(3)} getRowId={(p) => p.sku} height="auto" bordered={false} />
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <Label>Stripe 商品表 — 8 欄超出 440px 容器,水平 scrollbar</Label>
        </div>
      </Rule>

      <Rule
        title="vertical + horizontal — 大型 DataTable 雙向溢出"
        note="資料網格同時寬且高於容器時,渲染 vertical(自動)+ horizontal ScrollBar,Radix 自動產生右下 corner。"
      >
        <div className="w-[440px]">
          <ScrollArea className="h-[200px] border border-border rounded-md bg-surface">
            <div className="min-w-max">
              <DataTable columns={PRODUCT_COLUMNS} data={productRows(12)} getRowId={(p) => p.sku} height="auto" bordered={false} />
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <Label>大型商品網格 — 12 列 × 8 欄,雙向 scrollbar + corner</Label>
        </div>
      </Rule>
    </div>
  ),
}

export const SolvesDataTableBug: Story = {
  name: '搭配 DataTable 解跑版',
  render: () => (
    <div>
      <Rule
        title="問題 — Native horizontal scroll 在 Windows 吃 17px,右側欄被裁切"
        note="macOS 的 scrollbar 是 overlay 不吃寬度;Windows / Linux always-visible 吃 ~17px。同一份 DataTable 在 macOS 對齊、在 Windows 右側 Status 欄被 scrollbar 壓掉一角 —— 「Left pinned + Row Actions」的典型跑版。"
      >
        <div className="w-[560px]">
          <div className="border border-error/40 rounded-md bg-surface overflow-x-auto">
            <div className="min-w-max">
              <DataTable columns={PRODUCT_COLUMNS} data={productRows(4)} getRowId={(p) => p.sku} height="auto" bordered={false} />
            </div>
          </div>
          <Label warn>❌ Native overflow-x-auto — Windows 右側 Status 欄被 scrollbar 吃掉</Label>
        </div>
      </Rule>

      <Rule
        title="解法 — ScrollArea overlay 捲軸,跨 OS 一致不吃寬度"
        note="同一份表格,改用 ScrollArea 包起來、額外渲染 horizontal ScrollBar。macOS 與 Windows 呈現完全一致,右側 Status 欄不被裁切。這是 DataTable 遷移到 ScrollArea 的主要動機。"
      >
        <div className="w-[560px]">
          <ScrollArea className="border border-success/40 rounded-md bg-surface">
            <div className="min-w-max">
              <DataTable columns={PRODUCT_COLUMNS} data={productRows(4)} getRowId={(p) => p.sku} height="auto" bordered={false} />
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <Label>✅ ScrollArea + horizontal ScrollBar — 跨 OS 一致</Label>
        </div>
      </Rule>
    </div>
  ),
}

export const OutOfScopeRule: Story = {
  name: '不該用 ScrollArea 的場景',
  render: () => (
    <div>
      <Rule
        title="❌ 單行 truncate 不用 ScrollArea"
        note="單行文字超出容器 → 用 text-overflow: ellipsis(CSS truncate),不需要讓使用者水平捲動看一行字。那是 UX 扭曲。"
      >
        <div className="w-[320px] flex flex-col gap-3">
          <div className="border border-success/40 rounded-md px-3 py-2 bg-surface">
            <div className="text-body truncate">Stripe Atlas 新創設立方案 — 一次搞定公司設立、銀行帳戶、稅務與股權</div>
          </div>
          <Label>✅ 用 truncate,一行顯示,超出省略號</Label>
          <div className="border border-error/40 rounded-md bg-surface">
            <ScrollArea className="w-full">
              <div className="whitespace-nowrap text-body px-3 py-2">
                Stripe Atlas 新創設立方案 — 一次搞定公司設立、銀行帳戶、稅務與股權
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
          <Label warn>❌ 用 ScrollArea 讓使用者水平捲動看一行字,UX 扭曲</Label>
        </div>
      </Rule>

      <Rule
        title="❌ 全頁捲動不用 ScrollArea"
        note="整個頁面的捲動交給瀏覽器 document scroll——保留 OS 原生體驗(pull-to-refresh / reader mode / 捲動位置記憶)。ScrollArea 只用於 sub-region。"
      >
        <div className="w-[320px]">
          <Label warn>❌ 禁止:在 &lt;body&gt; 或 &lt;html&gt; 外層包 ScrollArea</Label>
          <Label>✅ 正確:頁面內容直接放,交給瀏覽器 document scroll</Label>
        </div>
      </Rule>

      <Rule
        title="❌ 極短不會溢出的內容不包 ScrollArea"
        note="內容小於容器 → 永遠不會捲動 → ScrollArea 是視覺噪音 + 額外 DOM。只在「會溢出」的場景用。"
      >
        <div className="w-[320px] flex flex-col gap-3">
          <div className="border border-success/40 rounded-md px-3 py-2 bg-surface">
            <div className="text-body">✅ 三行內容,一般 div 就夠</div>
            <div className="text-caption text-fg-muted">不會溢出,不需 wrapper</div>
          </div>
          <div className="border border-error/40 rounded-md bg-surface">
            <ScrollArea className="h-[80px]">
              <div className="p-3">
                <div className="text-body">❌ 極短內容仍包 ScrollArea</div>
                <div className="text-caption text-fg-muted">多餘 DOM</div>
              </div>
            </ScrollArea>
          </div>
          <Label warn>❌ 內容不會溢出還包,純視覺噪音</Label>
        </div>
      </Rule>
    </div>
  ),
}

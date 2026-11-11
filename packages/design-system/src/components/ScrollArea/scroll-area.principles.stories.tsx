// @story-baseline: packages/design-system/src/components/DataTable/data-table.anatomy.stories.tsx#AlignmentRule
// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { ScrollArea, ScrollBar } from './scroll-area'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import {
  SidebarProvider,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/design-system/components/Sidebar/sidebar'
import { TruncatedText } from '@/design-system/patterns/element-anatomy/truncated-text'
import { STRIPE_PRODUCTS, PRODUCT_COLUMNS, type StripeProduct } from '@/design-system/stories-helpers/data/stripe-products'
import { ExampleCaption, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/ScrollArea/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, layout: 'wrap' })

// ── Sample data ───────────────────────────────────────────────────────────────

const NOTION_PAGES = [
  'Getting Started', 'Daily journal', 'Reading list', 'Recipes', 'Weekend projects',
  'Japan 2026 trip', 'Engineering wiki', 'Design system spec', 'Meeting notes',
  'Roadmap Q2', 'Incident retrospectives', 'Onboarding docs',
]

// Stripe 寬欄位商品表 — 消費真 DataTable(per data-table.spec.md「簡單展示也用 DataTable」,
// 對齊展示頁 HorizontalProductTable 同模式)。height="auto" + min-w-max:DataTable 無高度約束、
// 不啟內部捲軸,捲動完全由外層 ScrollArea / native overflow 容器 own。資料與欄位 = stories-helpers 共用的那一份。

// 取 count 列(> 6 時循環 base 資料、SKU 連號 — 對齊展示頁 PULL_REQUESTS 生成模式)
const productRows = (count: number): StripeProduct[] =>
  Array.from({ length: count }, (_, i) => ({
    ...STRIPE_PRODUCTS[i % STRIPE_PRODUCTS.length],
    sku: `PRO-${String(i + 1).padStart(3, '0')}`,
  }))

/**
 * 頁面導覽清單 = 真的 Sidebar 列元件(稽核 M091:原本手刻 `px-3 py-1.5` 的 div 列,展示頁同一個情境早就是 Sidebar 列);
 * 點一列就是切到那一頁(SidebarProvider 自己記住目前頁)。內容是自帶方向鍵的 SidebarMenu,捲動區本身不當 Tab 停靠點
 *(同展示頁「垂直捲動 — Notion 側欄導覽」)。
 */
function PagesNav({ pages }: { pages: string[] }) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {pages.map((p) => (
            <SidebarMenuItem key={p}>
              <SidebarMenuButton id={p}>{p}</SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

// ── Stories ───────────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 ScrollArea ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>內容可能超出容器、而且捲軸在各作業系統要長得一樣的子區塊:Sheet / Dialog 內文、側欄的長導覽、寬內容的橫向捲動。</p>
        <TutorialList>
          <li>
            <StoryLink kind="Design System/Components/ScrollArea/展示" name="垂直捲動 — Linear 議題清單">垂直捲動 — Linear issue 清單</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/ScrollArea/展示" name="垂直捲動 — Notion 側欄導覽">垂直捲動 — Notion sidebar 導覽</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/ScrollArea/展示" name="水平捲動 — Stripe 寬欄位商品表">水平捲動 — Stripe 寬欄位商品表</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/ScrollArea/展示" name="雙向捲動 — GitHub PR 大型檢閱表">雙向捲動 — GitHub PR 大型檢閱表</StoryLink>
          </li>
        </TutorialList>
        <TutorialRule
          title="子區塊捲動 + 跨 OS 視覺一致 → 用 ScrollArea"
          note="DataTable 橫向捲動 / Sheet body 垂直捲動 / Sidebar nav——這些 sub-region 若用 native scrollbar,Windows 會吃 17px 寬度造成跑版,ScrollArea 的 overlay 捲軸跨 OS 一致不吃寬度。"
        >
          <ExampleGroup className="w-[320px]">
            <SidebarProvider defaultActiveId={NOTION_PAGES[0]} className="min-h-0">
              <ScrollArea className="h-[180px] w-full border border-border rounded-md bg-surface" viewportTabIndex={-1}>
                <PagesNav pages={NOTION_PAGES} />
              </ScrollArea>
            </SidebarProvider>
            <ExampleCaption>✅ Sidebar nav(sub-region):ScrollArea 跨 OS 一致</ExampleCaption>
          </ExampleGroup>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 整頁捲動:保留瀏覽器原生捲動"
          note="瀏覽器的 document 層級捲動是 OS 慣例——保留 native 讓使用者得到 reader mode / 鍵盤快速鍵等原生能力。ScrollArea 是 sub-region 工具,不為整頁服務。"
        >
          <ExampleGroup className="w-[320px]">
            <div className="border border-border rounded-md bg-surface p-[var(--layout-space-loose)]">
              <div className="text-body font-medium mb-[var(--item-gap-label-desc-reading)]">Stripe Dashboard</div>
              <div className="text-caption text-fg-muted">整個頁面長內容,交給瀏覽器 document scroll</div>
            </div>
            <ExampleCaption>✅ 整頁:不包 ScrollArea,保留 native scrollbar + 瀏覽器能力</ExampleCaption>
          </ExampleGroup>
        </TutorialRule>

        <TutorialRule
          title="❌ 錯誤 — 巢狀 ScrollArea,使用者分不清在捲哪一層"
          note="當外層與內層都是 ScrollArea 時,滑鼠滾輪捲動的目標不明確(外層?內層?),焦點管理也會崩壞——使用者體驗破碎,a11y 使用者尤其混亂。"
        >
          <ExampleGroup className="w-[320px]">
            <ScrollArea className="h-[220px] border border-error/40 rounded-md bg-surface p-[var(--layout-space-loose)]">
              {/* 標題 → 它底下的內容(內層捲動區、外層後續內容)= loose(layoutSpace.spec.md 規則 3「標題區 → 內容」:兩塊以上並列) */}
              <h4 className="text-h6 font-semibold mb-[var(--layout-space-loose)]">外層 ScrollArea</h4>
              <ScrollArea className="h-[120px] border border-error/40 rounded-md bg-canvas">
                {/* @layout-space-magic-ok: 內層捲動區裡頁名列外圈 8px —— 反例本身的寫法;規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 同值) */}
                <div className="p-2">
                  {NOTION_PAGES.slice(0, 8).map((p) => (
                    // @layout-space-magic-ok: 頁名列內距 8 / 4px —— 反例本身的寫法;規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 同值)
                    <div key={p} className="px-2 py-1 text-caption">{p}</div>
                  ))}
                </div>
              </ScrollArea>
              <div className="mt-[var(--layout-space-tight)] text-caption">外層繼續內容...</div>
              {/* @layout-space-magic-ok: 外層頁名列上下 4px —— 反例本身的寫法;規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 同值) */}
              {NOTION_PAGES.map((p) => <div key={p} className="text-caption py-1">{p}</div>)}
            </ScrollArea>
            <ExampleCaption warn>滾輪捲動哪一層? 焦點跳到哪? 混亂</ExampleCaption>
          </ExampleGroup>
        </TutorialRule>

        <TutorialRule
          title="✅ 正確 — 需要巢狀結構時拆成 Tabs / Accordion / Sheet"
          note="把第二層內容換成展開/收合的 Tabs 或 Accordion,或推進新的 Sheet / Dialog 呈現——同一個視覺層級只有一個捲動軸,使用者心智清晰。"
        >
          <ExampleGroup className="w-[320px]">
            <SidebarProvider defaultActiveId={NOTION_PAGES[0]} className="min-h-0">
              <ScrollArea className="h-[220px] w-full border border-success/40 rounded-md bg-surface" viewportTabIndex={-1}>
                <div className="pt-[var(--layout-space-loose)]">
                  {/* 標題 → 一串頁面列 = tight(清單:內容之間本來就沒有 loose,A4 路線二);左右對齊 Sidebar 列的文字起點 */}
                  <h4 className="px-[var(--layout-space-loose)] text-h6 font-semibold mb-[var(--layout-space-tight)]">單層 ScrollArea</h4>
                  <PagesNav pages={NOTION_PAGES} />
                </div>
              </ScrollArea>
            </SidebarProvider>
            <ExampleCaption>單一捲動軸,心智清晰</ExampleCaption>
          </ExampleGroup>
        </TutorialRule>
        <TutorialList>
          <li>單行文字放不下 → 用省略號截斷,不需要捲動</li>
          <li>內容很短、或容器永遠不會溢出 → 一般容器就好,ScrollArea 只會多一層</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>OverflowIndicator</strong> —— 一列項目放不下時折成 +N;ScrollArea 是讓內容可以捲動、捲軸跨系統一致</li>
          <li><strong>瀏覽器原生捲動</strong> —— 整頁用原生;只有邊界明確的子區塊才用 ScrollArea</li>
          <li><strong>AspectRatio</strong> —— 鎖住比例、不捲動;內容可能溢出才用 ScrollArea</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

export const OrientationChoice: Story = {
  name: '方向選擇',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="vertical — 一般垂直清單、Sheet / Dialog body、Sidebar nav"
        note="預設 orientation。長清單、文件捲動、導覽列——內容沿垂直軸延伸的最常見場景。"
      >
        <ExampleGroup className="w-[280px]">
          <SidebarProvider defaultActiveId={NOTION_PAGES[0]} className="min-h-0">
            <ScrollArea className="h-[180px] w-full border border-border rounded-md bg-surface" viewportTabIndex={-1}>
              <PagesNav pages={NOTION_PAGES} />
            </ScrollArea>
          </SidebarProvider>
          <ExampleCaption>Notion sidebar — 垂直捲動 12 個頁面項目</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>

      <TutorialRule
        title="horizontal — 寬表格、Tag 溢出列、水平時間軸"
        note="內容沿水平軸延伸且容器寬度受限。須明確渲染 <ScrollBar orientation='horizontal' /> — Radix 預設只處理 vertical。"
      >
        <ExampleGroup className="w-[440px]">
          <ScrollArea className="border border-border rounded-md bg-surface">
            <div className="min-w-max">
              <DataTable columns={PRODUCT_COLUMNS} data={productRows(3)} getRowId={(p) => p.sku} height="auto" bordered={false} />
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <ExampleCaption>Stripe 商品表 — 8 欄超出 440px 容器,水平 scrollbar</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>

      <TutorialRule
        title="vertical + horizontal — 大型 DataTable 雙向溢出"
        note="資料網格同時寬且高於容器時,渲染 vertical(自動)+ horizontal ScrollBar,Radix 自動產生右下 corner。"
      >
        <ExampleGroup className="w-[440px]">
          <ScrollArea className="h-[200px] border border-border rounded-md bg-surface">
            <div className="min-w-max">
              <DataTable columns={PRODUCT_COLUMNS} data={productRows(12)} getRowId={(p) => p.sku} height="auto" bordered={false} />
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <ExampleCaption>大型商品網格 — 12 列 × 8 欄,雙向 scrollbar + corner</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const SolvesDataTableBug: Story = {
  name: '搭配 DataTable 解跑版',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="問題 — Native horizontal scroll 在 Windows 吃 17px,右側欄被裁切"
        note="macOS 的 scrollbar 是 overlay 不吃寬度;Windows / Linux always-visible 吃 ~17px。同一份 DataTable 在 macOS 對齊、在 Windows 右側 Status 欄被 scrollbar 壓掉一角 —— 「Left pinned + Row Actions」的典型跑版。"
      >
        <ExampleGroup className="w-[560px]">
          <div className="border border-error/40 rounded-md bg-surface overflow-x-auto">
            <div className="min-w-max">
              <DataTable columns={PRODUCT_COLUMNS} data={productRows(4)} getRowId={(p) => p.sku} height="auto" bordered={false} />
            </div>
          </div>
          <ExampleCaption warn>❌ Native overflow-x-auto — Windows 右側 Status 欄被 scrollbar 吃掉</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>

      <TutorialRule
        title="解法 — ScrollArea overlay 捲軸,跨 OS 一致不吃寬度"
        note="同一份表格,改用 ScrollArea 包起來、額外渲染 horizontal ScrollBar。macOS 與 Windows 呈現完全一致,右側 Status 欄不被裁切。此組合限外層包 height='auto' 表格的 demo 場景;DataTable 中央捲動區本體走 native overflow-x-auto(釘選欄的結構需求)。"
      >
        <ExampleGroup className="w-[560px]">
          <ScrollArea className="border border-success/40 rounded-md bg-surface">
            <div className="min-w-max">
              <DataTable columns={PRODUCT_COLUMNS} data={productRows(4)} getRowId={(p) => p.sku} height="auto" bordered={false} />
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <ExampleCaption>✅ ScrollArea + horizontal ScrollBar — 跨 OS 一致</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const OutOfScopeRule: Story = {
  name: '不該用 ScrollArea 的場景',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="❌ 單行 truncate 不用 ScrollArea"
        note="單行文字超出容器 → 用省略號截斷(TruncatedText:截斷時滑過出 tooltip 顯示全文),不需要讓使用者水平捲動看一行字。那是 UX 扭曲。"
      >
        {/* 稽核 M031:✅ 那則改用 DS 的 TruncatedText(截斷時滑過出 Tooltip 顯示全文);拿掉手刻的綠 / 紅色外框 */}
        <div className="w-[320px] flex flex-col gap-[var(--layout-space-loose)]">
          <ExampleGroup>
            <TruncatedText display="block" className="text-body">Stripe Atlas 新創設立方案 — 一次搞定公司設立、銀行帳戶、稅務與股權</TruncatedText>
            <ExampleCaption>✅ 一行顯示、超出顯示省略號;截斷一律帶 tooltip 顯示全文(滑過看得到完整標題)</ExampleCaption>
          </ExampleGroup>
          <ExampleGroup>
            <ScrollArea className="w-full border border-border rounded-md bg-surface">
              <div className="whitespace-nowrap text-body px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
                Stripe Atlas 新創設立方案 — 一次搞定公司設立、銀行帳戶、稅務與股權
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            <ExampleCaption warn>❌ 用 ScrollArea 讓使用者水平捲動看一行字,UX 扭曲</ExampleCaption>
          </ExampleGroup>
        </div>
      </TutorialRule>

      <TutorialRule
        title="❌ 全頁捲動不用 ScrollArea"
        note="整個頁面的捲動交給瀏覽器 document scroll——保留 OS 原生體驗(reader mode / 捲動位置記憶)。ScrollArea 只用於 sub-region。"
      >
        <ExampleGroup className="w-[320px]">
          <ExampleCaption warn>❌ 禁止:在 &lt;body&gt; 或 &lt;html&gt; 外層包 ScrollArea</ExampleCaption>
          <ExampleCaption>✅ 正確:頁面內容直接放,交給瀏覽器 document scroll</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>

      <TutorialRule
        title="❌ 極短不會溢出的內容不包 ScrollArea"
        note="內容小於容器 → 永遠不會捲動 → ScrollArea 是視覺噪音 + 額外 DOM。只在「會溢出」的場景用。"
      >
        {/* 稽核 M031 同一處的兩個手刻綠 / 紅色外框拿掉:✅ 就是一般容器(中性框線,有邊界的區塊)、❌ 是包了 ScrollArea 的同一個容器 */}
        <div className="w-[320px] flex flex-col gap-[var(--layout-space-loose)]">
          <ExampleGroup>
            <div className="border border-border rounded-md px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] bg-surface">
              <div className="text-body">三天後到期的發票</div>
              <div className="text-caption text-fg-muted">INV-2026-0412 · NT$ 12,800</div>
            </div>
            <ExampleCaption>✅ 兩行內容,一般容器就夠</ExampleCaption>
          </ExampleGroup>
          <ExampleGroup>
            <ScrollArea className="h-[80px] border border-border rounded-md bg-surface">
              <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
                <div className="text-body">三天後到期的發票</div>
                <div className="text-caption text-fg-muted">INV-2026-0412 · NT$ 12,800</div>
              </div>
            </ScrollArea>
            <ExampleCaption warn>❌ 內容不會溢出還包 ScrollArea,多一層 DOM、多一條不會出現的捲軸</ExampleCaption>
          </ExampleGroup>
        </div>
      </TutorialRule>
    </TutorialPage>
  ),
}

// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @story-trait-rationale: Breadcrumb 是純結構導覽元件,disabled/states 由 BreadcrumbLink 內部 :focus-visible / :hover / :active 處理(spec.md 互動狀態段已 cover),無 element-level disabled mode(spec.md 互動狀態 > Disabled 段「通常 breadcrumb link 不會 disabled」)。互動行為示範由 InteractiveEllipsis story + anatomy StateBehavior 完整覆蓋。AllSizes retired per F migration 2026-05-15(anatomy auto-compile SizeMatrix owns size showcase)。
import type { Meta, StoryObj } from '@storybook/react'
import { House } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from './breadcrumb'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/design-system/components/DropdownMenu/dropdown-menu'

const meta: Meta<typeof Breadcrumb> = {
  title: 'Design System/Components/Breadcrumb/展示',
  component: Breadcrumb,
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj<typeof Breadcrumb>

// ── Default ──────────────────────────────────────────────────────────────────

export const Default: Story = {
  name: '預設',
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/">首頁</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="/projects">專案</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>新增專案</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  ),
}

// ── Interactive ellipsis (折疊路徑 → DropdownMenu) ─────────────────────────

export const InteractiveEllipsis: Story = {
  name: '可互動省略',
  render: () => (
    <div className="flex flex-col gap-4">
      {/* 內部實作(對 consumer 不可見):BreadcrumbEllipsis 永遠 render <button> + DropdownMenuTrigger
          asChild 注入 dropdown 行為;hover 走 neutral(fg-muted → foreground + neutral hover bg,消費
          ItemInlineActionButton),刻意與 BreadcrumbLink 的 primary-hover 語言區隔。 */}
      <div className="text-caption text-fg-muted max-w-xl">
        點 <code>⋯</code> 會開選單,列出被折疊起來的中間層級。滑鼠移上去時 <code>⋯</code> 用中性灰的高亮
        (和一般連結的主色高亮刻意分開,讓「展開選單」和「跳到某一層」兩種動作一眼可辨),對齊 Material /
        Atlassian / Ant Design 的做法。
      </div>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">首頁</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <BreadcrumbEllipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem asChild>
                  <a href="/org" onClick={(e) => e.preventDefault()}>組織</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="/org/team" onClick={(e) => e.preventDefault()}>產品團隊</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="/org/team/members" onClick={(e) => e.preventDefault()}>成員管理</a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/org/team/members/alice">Alice</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>權限設定</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  ),
}

// @story-trait-rationale: AllSizes retired per F migration 2026-05-15 — anatomy.stories.tsx SizeMatrix auto-compile owns size showcase。
// ── Declarative items + auto-collapse(Phase B,2026-05-10)──────────────────
//
// @story-trait-rationale: 此 story 展示 Phase B declarative `items` API + auto-collapse
// (maxItems=4)+ flex-shrink hierarchy + truncate-on-overflow + tooltip canonical(per
// `tooltip.principles.stories.tsx:190`)。Disabled / States 仍由 BreadcrumbLink 內部 :hover /
// :focus-visible / :active 處理(spec.md 互動狀態 > Disabled 段,無 element-level disabled)。

export const DeclarativeAutoCollapse: Story = {
  name: '宣告式 API + 自動收合',
  render: () => (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">
          ≤ maxItems(4)— 全顯
        </h3>
        <p className="text-caption text-fg-muted mb-3">
          3 items 不超 maxItems=4,所有 item 自然 render。
        </p>
        <Breadcrumb>
          <BreadcrumbList
            items={[
              { label: '首頁', href: '/' },
              { label: '專案', href: '/projects' },
              { label: '我的新專案' },  // 無 href → 自動 BreadcrumbPage(末位)
            ]}
          />
        </Breadcrumb>
      </div>

      <div>
        <h3 className="text-body font-bold text-foreground mb-2">
          5 items 超 maxItems(4)— auto-collapse 中段
        </h3>
        <p className="text-caption text-fg-muted mb-3">
          itemsBeforeCollapse=1 + itemsAfterCollapse=1 → 首 + ⋯ + 末。
          中段 [專案, Q1, 行銷活動] 全進 DropdownMenu(點 ⋯ 看)。
        </p>
        <Breadcrumb>
          <BreadcrumbList
            items={[
              { label: '首頁', href: '/' },
              { label: '專案', href: '/projects' },
              { label: 'Q1', href: '/projects/q1' },
              { label: '行銷活動', href: '/projects/q1/marketing' },
              { label: '電子報設計' },
            ]}
          />
        </Breadcrumb>
      </div>

      <div>
        <h3 className="text-body font-bold text-foreground mb-2">
          自訂 maxItems / itemsAfterCollapse
        </h3>
        <p className="text-caption text-fg-muted mb-3">
          maxItems=6 + itemsAfterCollapse=2 → 首 1 + ⋯ + 末 2(parent + current)。
        </p>
        <Breadcrumb>
          <BreadcrumbList
            maxItems={6}
            itemsAfterCollapse={2}
            items={[
              { label: '組織', href: '/org' },
              { label: '產品團隊', href: '/org/team' },
              { label: '成員', href: '/org/team/members' },
              { label: 'Alice', href: '/org/team/members/alice' },
              { label: '權限', href: '/.../permissions' },
              { label: '角色', href: '/.../roles' },
              { label: '編輯' },
            ]}
          />
        </Breadcrumb>
      </div>

      <div>
        <h3 className="text-body font-bold text-foreground mb-2">
          窄容器 + 長 label — flex-shrink hierarchy + truncate + tooltip
        </h3>
        <p className="text-caption text-fg-muted mb-3">
          縮放瀏覽器寬度可觀察:容器變窄時,首項最先被壓縮、中段次之、當前頁最後才縮。
          每一項文字被截斷時自動顯示 ...,滑鼠移上去會用 tooltip 顯示完整文字;沒被截斷則不顯示 tooltip。
        </p>
        {/* @story-trait-rationale: 2026-05-14 per user 拍板「拿掉 fixed 320px 讓 resize window 測 RWD」— Breadcrumb 是純結構導覽,disabled/states 由 BreadcrumbLink :focus-visible/:hover/:active 處理(spec.md 互動狀態 > Disabled 段),trait check 沿用 file header rationale */}
        <div className="border border-dashed border-divider rounded-md p-2">
          <Breadcrumb>
            <BreadcrumbList
              items={[
                { label: 'Global Platform Infrastructure Group', href: '/org' },
                { label: 'Product Engineering Team', href: '/team' },
                { label: 'Design System Component Refactor Sprint 23' },
              ]}
            />
          </Breadcrumb>
        </div>
      </div>
    </div>
  ),
}

// @story-trait-rationale: Deep(5 層)+ TwoLevels(2 層)retired 2026-05-30 per earn-existence 2-test —
// 兩者與 Default(3 層)教的原則完全相同(BreadcrumbLink + Separator + 末項 BreadcrumbPage),差別僅「深度數字」。
// 路徑深度變化已由 anatomy Inspector `pathLength` control(3/4/5/6/7 即時切換)+ DeclarativeAutoCollapse(5 層 + auto-collapse)涵蓋。

// @story-trait-rationale: WithHomeIcon(首項配首頁圖示)retired 2026-06-11 per earn-existence 2-test —
// 首項 House icon 慣例 + icon 尺寸隨字級自動(sm/md 16px / lg 20px)已由下方 PairedWithPageTitle 三個
// size 的首項完整示範(原則層 ScopeRule 另有教學),單獨一則 md 尺寸範例屬重複;LinkTo 全庫 grep 無引用。

// ── 配對頁面標題(spec.md size canonical:sm→h4 / md→h3 / lg→h2)─────────

export const PairedWithPageTitle: Story = {
  name: '與頁面標題配對',
  parameters: {
    docs: {
      description: {
        story: 'Breadcrumb 的字級應對應頁面標題的層級:sm 配 h4(對話框 / 側板),md 配 h3(一般頁面 header,預設),lg 配 h2(詳情頁主視覺)。讓階層視覺維持平衡,麵包屑不搶走標題的視覺權重。首項配 House icon 為業界慣例,用 startIcon 傳入即可,圖示尺寸由元件依字級自動決定(sm/md 16px、lg 20px),三個尺寸可對照觀察。',
      },
    },
  },
  render: () => (
    <div className="flex flex-col gap-12">
      <section>
        <Breadcrumb>
          <BreadcrumbList size="sm">
            <BreadcrumbItem><BreadcrumbLink href="/" startIcon={House}>首頁</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/settings">設定</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>個人偏好</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h4 className="text-h4 text-foreground mt-2">個人偏好</h4>
        <p className="text-caption text-fg-muted mt-1">size="sm" 配 text-h4 — Dialog / Panel / Drawer header</p>
      </section>

      <section>
        <Breadcrumb>
          <BreadcrumbList size="md">
            <BreadcrumbItem><BreadcrumbLink href="/" startIcon={House}>首頁</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/projects">專案</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Q1 行銷活動</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h3 className="text-h3 text-foreground mt-2">Q1 行銷活動</h3>
        <p className="text-caption text-fg-muted mt-1">size="md"(預設)配 text-h3 — 一般頁面 header</p>
      </section>

      <section>
        <Breadcrumb>
          <BreadcrumbList size="lg">
            <BreadcrumbItem><BreadcrumbLink href="/" startIcon={House}>首頁</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/products">產品</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>2026 春季新品</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h2 className="text-h2 text-foreground mt-2">2026 春季新品</h2>
        <p className="text-caption text-fg-muted mt-1">size="lg" 配 text-h2 — Detail page hero / Landing</p>
      </section>
    </div>
  ),
}

// ── 整合 React Router / Next.js Link(asChild slot,replace anchor element)──

export const IntegrateRouterLink: Story = {
  name: '整合 React Router / Next.js Link',
  parameters: {
    docs: {
      description: {
        story: '需把 BreadcrumbLink 的樣式與行為套到 router 自帶的 Link 元件(React Router Link / Next.js Link / TanStack Link),用 asChild prop 把 anchor 元素替換成 router Link,樣式 / hover / focus 全自動繼承。常見場景:SPA 不希望 default <a> 觸發整頁 reload。',
      },
    },
  },
  render: () => (
    <div className="flex flex-col gap-2">
      <div className="text-caption text-fg-muted">
        以下用 native &lt;a onClick prevent&gt; 模擬 router Link 行為:
      </div>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <a href="/" onClick={(e) => e.preventDefault()}>首頁</a>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <a href="/projects" onClick={(e) => e.preventDefault()}>專案</a>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>詳情</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  ),
}

// ── Router Link + 自動摺疊(2026-07-19 回歸防線)────────────────────────────
//
// @story-trait-rationale: 專驗 auto-collapse 抽取器把 `<BreadcrumbLink asChild><router Link>` 中段項目
//   摺疊進 ⋯ dropdown 時,link 元素(含 to/href/onClick)整個保留、非退化成純文字 —— DA3 對抗稽核抓到的
//   邏輯 gap 回歸鎖。play() 開摺疊選單並斷言摺疊項目為可點 <a href>(role=menuitem 落在 anchor 上,
//   非外層 div = 無 nested-interactive)。此處以 `<a onClick prevent>` 模擬 React Router / Next Link。
export const IntegrateRouterLinkAutoCollapse: Story = {
  name: '整合 Router Link — 自動摺疊保留導航',
  parameters: {
    docs: {
      description: {
        story: '6 層路徑超過 maxItems(預設 4)自動摺疊中段;中段用 asChild 套 router Link。摺疊進 ⋯ 下拉後 link 必完整保留(SPA 導航不退化成整頁重載)。點 ⋯ 可見每個摺疊項目仍是可點連結。',
      },
    },
  },
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <a href="/" onClick={(e) => e.preventDefault()}>首頁</a>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <a href="/org" onClick={(e) => e.preventDefault()}>組織</a>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <a href="/org/team" onClick={(e) => e.preventDefault()}>產品團隊</a>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <a href="/org/team/members" onClick={(e) => e.preventDefault()}>成員管理</a>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <a href="/org/team/members/alice" onClick={(e) => e.preventDefault()}>Alice</a>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbItem>
          <BreadcrumbPage>權限設定</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  ),
  play: async ({ canvasElement }) => {
    const { userEvent, within, expect, waitFor } = await import('@storybook/test')
    const canvas = within(canvasElement)
    // 開摺疊選單(BreadcrumbEllipsis 預設 aria-label = 顯示折疊路徑)
    const ellipsis = await canvas.findByLabelText('顯示折疊路徑')
    await userEvent.click(ellipsis)
    // 核心回歸斷言:摺疊進 dropdown 的 router-link 必保留為可點 <a href="/org/team">(修前會被丟掉 → anchor 不存在)。
    // 註:DS DropdownMenuItem 內部把 children 包進 role="presentation" 的 MenuItem(role=menuitem 在 Radix Item 層),
    //   故不斷言 anchor 自身 role;直接驗「導航目標的 anchor 存在且文字對」= 連結保留的真義。dropdown portal 到 body。
    await waitFor(async () => {
      const link = document.querySelector('a[href="/org/team"]')
      await expect(link, '摺疊的 router-link「產品團隊」應保留為可點 <a href="/org/team">(修前退化成純文字)').not.toBeNull()
      await expect(link?.textContent).toContain('產品團隊')
    })
  },
}

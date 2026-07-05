// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
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
import { H3, Desc, Td, Th, TokenCell, Swatch } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

type InspectorArgs = {
  size: 'sm' | 'md' | 'lg'
  showHomeIcon: boolean
  pathLength: 3 | 4 | 5 | 6 | 7
  maxItems: number
  itemsBeforeCollapse: number
  itemsAfterCollapse: number
}

const meta: Meta = {
  title: 'Design System/Components/Breadcrumb/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj
type InspectorStory = StoryObj<InspectorArgs>

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>Breadcrumb 基於 shadcn/ui Breadcrumb 結構橋接 DS token,基礎結構為原生 HTML + Tailwind(asChild 用 Radix Slot;truncate Tooltip 與收合 DropdownMenu 消費 DS 內部元件)。使用 `&lt;nav aria-label="Breadcrumb"&gt;` 確保正確 a11y。</Desc>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">專案</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Q1 行銷活動</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>電子報設計</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div>
        <H3>結構元件</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>元件</Th><Th>作用</Th><Th>HTML</Th></tr></thead>
            <tbody>
              <tr><Td mono>Breadcrumb</Td><Td>外層 nav,aria-label="Breadcrumb"</Td><Td mono>&lt;nav&gt;</Td></tr>
              <tr><Td mono>BreadcrumbList</Td><Td>flex 容器</Td><Td mono>&lt;ol&gt;</Td></tr>
              <tr><Td mono>BreadcrumbItem</Td><Td>單一層級</Td><Td mono>&lt;li&gt;</Td></tr>
              <tr><Td mono>BreadcrumbLink</Td><Td>可點擊的上層 / 中層</Td><Td mono>&lt;a&gt;</Td></tr>
              <tr><Td mono>BreadcrumbPage</Td><Td>當前頁(最末項,不可點擊)</Td><Td mono>&lt;span role="link" aria-disabled="true" aria-current="page"&gt;</Td></tr>
              <tr><Td mono>BreadcrumbSeparator</Td><Td>ChevronRight 分隔符</Td><Td mono>&lt;li role="presentation"&gt;</Td></tr>
              <tr><Td mono>BreadcrumbEllipsis</Td><Td>中間層過多時可點擊展開的省略符</Td><Td mono>&lt;button type="button"&gt;</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const Inspector: InspectorStory = {
  name: '元件檢閱器',
  parameters: {
    docs: {
      description: {
        story: '用右側 Controls 面板切換字級、首項 icon、路徑深度與收合設定,即時查看 Breadcrumb 在不同組合下的呈現。可調項目:字級(sm/md/lg)、是否顯示首頁 icon、路徑總層數、自動收合的觸發層數,以及收合後保留的前後項目數。',
      },
    },
  },
  args: {
    size: 'md',
    showHomeIcon: true,
    pathLength: 5,
    maxItems: 4,
    itemsBeforeCollapse: 1,
    itemsAfterCollapse: 1,
  },
  argTypes: {
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
      description: '字體尺寸 — 對齊配對的 page title(sm→h4 / md→h3 / lg→h2)',
    },
    showHomeIcon: {
      control: 'boolean',
      description: '首項是否帶 Home icon(Material / Atlassian 慣例)。Icon size 自動跟著 BREADCRUMB_ICON_SIZE SSOT(sm/md=16, lg=20)。',
    },
    pathLength: {
      control: { type: 'radio' },
      options: [3, 4, 5, 6, 7],
      description: '模擬路徑總層數(含首頁 + 當前頁)。配合 maxItems 觀察 collapse 行為。',
    },
    maxItems: {
      control: { type: 'range', min: 2, max: 8, step: 1 },
      description: 'Auto-collapse 閾值(BreadcrumbList prop)。items.length > maxItems 時觸發中段收合。Material UI source 預設 8,DS 收嚴預設 4。',
    },
    itemsBeforeCollapse: {
      control: { type: 'range', min: 0, max: 3, step: 1 },
      description: 'Collapse 後保留首 N(BreadcrumbList prop)。預設 1。',
    },
    itemsAfterCollapse: {
      control: { type: 'range', min: 1, max: 3, step: 1 },
      description: 'Collapse 後保留末 N(BreadcrumbList prop)。預設 1。末位永遠 ≥ 1(current page)。',
    },
  },
  render: (args) => {
    // Inspector 用 BreadcrumbList items API(declarative mode)1:1 暴露 public props。
    // Consumer 在這頁玩 controls = production 寫 props 體驗一致(對齊 Material UI Storybook canonical)。
    const labels = ['首頁', '專案', 'Q1 行銷活動', '電子報', '圖檔資產', 'hero-banner.png', '_thumbnails']
    const items = labels.slice(0, args.pathLength).map((label, i) => {
      const isLast = i === args.pathLength - 1
      return {
        label,
        href: isLast ? undefined : '#', // 末位無 href → 自動 BreadcrumbPage(per spec.md Title-breadcrumb-end SSOT)
        startIcon: i === 0 && args.showHomeIcon ? House : undefined,
      }
    })
    return (
      <Breadcrumb>
        <BreadcrumbList
          size={args.size}
          items={items}
          maxItems={args.maxItems}
          itemsBeforeCollapse={args.itemsBeforeCollapse}
          itemsAfterCollapse={args.itemsAfterCollapse}
        />
      </Breadcrumb>
    )
  },
}

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>節點類型 × 狀態色彩對照</H3>
        <Desc>
          Breadcrumb 的色彩決定「你從哪來 / 你在這」的視覺階層——ancestor link 降低飽和度(fg-secondary)讓 current page(foreground)成為焦點。
          BreadcrumbLink 的互動高亮走 `--primary-hover`(設計準則,與 Tabs / Chip 未選 hover 同 token)；
          BreadcrumbEllipsis 是 icon button(消費 `ItemInlineActionButton`),hover 走 neutral `--foreground` + neutral hover bg,不走 `--primary-hover`(對齊 inline-action primitive canonical)。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse min-w-[640px]">
            <thead>
              <tr>
                <Th>節點類型</Th>
                <Th>default</Th>
                <Th>hover</Th>
                <Th>focus</Th>
                <Th>aria</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>BreadcrumbLink(ancestor)</Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--fg-secondary" size="sm" /><span className="font-mono">--fg-secondary</span></span></Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--primary-hover" size="sm" /><span className="font-mono">--primary-hover</span></span></Td>
                <Td mono>ring-2 ring-ring</Td>
                <Td>—</Td>
              </tr>
              <tr>
                <Td mono>BreadcrumbPage(current)</Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--foreground" size="sm" /><span className="font-mono">--foreground</span></span></Td>
                <Td>—(non-interactive)</Td>
                <Td>—</Td>
                <Td mono>aria-current="page"</Td>
              </tr>
              <tr>
                <Td mono>BreadcrumbSeparator</Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--fg-muted" size="sm" /><span className="font-mono">--fg-muted</span></span></Td>
                <Td>—(decoration)</Td>
                <Td>—</Td>
                <Td mono>role="presentation"</Td>
              </tr>
              <tr>
                <Td mono>BreadcrumbEllipsis</Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--fg-muted" size="sm" /><span className="font-mono">--fg-muted</span></span></Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--foreground" size="sm" /><span className="font-mono">--foreground</span> + neutral hover bg</span></Td>
                <Td mono>outline-2 outline-ring</Td>
                <Td mono>aria-label="顯示折疊路徑"</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>視覺對照</H3>
        <Desc>三種節點並列,觀察 fg-muted → fg-secondary → foreground 的階層性 — 越靠近 current 越實。</Desc>
        <div className="border border-dashed border-divider rounded-md p-5">
          <Breadcrumb>
            <BreadcrumbList size="md">
              <BreadcrumbItem>
                <BreadcrumbLink href="#">團隊空間</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="#">行銷 OKR Q2</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbEllipsis />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="#">Email 再行銷</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>5 月電子報 A/B 測試</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          世界級對照:GitHub / Notion / Linear breadcrumb 皆採「ancestor 降飽和 + current 實」階層策略,避免整條 breadcrumb 視覺等權造成「不知道在哪」的混亂。
        </p>
      </div>

      <div>
        <H3>為什麼 current 不加粗</H3>
        <Desc>
          加粗會讓 breadcrumb 最右端視覺過重,破壞「你從哪來 → 你在這」的流動感。
          改以 `--foreground` vs `--fg-secondary` 的色階區分——對齊 Notion / Figma 的輕量 current 呈現;
          重要性反差由 font-color 處理,非 font-weight。
        </Desc>
      </div>
    </div>
  ),
}

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>三種 Size — 配對 page title 字級</H3>
        <Desc>Breadcrumb size 依據與之配對的 page title 選擇,維持階層視覺平衡。</Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Size</Th><Th>字體 Token</Th><Th>Separator icon</Th><Th>配對 title</Th><Th>使用場景</Th></tr></thead>
            <tbody>
              <tr><Td mono>sm</Td><Td mono>text-body(14px)</Td><Td mono>16px</Td><Td mono>text-h4(20px)</Td><Td>Dialog / panel / drawer header</Td></tr>
              <tr><Td mono>md ★default</Td><Td mono>text-body(14px)</Td><Td mono>16px</Td><Td mono>text-h3(24px)</Td><Td>一般頁面 header</Td></tr>
              <tr><Td mono>lg</Td><Td mono>text-body-lg(16px)</Td><Td mono>20px</Td><Td mono>text-h2(32px)</Td><Td>Detail page hero / landing</Td></tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-6">
          {(['sm', 'md', 'lg'] as const).map(size => (
            <div key={size} className="border border-dashed border-divider rounded-md p-4">
              <div className="text-caption text-fg-muted mb-2 font-mono">size="{size}"</div>
              <Breadcrumb>
                <BreadcrumbList size={size}>
                  <BreadcrumbItem><BreadcrumbLink href="#">專案</BreadcrumbLink></BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem><BreadcrumbLink href="#">Q1 行銷活動</BreadcrumbLink></BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem><BreadcrumbPage>電子報設計</BreadcrumbPage></BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>三種節點狀態對照</H3>
        <Desc>
          上層 / 中層 link 用 fg-secondary(中性,不搶視覺),當前 Page 用 foreground 但不加粗
          ——加粗會讓 breadcrumb 最右端視覺過重,破壞「你從哪來 → 你在這」的流動感。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead><tr><Th>節點</Th><Th>Default 色</Th><Th>Hover 色</Th><Th>Weight</Th><Th>可互動</Th></tr></thead>
            <tbody>
              <tr>
                <Td mono>BreadcrumbLink</Td>
                <Td><TokenCell token="--fg-secondary" /></Td>
                <Td><TokenCell token="--primary-hover" display="primary-hover" /></Td>
                <Td>regular</Td>
                <Td>✓</Td>
              </tr>
              <tr>
                <Td mono>BreadcrumbPage</Td>
                <Td><TokenCell token="--foreground" /></Td>
                <Td>—(disabled)</Td>
                <Td>regular</Td>
                <Td>❌(aria-current="page")</Td>
              </tr>
              <tr>
                <Td mono>BreadcrumbSeparator</Td>
                <Td><TokenCell token="--fg-muted" /></Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>❌(role="presentation")</Td>
              </tr>
              <tr>
                <Td mono>BreadcrumbEllipsis</Td>
                <Td><TokenCell token="--fg-muted" /></Td>
                <Td><TokenCell token="--foreground" display="foreground + neutral hover bg" /></Td>
                <Td>—</Td>
                <Td>✓(button)</Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          Hover 色採 `primary-hover`(標準互動高亮),跟 Tabs / Chip 未選 hover 用同一組 token
          ——全系統互動 affordance 保持一致。
        </p>
      </div>

      <div>
        <H3>實際三態(hover 可在 Storybook 上試)</H3>
        <div className="border border-dashed border-divider rounded-md p-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#">Link(預設 fg-secondary)</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="#">Hover 我(→ primary-hover)</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Current Page(foreground, 不可點)</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>
    </div>
  ),
}

export const UsageExamples: Story = {
  name: '真實場景',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>檔案管理器路徑</H3>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="#">Documents</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="#">Projects</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="#">2026-Q1</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>spec.md</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div>
        <H3>電商多層分類</H3>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="#">首頁</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="#">Electronics</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="#">Phones</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>iPhone 15 Pro</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div>
        <H3>App 內部階層(專案 / 子專案 / 任務)</H3>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="#">Engineering</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="#">Design System</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="#">Sprint 23</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Button 重構</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  ),
}

export const CollapseMatrix: Story = {
  // renumbered to 7 (was 6) to accommodate ColorMatrix(3) + UsageExamples(6)
  name: '長路徑收合（Ellipsis）',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>路徑過長時用 Ellipsis 收合中間</H3>
        <Desc>保留第一層(根)+ 最後兩層(當前 + 上一層),中間以 `...` 取代。使用者需要看到「我在哪裡」+「根位置」,中間層通常不需要完整可見。</Desc>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbEllipsis />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">專案</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>設定</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <p className="text-footnote text-fg-muted mt-3">本 story 為靜態結構展示:手動 `&lt;BreadcrumbItem&gt;&lt;BreadcrumbEllipsis /&gt;` 只渲染 ⋯ 按鈕本身(消費 ItemInlineActionButton,帶 aria-label / focus / hover bg),未接 DropdownMenu — 此處點擊無展開行為。完整互動接線(Ellipsis 包在 DropdownMenuTrigger 內展開中間層)見展示層「可互動省略」story;declarative `items` 與 compositional 超過 `maxItems` 的自動收合路徑則由元件自動接上 DropdownMenu。</p>
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
      <p className="whitespace-pre-line">{"Breadcrumb 結構是原生 HTML(nav + ol + li + a/span);asChild 多型渲染用 Radix Slot,但 Slot 只合併 prop、不管理焦點 / ARIA / 鍵盤(非行為型 primitive)。摘要:\n\n  ARIA  :外層 nav 帶 aria-label=\"Breadcrumb\";當前頁 BreadcrumbPage 帶 aria-current=\"page\";分隔符 aria-hidden 不進無障礙樹。a11y 行為來自原生 HTML 語意,非 Slot 提供。\n\n  Keyboard 行為  :\n\n- Tab — 逐個 link 依序聚焦(每個連結都是獨立 tab stop,無 focus trap)\n- Enter — 觸發連結導覽\n\n  Focus  :聚焦時顯示 visible ring — BreadcrumbLink 用 ring-2 ring-ring ring-offset-1(box-shadow ring),BreadcrumbEllipsis 按鈕用 outline-2 outline-ring;連結逐個依序聚焦,不攔截焦點。\n\n  驗證  :Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。"}</p>
    </div>
  ),
}

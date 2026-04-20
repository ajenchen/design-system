import type { Meta, StoryObj } from '@storybook/react'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from './breadcrumb'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/components/_anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Breadcrumb/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>Breadcrumb 是純 HTML + Tailwind 元件(無 Radix primitive),基於 shadcn/ui Breadcrumb 結構橋接 DS token。使用 `&lt;nav aria-label="Breadcrumb"&gt;` 確保正確 a11y。</Desc>
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
              <tr><Td mono>BreadcrumbPage</Td><Td>當前頁(最末項,不可點擊)</Td><Td mono>&lt;span aria-current="page"&gt;</Td></tr>
              <tr><Td mono>BreadcrumbSeparator</Td><Td>ChevronRight 分隔符</Td><Td mono>&lt;li role="presentation"&gt;</Td></tr>
              <tr><Td mono>BreadcrumbEllipsis</Td><Td>中間層過多時的省略符</Td><Td>—</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const CollapseMatrix: Story = {
  name: '長路徑收合(Ellipsis)',
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
        <p className="text-footnote text-fg-muted mt-3">Ellipsis 可以 hover 展開中間層(consumer 自行實作互動,本元件只渲染 `...` icon)</p>
      </div>
    </div>
  ),
}

export const SizeMatrix: Story = {
  name: 'Size 對照(sm / md / lg)',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>三種 Size — 配對 page title 字級</H3>
        <Desc>Breadcrumb size 依據與之配對的 page title 選擇,維持階層視覺平衡。</Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Size</Th><Th>字體 Token</Th><Th>Separator icon</Th><Th>配對 title</Th><Th>使用場景</Th></tr></thead>
            <tbody>
              <tr><Td mono>sm</Td><Td mono>text-body(14px)</Td><Td mono>14px</Td><Td mono>text-h4(20px)</Td><Td>Dialog / panel / drawer header</Td></tr>
              <tr><Td mono>md ★default</Td><Td mono>text-body(14px)</Td><Td mono>14px</Td><Td mono>text-h3(24px)</Td><Td>一般頁面 header</Td></tr>
              <tr><Td mono>lg</Td><Td mono>text-body-lg(16px)</Td><Td mono>16px</Td><Td mono>text-h2(32px)</Td><Td>Detail page hero / landing</Td></tr>
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
  name: '狀態行為(Link / Page / Hover)',
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
                <Td><TokenCell token="--primary-hover" display="primary-hover" /></Td>
                <Td>—</Td>
                <Td>✓(button)</Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          Hover 色採 `primary-hover`(canonical 互動高亮),跟 Tabs / Chip 未選 hover 用同一組 token
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

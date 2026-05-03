// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
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
  name: 'Default',
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
  name: 'Interactive ellipsis',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="text-caption text-fg-muted max-w-xl">
        BreadcrumbEllipsis 永遠是 <code>&lt;button&gt;</code>,搭配
        <code> DropdownMenuTrigger asChild </code>把 dropdown 行為注入。
        點擊 <code>⋯</code> 開選單顯示折疊路徑,hover 時字色變 primary-hover,
        跟 BreadcrumbLink 同語言。對齊 Material / Atlassian / Ant Design 作法。
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

// ── Sizes (配對 page title) ────────────────────────────────────────────────

export const AllSizes: Story = {
  name: 'Sizes',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <div className="text-caption text-fg-muted mb-2">
          <strong>sm</strong> — text-body(14) 配 text-h4(20),Dialog / panel / drawer 內的小 header
        </div>
        <Breadcrumb>
          <BreadcrumbList size="sm">
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Workspace</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/settings">Settings</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h4 className="text-h4 font-medium text-foreground mt-0.5">一般設定</h4>
      </div>

      <div>
        <div className="text-caption text-fg-muted mb-2">
          <strong>md</strong>(預設)— text-body(14) 配 text-h3(24),一般頁面 header
        </div>
        <Breadcrumb>
          <BreadcrumbList size="md">
            <BreadcrumbItem>
              <BreadcrumbLink href="/">首頁</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/projects">專案</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h3 className="text-h3 font-medium text-foreground mt-0.5">我的新專案</h3>
      </div>

      <div>
        <div className="text-caption text-fg-muted mb-2">
          <strong>lg</strong> — text-body-lg(16) 配 text-h2(32),Detail page hero / landing
        </div>
        <Breadcrumb>
          <BreadcrumbList size="lg">
            <BreadcrumbItem>
              <BreadcrumbLink href="/">首頁</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/products">產品</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h2 className="text-h2 font-medium text-foreground mt-0.5">產品 X 旗艦版</h2>
      </div>
    </div>
  ),
}

// ── Deep hierarchy (不折疊, 完整顯示) ──────────────────────────────────────

export const Deep: Story = {
  name: 'Deep',
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/">首頁</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="/org">組織</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="/org/team">產品團隊</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="/org/team/members">成員管理</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Alice 的權限設定</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  ),
}

// ── Two levels (最小合理深度) ─────────────────────────────────────────────

export const TwoLevels: Story = {
  name: 'Two Levels',
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/docs">文件</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>快速開始</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  ),
}

// ── asChild (整合 router Link) ─────────────────────────────────────────────

export const AsChildRouterLink: Story = {
  name: 'asChild prop',
  render: () => (
    <div className="flex flex-col gap-2">
      <div className="text-caption text-fg-muted">
        BreadcrumbLink 支援 asChild, 可把 React Router / Next.js Link 塞進來, 繼承樣式:
      </div>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              {/* 模擬 <Link to="/"> 用 a 代替 */}
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

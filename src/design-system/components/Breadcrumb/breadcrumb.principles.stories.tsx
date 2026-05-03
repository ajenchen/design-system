// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Home } from 'lucide-react'
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
import { Tabs, TabsList, TabsTrigger } from '@/design-system/components/Tabs/tabs'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/Breadcrumb/設計原則',
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
    <div className="flex flex-col gap-3">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── 定位與分界 ─────────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 Breadcrumb ──────────────────────

// ── 最後一項 ────────────────────────────────────────────────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsTabsRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Breadcrumb 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Breadcrumb/展示" name="Interactive ellipsis"><span className="text-primary hover:underline font-medium cursor-pointer">Interactive ellipsis</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Breadcrumb/展示" name="Deep"><span className="text-primary hover:underline font-medium cursor-pointer">Deep</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Breadcrumb/展示" name="Two Levels"><span className="text-primary hover:underline font-medium cursor-pointer">Two Levels</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Breadcrumb/展示" name="asChild prop"><span className="text-primary hover:underline font-medium cursor-pointer">asChild prop</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* vs 近親 — VsTabsRule — 原 VsTabsRule */}
      <div>
      <Rule
        title="Breadcrumb — 「你在哪裡」的階層位置"
        note="表達 parent-child 關係,使用者看 breadcrumb 知道「我從哪一層走到這裡」,點前面任一層可回到上層"
      >
        <div>
          <Label>✅ 電商產品頁：顯示目前商品在分類樹的位置</Label>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#">首頁</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="#">家電</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="#">手機</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>iPhone 15 Pro</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div>
          <Label>✅ 文件系統：檔案深在多層資料夾裡</Label>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#">我的雲端硬碟</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="#">專案</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="#">2026 Q2</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>產品規格書.pdf</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </Rule>

      <Rule
        title="❌ 用 Breadcrumb 做平行 view 切換 → 應該用 Tabs"
        note="若三者是「同一層級的不同 view」(訂單 / 顧客 / 產品都是 dashboard 的不同頁),那是 Tabs。Breadcrumb 表達「上下層」,不是「並列切換」"
      >
        <div>
          <Label>❌ 錯用：這三者是平行 view,沒有 parent-child 關係</Label>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#">訂單</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="#">顧客</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>產品</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Label warn>↑ 改用 Tabs</Label>
          <Tabs defaultValue="products" className="mt-2">
            <TabsList>
              <TabsTrigger value="orders">訂單</TabsTrigger>
              <TabsTrigger value="customers">顧客</TabsTrigger>
              <TabsTrigger value="products">產品</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Rule>

      <Rule
        title="❌ 單層頁面加 Breadcrumb"
        note="只有一個 item 的 breadcrumb 沒導覽價值,只增加視覺噪音。單層頁面用 page title + 可選 back button 即可"
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>設定</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Label warn>↑ 只有一層,不需要 breadcrumb。直接用 page title</Label>
      </Rule>
    </div>
    </div>
  ),
}

export const LastItemRule: Story = {
  name: '最後一項是位置標示，不是 link',
  render: () => (
    <div>
      <Rule
        title="最後一項用 BreadcrumbPage — 目前頁面,無處可點"
        note="使用者已經在這一頁,點它去哪裡?世界級 DS(Material / Atlassian / Polaris)都把最後一項渲染成非互動文字。加上 aria-current='page' 給螢幕閱讀器"
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">專案</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">設計系統</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>元件庫（目前頁）</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Label>↑ 「元件庫」是目前頁,foreground 深色但不加粗、不可點</Label>
      </Rule>

      <Rule
        title="❌ 最後一項做成 link"
        note="點下去會導回同一頁造成困惑。使用者預期點 link 會去新頁面,違反預期就是 broken UX"
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">專案</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">元件庫（錯：目前頁卻做成 link）</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Label warn>↑ 最後一項永遠是 BreadcrumbPage,不是 BreadcrumbLink</Label>
      </Rule>
    </div>
  ),
}

// ── 長路徑 ────────────────────────────────────────────────────────────────

export const LongPathRule: Story = {
  name: '長路徑中段折疊（保首尾）',
  render: () => (
    <div>
      <Rule
        title="> 4–5 層時中段折疊成 ⋯，首尾保留"
        note="使用者關心「我從哪裡出發」(第一層)和「我在哪裡」(最後 1–2 層),中段是 context 可以摺疊。Ellipsis 可包在 DropdownMenu 讓使用者展開折疊的中間項"
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">組織</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <BreadcrumbEllipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>部門</DropdownMenuItem>
                <DropdownMenuItem>設計團隊</DropdownMenuItem>
                <DropdownMenuItem>成員管理</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">權限</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>編輯角色</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Label>↑ 組織 › ⋯ › 權限 › 編輯角色(⋯ 可展開看中間項)</Label>
      </Rule>

      <Rule
        title="❌ 不折疊、讓長路徑橫向撐破版面"
        note="窄容器或 mobile 上完整路徑會換行或被截斷,體驗比中段折疊還糟。折疊是主動的資訊階層處理"
      >
        <div className="max-w-sm border border-border rounded-md p-3">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="#">組織</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="#">部門</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="#">設計團隊</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="#">成員管理</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="#">權限</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>編輯角色</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <Label warn>↑ 窄容器塞不下六層,折斷到第二行或超出,不如折疊中段</Label>
      </Rule>
    </div>
  ),
}

// ── 職責範圍 ──────────────────────────────────────────────────────────────

export const ScopeRule: Story = {
  name: '只放階層指示，不塞功能',
  render: () => (
    <div>
      <Rule
        title="Breadcrumb 可容納 icon 強化首項（如 Home）"
        note="首項用 Home icon 是業界慣例(Material / Atlassian),視覺錨點明確。其他 item 通常純文字"
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">
                <Home size={14} aria-hidden /> 首頁
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">設定</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>帳號</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Rule>

      <Rule
        title="❌ 把 Breadcrumb 當 nav bar，塞搜尋 / 按鈕 / avatar"
        note="Breadcrumb 是「位置指示器」,不是 nav。塞功能會變成 nav bar,兩者職責混亂。頁面 header 的其他功能獨立擺放"
      >
        <div className="flex items-center gap-3 border border-border rounded-md p-3">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="#">專案</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Design System</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Button variant="tertiary" size="sm">邀請成員</Button>
          <Button variant="primary" size="sm">新增元件</Button>
        </div>
        <Label warn>↑ 按鈕應該放 page header / action bar,不塞進 breadcrumb</Label>
      </Rule>
    </div>
  ),
}

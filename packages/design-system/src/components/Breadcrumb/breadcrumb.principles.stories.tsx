// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/design-system/components/Tabs/tabs'
import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup } from '@/design-system/components/Button/button-group'
import { ExampleCaption, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/Breadcrumb/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true })

// ── 定位與分界 ─────────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 Breadcrumb ──────────────────────

// ── 最後一項 ────────────────────────────────────────────────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsTabsRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>顯示「目前頁面在資訊階層中的位置」,並提供回到上層的捷徑;適合 3 層以上的階層頁面(專案 / 子專案 / 任務、資料夾路徑、電商多層分類)。</p>
        <TutorialList>
          <li>
            電商多層分類、檔案管理器等深層頁面,路徑過長時中段折疊、點 ⋯ 可展開中間層 —— 見{' '}
            <StoryLink kind="Design System/Components/Breadcrumb/展示" name="可互動省略">可互動省略</StoryLink>
          </li>
          <li>
            路徑由路由 / CMS 資料動態產生,直接傳資料陣列、超過層數自動收合中段 —— 見{' '}
            <StoryLink kind="Design System/Components/Breadcrumb/展示" name="宣告式 API + 自動收合">宣告式 API + 自動收合</StoryLink>
          </li>
          <li>
            SPA 內點麵包屑要走前端路由、不整頁重載 —— 見{' '}
            <StoryLink kind="Design System/Components/Breadcrumb/展示" name="整合 React Router / Next.js Link">整合 React Router / Next.js Link</StoryLink>
          </li>
        </TutorialList>
        <TutorialRule
          title="Breadcrumb — 「你在哪裡」的階層位置"
          note="表達 parent-child 關係,使用者看 breadcrumb 知道「我從哪一層走到這裡」,點前面任一層可回到上層"
        >
          <ExampleGroup>
            <ExampleCaption>✅ 電商產品頁：顯示目前商品在分類樹的位置</ExampleCaption>
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
          </ExampleGroup>
          <ExampleGroup>
            <ExampleCaption>✅ 文件系統：檔案深在多層資料夾裡</ExampleCaption>
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
          </ExampleGroup>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
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
          <ExampleCaption warn>↑ 只有一層,不需要 breadcrumb。直接用 page title</ExampleCaption>
        </TutorialRule>
        <TutorialRule title="❌ 當主導覽用" note="主導覽用 Sidebar 或頂部導覽;Breadcrumb 只反映目前位置,不是全域選單" />
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="❌ 用 Breadcrumb 做平行 view 切換 → 應該用 Tabs"
          note="若三者是「同一層級的不同 view」(訂單 / 顧客 / 產品都是 dashboard 的不同頁),那是 Tabs。Breadcrumb 表達「上下層」,不是「並列切換」"
        >
          <ExampleGroup>
            <ExampleCaption>❌ 錯用：這三者是平行 view,沒有 parent-child 關係</ExampleCaption>
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
            <ExampleCaption warn>↑ 改用 Tabs</ExampleCaption>
            <Tabs defaultValue="products">
              <TabsList>
                <TabsTrigger value="orders">訂單</TabsTrigger>
                <TabsTrigger value="customers">顧客</TabsTrigger>
                <TabsTrigger value="products">產品</TabsTrigger>
              </TabsList>
              <TabsContent value="orders" className="text-body text-fg-muted">訂單列表、篩選與批次出貨</TabsContent>
              <TabsContent value="customers" className="text-body text-fg-muted">顧客名單、分群與生命週期價值</TabsContent>
              <TabsContent value="products" className="text-body text-fg-muted">商品目錄、庫存與上下架狀態</TabsContent>
            </Tabs>
          </ExampleGroup>
        </TutorialRule>
        <TutorialList>
          <li><strong>Steps</strong> —— 流程進度(第幾步);Breadcrumb 是樹狀階層裡的位置,不是進度</li>
          <li><strong>Sidebar</strong> —— 全域導覽;Breadcrumb 是內容標頭裡的局部位置,不取代全域導覽</li>
          <li><strong>連結 / 返回鈕</strong> —— 單一導覽動作;路徑 3 層以上、需要逐層回上時才用 Breadcrumb</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

export const LastItemRule: Story = {
  name: '最後一項是位置標示，不是連結',
  render: () => (
    <TutorialPage>
      <TutorialRule
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
        <ExampleCaption>↑ 「元件庫」是目前頁,foreground 深色但不加粗、不可點</ExampleCaption>
      </TutorialRule>

      <TutorialRule
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
        <ExampleCaption warn>↑ 最後一項永遠是 BreadcrumbPage,不是 BreadcrumbLink</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── 長路徑 ────────────────────────────────────────────────────────────────

export const LongPathRule: Story = {
  name: '長路徑中段折疊（保首尾）',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="> 4–5 層時中段折疊成 ⋯，首尾保留"
        note="使用者關心「我從哪裡出發」(第一層)和「我在哪裡」(最後 1–2 層),中段是 context 可以摺疊。Ellipsis 可包在 DropdownMenu 讓使用者展開折疊的中間項"
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">組織</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            {/* 2026-07-04 修 broken demo:裸 DropdownMenu 會被 BreadcrumbList children filter 丟棄
                (breadcrumb.tsx compositionalContent 只認 BreadcrumbItem)→ 包 BreadcrumbItem
                (對齊 declarative 模式內部 ellipsis 作法) */}
            <BreadcrumbItem>
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
            </BreadcrumbItem>
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
        <ExampleCaption>↑ 組織 › ⋯ › 權限 › 編輯角色(⋯ 可展開看中間項)</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 不折疊、讓長路徑橫向撐破版面"
        note="Breadcrumb 單行不換行(flex-nowrap),窄容器或 mobile 上完整路徑會溢出邊界、被裁切或逼出橫向捲動,體驗比中段折疊還糟。折疊是主動的資訊階層處理"
      >
        {/* maxItems={99} 停用 auto-collapse:負例要示範「不折疊」時六層真的撐破窄容器。
            若用預設 maxItems=4,compositionalContent 會把中段折成 ⋯,反而變成正例 → demo 失效。 */}
        <div className="max-w-sm border border-border rounded-md p-[var(--layout-space-loose)] overflow-x-auto">
          <Breadcrumb>
            <BreadcrumbList maxItems={99}>
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
        <ExampleCaption warn>↑ 窄容器塞不下六層,單行溢出邊界(需橫向捲動才看得完),不如折疊中段</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── 職責範圍 ──────────────────────────────────────────────────────────────

export const ScopeRule: Story = {
  name: '只放階層指示，不塞功能',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Breadcrumb 可容納 icon 強化首項（如 Home）"
        note={<>首項用 Home icon 是業界慣例(Material / Atlassian),視覺錨點明確。其他 item 通常純文字。圖示大小由設計系統統一控制(小 / 中尺寸 16px、大尺寸 20px),你只要用 <code>startIcon</code> 指定要哪個圖示,不用自己設大小。</>}
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#" startIcon={Home}>首頁</BreadcrumbLink>
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
      </TutorialRule>

      <TutorialRule
        title="❌ 把 Breadcrumb 當 nav bar，塞搜尋 / 按鈕 / avatar"
        note="Breadcrumb 是「位置指示器」,不是 nav。塞功能會變成 nav bar,兩者職責混亂。頁面 header 的其他功能獨立擺放"
      >
        <div className="flex items-center gap-[var(--layout-space-loose)] border border-border rounded-md p-[var(--layout-space-loose)]">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="#">專案</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Design System</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          {/* 反例要教的只有「按鈕塞進麵包屑」這一件事;按鈕本身照 action-bar.spec.md:121 排(靠左 → primary 最左,2026-10-20 XF-01) */}
          <ButtonGroup>
            <Button variant="primary" size="sm">新增元件</Button>
            <Button variant="tertiary" size="sm">邀請成員</Button>
          </ButtonGroup>
        </div>
        <ExampleCaption warn>↑ 按鈕應該放 page header / action bar,不塞進 breadcrumb</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

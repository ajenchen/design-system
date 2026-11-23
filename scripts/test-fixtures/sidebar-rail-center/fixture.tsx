// 「收合前後圖示中心不動」(scripts/sidebar-standalone-collapse-invariant.mjs 的 R8)的測試夾具 —— 閘自己掛載的頁面,不是 story。
// 由 scripts/lib/storybook-css-fixture.mjs 用 esbuild 打包、配同一份 storybook 建置的 CSS 在本機靜態頁開。
//
// 為什麼不是 story:
//   DS 沒有任何一則範例是「單獨使用的 Sidebar × size="lg" × 能收成細列」。AppShell「狀態行為」的 `menuSize` 參數給的是 AppShell 裡的那一格;
//   單獨使用的外框寬走 Sidebar 自己讀的 `--sidebar-width-icon`,不經 AppShell 的量值探針,是另一條路,要另外量。
//   size="lg" 的長相在規格頁的尺寸表已有示範,不為了閘再加一則 story。
// 樣式來自「正在服務的那一份建置」:同一支夾具配 2026-11-13 修正前的建置,量到的就是修正前的細列寬
// (一般密度 × size lg 細列 48、圖示收合後往左 2px)—— 新格在修前建置上會紅的證據就是這樣留的。
// 元件行為來自這次 checkout 的原始碼(每次跑閘重新打包)。
//
// 網址參數 `?size=sm|md|lg`(沒給或不認得 = lg);密度由閘寫在 <html data-density>(同 Storybook 預覽的寫法)。
// 閘另有兩格(F3 / F4)在開頁之後把 `data-density` 掛到側欄外框上(一般密度頁面掛大密度、大密度頁面鎖回一般密度),
// 驗 SidebarProvider 外層設的圖示欄穿過外框這道密度邊界繼承下去 —— 那個屬性由閘掛,這支夾具不用為它多一個參數。
// 夾具自己的版面用行內樣式:這個檔不在 Tailwind 的 @source 範圍裡,寫 class 不會產生樣式;DS 元件的樣式來自元件本身。
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/design-system/components/Sidebar/sidebar'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { MAIN_NAV } from '@/design-system/stories-helpers/data/sidebar-nav'

const SIZES = ['sm', 'md', 'lg'] as const
type FixtureSize = (typeof SIZES)[number]
const requested = new URLSearchParams(window.location.search).get('size')
const size: FixtureSize = SIZES.find((s) => s === requested) ?? 'lg'

function Fixture() {
  return (
    // data-fixture-size:給人看頁面時辨認用;閘不讀這個屬性,它確認「這一頁真的是要量的那個 size」靠量畫出來的圖示寬
    <SidebarProvider size={size} defaultActiveId="dashboard" data-fixture-size={size}>
      <Sidebar collapsible="icon">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {MAIN_NAV.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton id={item.id} startIcon={item.icon} tooltip={item.label}>
                      {item.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <main style={{ flex: 1, minWidth: 0, padding: 24 }}>
        <SidebarTrigger />
      </main>
    </SidebarProvider>
  )
}

const root = document.getElementById('fixture-root')
if (!root) throw new Error('sidebar-rail-center fixture:找不到 #fixture-root')
// 與 Storybook 預覽同一層包裝(packages/storybook-config/preview.tsx sharedDecorators:TooltipProvider + 畫布底色 / 字色);
// Storybook 預設不開 StrictMode,這裡也不開(同 field-open-border、dialog-coexistence 夾具)
createRoot(root).render(
  <TooltipProvider delayDuration={500} skipDelayDuration={300}>
    <div style={{ backgroundColor: 'var(--canvas)', color: 'var(--foreground)' }}>
      <Fixture />
    </div>
  </TooltipProvider>,
)

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Header 家族 tabsSlot wrapper className(W2 SSOT,header-canonical.spec.md Rule W2)。
 * 兩家族(ChromeHeader chrome / SurfaceHeader overlay)的 column-mode tabsSlot row 共用此契約:
 * TabsList `w-full`(border-b 延展全寬 = W1 一條線)+ 內 `px-loose` inset triggers(對齊 header content)。
 * SSOT 在此(header-canonical = 跨家族 W-rule owner);overlay-surface.tsx SurfaceHeader 消費同一 const,
 * 禁各自 hardcode(原兩處逐字重複,2026-06-08 收斂為單一 SSOT,per user「照你建議做到完美…不改A壞B」)。
 */
export const HEADER_TABS_SLOT_WRAPPER_CLASS =
  '[&>[role=tablist]]:w-full [&>[role=tablist]]:px-[var(--layout-space-loose)]'

/**
 * Public chrome-header composition primitive(header-canonical Pattern 的 runtime 件,對標 item-anatomy 的 MenuItem/slots:屬公開 Pattern 的可 import primitive)。
 * 標準頁面 chrome 用成品元件(AppShell / Sidebar / FileViewer 內建 header);自建客製 header 才直接消費本 primitive,並 follow header-canonical.spec.md 設計契約。
 *
 * ChromeHeader — Fixed-height chrome header primitive(Layout Family B,header-canonical.spec.md)
 *
 * ── 定位 ──
 * Page chrome 級 header 共用 primitive。封裝重複 contract:
 *   flex items-center gap-2 shrink-0 h-[var(--chrome-header-height)] border-b border-divider px-[var(--layout-space-loose)]
 *
 * Consumers:Sidebar / FileViewer Toolbar / FileViewer InfoPanel / 未來 page top bar / Drawer
 * 跟 SurfaceHeader(overlay padding-based)是兩個並存家族(per header-canonical.spec.md L23-30)。
 *
 * ── 實作基礎 ──
 * 消費:--chrome-header-height(48/56 density-responsive)/ --layout-space-loose / border-divider
 * 對應 pattern:patterns/header-canonical
 *
 * ── 消費的 SSOT ──
 * - tokens: [--chrome-header-height, --layout-space-loose, --divider]
 * - patterns: [header-canonical(本 pattern), overlay-surface(姊妹 SurfaceHeader)]
 * - spec refs: patterns/header-canonical/header-canonical.spec.md(L23-30 家族區分 / W1 border / W3 tabs size / Layer 3 ChromeHeader API)
 *
 * ── API(per M31 codex 比稿 Step 5 — narrow API,避免 M21 prop variant 風險)──
 * withTabs?: boolean(預設 false)
 *   true → 移除自身 border-b,delegate paint 給 TabsList(per W1「Header semantic owner / TabsList paint owner in withTabs state」)
 * lockDensity?: 'inherit' | 'lg'(預設 'inherit')
 *   'inherit' → 跟 page density(html[data-density] 自動)
 *   'lg' → 強制 lg(viewer-fullscreen-chrome escape hatch,FileViewer 永遠 lg-equivalent design intent)
 *
 * 不開:density?: 'md' | 'lg' 自由 prop。M21 違反 — 任意 density 等於 cva-on-pattern。
 */
export interface ChromeHeaderProps
  extends React.HTMLAttributes<HTMLElement> {
  /**
   * 是否內含 Tabs。
   * true(無 tabsSlot)→ 移除自身 border-b,consumer 自畫。
   * 若提供 tabsSlot,自動 column mode + auto suppress border。
   * 對應 patterns/header-canonical/header-canonical.spec.md W1
   */
  withTabs?: boolean
  /**
   * Tabs row slot(2026-05-18 加 per W2/W4 真實能用 + user-mandated fix)。
   * 提供時 ChromeHeader 自動 column 結構:
   *   row 1 = children(h-chrome-header-height 固定,px-loose,跟 single-row 模式同)
   *   row 2 = tabsSlot 包在 `HEADER_TABS_SLOT_WRAPPER_CLASS` wrapper
   *           (`[&>[role=tablist]]:w-full` + 注入 TabsList 內 px-loose;wrapper 本身
   *           無 padding 無 border——border 由 TabsList 自畫,W1 全寬 paint 一條線)
   *
   * Consumer 傳:`tabsSlot={<TabsList>...</TabsList>}`,TabsContent 放 ChromeHeader 之外。
   * Standalone Tabs(無 chrome header)該直接用 `<TabsList>` 不需 wrapper。
   *
   * 提供 tabsSlot 自動 withTabs=true,不需另傳 prop。
   */
  tabsSlot?: React.ReactNode
  /**
   * 是否鎖死 lg density(viewer-fullscreen chrome 用)。
   * 'inherit'(預設)→ 跟 page density
   * 'lg' → 強制 chrome-header-height lg(56)
   * 對應 patterns/header-canonical/header-canonical.spec.md Layer 3 API
   */
  lockDensity?: 'inherit' | 'lg'
  /**
   * Leading rail slot(2026-05-21 ship per AppShell primary-header globalHeader 用例,
   * codex M31 Layer C 建議 codify into ChromeHeader API):
   * 固定寬度 = `var(--sidebar-width-icon)` 的左邊容器,內 `justify-center` 排列。
   *
   * 用途:primary-header globalHeader 左側 SidebarTrigger,跟 sidebar 收合 icon 完美水平對齊
   * (sidebar 收合 width = sidebar-width-icon,toggle container 同寬 = toggle center x = sidebar
   * collapsed icon center x = perfect alignment)。
   *
   * 對齊 GitHub global nav 左側固定寬度 logo 區 / Slack thin workspace rail 慣例。
   * 提供時自動結構:
   *   row1: [leadingRail (width=sidebar-width-icon)] [children (px-loose flex-1)]
   * 不提供時 fallback 預設 single-row(全 px-loose)。
   *
   * 與 tabsSlot 互斥(tabsSlot 啟動 column mode,本 prop 不生效)。
   */
  leadingRail?: React.ReactNode
}

export const ChromeHeader = React.forwardRef<HTMLElement, ChromeHeaderProps>(
  (
    { className, withTabs, tabsSlot, lockDensity = 'inherit', leadingRail, children, ...props },
    ref,
  ) => {
    const hasTabs = tabsSlot != null || withTabs === true

    // Column mode(tabsSlot 提供時)— per W2 + W4
    // 2026-05-20:`<div>` → `<header>`(HTML5 sectional content 允許 multiple `<header>`,
    // page-level / sectional 都 a11y safe;統一 element contract 消除「何時用 header / 何時用 div」
    // 的 consumer drift)。 對應 header-canonical.spec.md 「Element canonical」段。
    if (tabsSlot != null) {
      return (
        <header
          ref={ref}
          data-density={lockDensity === 'lg' ? 'lg' : undefined}
          className={cn('flex flex-col shrink-0', className)}
          {...props}
        >
          {/* Row 1:header content(固定高度,跟 single-row 模式同 visual)*/}
          <div
            className={cn(
              'flex items-center gap-2',
              'h-[var(--chrome-header-height)]',
              'px-[var(--layout-space-loose)]',
            )}
          >
            {children}
          </div>
          {/* Row 2:tabsSlot wrapper — TabsList 全 dialog 寬 + 內 px-loose inset triggers
              2026-05-18 v3 fix(同 SurfaceHeader,per user verbatim「分隔線寬度應該要填滿整個
              dialog」+「就這樣做」approval):TabsList 自己 px-loose 內 padding 而非 wrapper
              提供,讓 TabsList border-b 延展全 dialog 寬。對齊 `tabs.spec.md:199` 既有 canonical。*/}
          <div className={HEADER_TABS_SLOT_WRAPPER_CLASS}>
            {tabsSlot}
          </div>
        </header>
      )
    }

    // Leading rail mode(2026-05-21 ship per AppShell primary-header globalHeader):
    // [leadingRail (width=sidebar-width-icon, justify-center)] [children (flex-1 px-loose)]
    // 整 header 仍 fixed-height chrome-header-height + border-b。Rail 容器無 padding(內元素
    // 透過 sidebar-width-icon 幾何自然居中,跟 sidebar 收合 icon center x 對齊)。
    if (leadingRail != null) {
      return (
        <header
          ref={ref}
          data-density={lockDensity === 'lg' ? 'lg' : undefined}
          className={cn(
            'flex items-center shrink-0',
            'h-[var(--chrome-header-height)]',
            !hasTabs && 'border-b border-divider',
            className,
          )}
          {...props}
        >
          {/* Rail:固定寬度 = sidebar-width-icon,內容 justify-center 居中(toggle center x
              = rail 寬度的中點 = sidebar 收合 icon center x = 完美 vertical 對齊)
              2026-05-21 v2 user 抓:rail 右側加 `border-r border-divider`,sidebar 收合到
              icon mode 時 rail 右 border = sidebar 右 border 連成一線(visual continuity)。 */}
          <div className="flex w-[var(--sidebar-width-icon)] shrink-0 items-center justify-center border-r border-divider">
            {leadingRail}
          </div>
          {/* Main:flex-1 + px-loose(沿用 header 既有左右 padding canonical)+ gap-2 */}
          <div className="flex flex-1 items-center gap-2 min-w-0 px-[var(--layout-space-loose)]">
            {children}
          </div>
        </header>
      )
    }

    // Single-row(預設 + withTabs=true 但無 tabsSlot 的 backward compat)
    return (
      <header
        ref={ref}
        data-density={lockDensity === 'lg' ? 'lg' : undefined}
        className={cn(
          'flex items-center gap-2 shrink-0',
          'h-[var(--chrome-header-height)]',
          'px-[var(--layout-space-loose)]',
          // W1:無 tabs 自畫 border;withTabs=true(無 tabsSlot)consumer 自畫
          !hasTabs && 'border-b border-divider',
          className,
        )}
        {...props}
      >
        {children}
      </header>
    )
  },
)
ChromeHeader.displayName = 'ChromeHeader'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
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
  extends React.HTMLAttributes<HTMLDivElement> {
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
   *   row 2 = tabsSlot 包在 `<div px-loose border-b border-divider>`
   *           ↑ wrapper 提供 W2 padding inheritance + W1 全寬 paint(一條線)
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
}

export const ChromeHeader = React.forwardRef<HTMLDivElement, ChromeHeaderProps>(
  (
    { className, withTabs, tabsSlot, lockDensity = 'inherit', children, ...props },
    ref,
  ) => {
    const hasTabs = tabsSlot != null || withTabs === true

    // Column mode(tabsSlot 提供時)— per W2 + W4
    if (tabsSlot != null) {
      return (
        <div
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
          {/* Row 2:tabsSlot wrapper — W2 padding inheritance + W1 全寬 paint */}
          <div className="px-[var(--layout-space-loose)] border-b border-divider">
            {tabsSlot}
          </div>
        </div>
      )
    }

    // Single-row(預設 + withTabs=true 但無 tabsSlot 的 backward compat)
    return (
      <div
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
      </div>
    )
  },
)
ChromeHeader.displayName = 'ChromeHeader'

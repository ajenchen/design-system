import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * @internal — DS-internal primitive(2026-05-23 per `.claude/rules/ui-development.md` Public vs Internal canonical)。
 * end-user app 直接 import 無 functioning UI;由 Dialog / Sheet / Popover / HoverCard / Coachmark 等 DS overlay 元件 wrap 消費。
 *
 * Overlay Surface primitives — Dialog / Popover / Sheet 共用結構化 sub-components。
 *
 * 抽象這層避免各自硬寫 padding / border 導致漂移。有特殊行為(Dialog Close 按鈕 /
 * viewport-fill 高度)由 consumer 額外包裝,不污染 primitive。
 *
 * ── Header / Footer 高度 canonical(2026-04-22 v3 校準,user intent 精確實作)──
 * **Padding-based sizing**:`py-[var(--layout-space-tight)]`,高度 = max(child) + 2×tight
 * 不用 fixed `min-h`(先前誤用 min-h-chrome-header-height 會讓 bounded button 被鎖死在 48
 * slot 失去自然高度,違反 user 意圖)。
 *
 * 對齊 `--chrome-header-height`(48/56)的**條件**:header 只放 unbounded 控件(close X /
 * text variant button,**native sm + v5 unbounded trick layout 佔位 24**):
 *   header = 24 + 2×tight = 48 md / 56 lg ✓。
 *
 * 若 header 塞 **bounded 控件**(primary / tertiary with bg/border):header 自然長高
 * (sm 28 + 2×12 = 52 md),因 bounded 按鈕有視覺邊界,padding 不會顯得過大 — 這是預期的。
 *
 * ── Unbounded controls 在 header canonical(v5 trick,2026-04-22)──
 * Dismiss X(always unbounded)+ text variant header action → **`size="sm"` native**
 * + SurfaceHeader CSS 自動套負 my trick(對 `[data-unbounded]`),layout 佔位縮回 24
 * (xs 等同)。Rationale:button native size 跟 touch target 保留 sm(a11y 最小 24+ hit
 * target,視覺 render 仍 28/32),layout 佔位精確匹配 chrome-header-height 幾何。詳
 * `overlay-surface.spec.md`「Chrome dismiss size canonical」。
 *
 * **Notification banner family**(Notice / Alert / Toast,fixed `px-4 py-3` variant,
 * 無 padding-based header)→ dismiss 用 `size="xs"` explicit(24 固定,無 trick)。
 *
 * ── Token 規則 ──
 * horizontal padding: `px-[var(--layout-space-loose)]`
 * vertical padding: `py-[var(--layout-space-tight)]`
 * 分隔線: `border-{b|t} border-divider`
 *
 * ── Body ──
 * Body padding-based(content area),`px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]`。
 * Dialog / Sheet body 走 ScrollArea + chrome padding(`px-loose pt-tight pb-bottom`)。
 * List-as-region 場景(menu / Cmd+K)由 consumer 用 className override 撤 chrome padding +
 * 自管 list outer wrapper(詳 overlay-surface.spec.md「List-as-region in overlay body」)。
 */

// Chrome-slot layout trick(2026-04-22 v5,2026-05-04 重思 parameterize):
// **所有 unbounded control**(Button with `data-unbounded="true"` — Button 自動在 variant="text" 或 dismiss
// 時標記)的 **native size 不變**(sm: 28 md / 32 lg),但 **layout 佔位** via 負 `my` 縮成 `--chrome-slot-h`。
//
// **Slot height = header title 的 line-height**(讓 button 不 dominate,title 自然撐 header)
//   - Default `var(--field-height-xs)` = 24,匹配 Dialog/Sheet text-body-lg (16 × 1.5 = 24)
//   - Popover/Coachmark override `--chrome-slot-h: 1.25rem` (20),匹配 text-body (14 × 1.5 ≈ 21,floor 20)
//
// Header 永遠 padding-based(無 min-h),但因 slot ≤ title line-height,header 高度由 title 主導:
//   - Dialog: max(24 title, 24 slot) + py-tight(12*2)= 48 ✓ chrome-header-height
//   - Popover: max(21 title, 20 slot) + py-tight(12*2)= 45 ✓ 自然輕量
// Q10 穩定性:title-only / title+button / refresh in/out 全 case header 高度 = title + py(slot 不 dominate)
//
// 負 my 公式:(slot - native) / 2,density-aware:
//   Dialog md: (24 - 28) / 2 = -2px;  lg: (24 - 32) / 2 = -4px
//   Popover md: (20 - 28) / 2 = -4px
const CHROME_UNBOUNDED_SLOT = '[&_[data-unbounded]]:my-[calc((var(--chrome-slot-h,var(--field-height-xs))-var(--field-height-sm))/2)]'

export interface SurfaceHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * 是否內含 Tabs。
   * true(無 tabsSlot)→ 移除自身 border-b。
   * 若提供 tabsSlot,自動 column mode + auto suppress border(不需手動傳 withTabs=true)。
   * 對齊 patterns/header-canonical/header-canonical.spec.md W1
   * 「Header semantic owner / TabsList paint owner in withTabs state」。
   */
  withTabs?: boolean
  /**
   * Tabs row slot(2026-05-18 加 per header-canonical.spec.md W2/W4 真實能用 + user-mandated fix)。
   * 提供時 SurfaceHeader 自動 column 結構:
   *   row 1 = children(title + actions/dismiss,px-loose py-tight)
   *   row 2 = tabsSlot 包在 `<div px-loose border-b border-divider>`
   *           ↑ wrapper 提供 W2 padding inheritance + 全寬 paint(W1 視覺一條線)
   *
   * Consumer 傳:`tabsSlot={<TabsList>...</TabsList>}`,TabsContent 仍放 DialogBody 內。
   * `<Tabs>` root 必須 wrap 整 DialogContent(Radix TabsList ↔ TabsContent 同 root 連動)。
   *
   * 提供 tabsSlot 自動 withTabs=true,不需另傳 prop。
   */
  tabsSlot?: React.ReactNode
}

export const SurfaceHeader = React.forwardRef<
  HTMLDivElement,
  SurfaceHeaderProps
>(({ className, withTabs, tabsSlot, children, ...props }, ref) => {
  // tabsSlot 提供 → 自動 withTabs(consumer 不需手動兩個 prop)
  const hasTabs = tabsSlot != null || withTabs === true

  // Column mode(tabsSlot 提供時)— 對應 header-canonical.spec.md W2 + W4
  if (tabsSlot != null) {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col shrink-0', className)}
        {...props}
      >
        {/* Row 1:header content row(原 single-row behavior 不變,但 border-b 撤掉,row 2 wrapper 接管 paint)*/}
        <div
          className={cn(
            'flex items-center gap-2',
            'px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]',
            CHROME_UNBOUNDED_SLOT,
          )}
        >
          {children}
        </div>
        {/* Row 2:tabsSlot wrapper — TabsList 全 dialog 寬 + 內 px-loose padding inset triggers
            2026-05-18 v3 fix(user verbatim approval「你確定這樣是世界級的設計且符合我們一致的設計
            語言和 SSOT...就這樣做」):
            - v1: wrapper border + TabsList border = 雙線(W1 違反)
            - v2: wrapper px-loose + TabsList w-full inside = border 只跨 dialog - 2×px-loose
                 (不到 dialog 邊 user 抓「分隔線寬度應該要填滿整個 dialog」)
            - v3(本):wrapper 不 inset,TabsList 自己 px-loose 內 padding inset triggers
                  → TabsList border-b 延展全 dialog 寬,triggers 對齊 header content
            對齊既有 `tabs.spec.md:199`「TabsList 自身 border-b border-border 延展全 header 寬,因
            TabsList wrapper 是 block-level full-width」+ `:187-189`「selected 底線從 TabsList
            gray border 位置長出來」+ GitHub Primer UnderlineNav / Ant Design line type / Mantine
            default 共識(全派 TabsList 自畫 full-width underline)。*/}
        <div className="[&>[role=tablist]]:w-full [&>[role=tablist]]:px-[var(--layout-space-loose)]">
          {tabsSlot}
        </div>
      </div>
    )
  }

  // Padding-based(預設) — Dialog/Sheet 用 body-lg title (16/24)，自然撐 max(24 title, 24 button slot) = 24
  // → header = 24 + py-tight 12×2 = 48 chrome-header-height ✓ 穩定無需 min-h
  // Popover 等輕量 chrome 走 PopoverHeader override(min-h-10 + py-2 = 40,內 24 匹配 button slot)
  //
  // withTabs=true(無 tabsSlot,backward compat):移除 border-b,consumer 自畫
  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-2 shrink-0',
        !hasTabs && 'border-b border-divider',
        'px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]',
        CHROME_UNBOUNDED_SLOT,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
})
SurfaceHeader.displayName = 'SurfaceHeader'

export const SurfaceBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  // 2026-05-04 viewport-aware scroll canonical:
  //   parent(PopoverContent / HoverCardContent / Dialog / Sheet)是 flex flex-col + max-h + overflow-hidden
  //   header / footer shrink-0;Body flex-1 min-h-0 overflow-y-auto → 視窗太小時 body 內 scroll
  //   非 flex-col parent 內 flex-1/min-h-0 no-op,backward compat
  <div
    ref={ref}
    className={cn(
      'flex-1 min-h-0 overflow-y-auto',
      'px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]',
      className,
    )}
    {...props}
  />
))
SurfaceBody.displayName = 'SurfaceBody'

export const SurfaceFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex items-center justify-end gap-2 shrink-0 border-t border-divider',
      'px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]',
      className,
    )}
    {...props}
  />
))
SurfaceFooter.displayName = 'SurfaceFooter'

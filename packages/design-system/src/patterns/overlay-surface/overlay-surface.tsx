import * as React from 'react'
import { cn } from '@/lib/utils'
// W2 tabsSlot wrapper 契約 SSOT 在 header-canonical(跨家族 W-rule owner);SurfaceHeader 消費同一 const 不 hardcode。
import { HEADER_TABS_SLOT_WRAPPER_CLASS } from '@/design-system/patterns/header-canonical/chrome-header'

/**
 * @internal — DS-internal primitive(2026-05-23 per `.claude/rules/ui-development.md` Public vs Internal canonical)。
 * end-user app 直接 import 無 functioning UI;由 Dialog / Sheet / Popover / Coachmark 等 DS overlay 元件 wrap 消費(HoverCard 不消費 — 2026-07-04 grep 0 import,spec「何時不用」同步)。
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
//   - Default 衍生自 title typography:`calc(var(--font-body-lg-size)*1.5)` = 16×1.5 = 24(Dialog/Sheet title = text-body-lg)。
//     2026-06-16:從寫死 `var(--field-height-xs)`(巧合也=24)改為衍生 → title 字級若改,slot 自動跟、不靠巧合(M17 SSOT;
//     1.5 = typography.spec body 行高常數,非 token 故 inline,若 body 行高改 1.3 須同步此處)。
//   - Popover-tier(title = text-body)走 `COMPACT_HEADER_SLOT`(見下)= calc(--font-body-size×1.5) = 14×1.5 = 21
//     (= PopoverTitle text-body line-box,衍生非寫死;2026-06-16 從各自寫死 1.25rem/20 巧合值收斂進 SSOT)
//
// Header 永遠 padding-based(無 min-h),但因 slot = title line-box,header 高度由 title 主導:
//   - Dialog: max(24 title, 24 slot) + py-tight(12*2)= 48 ✓ chrome-header-height
//   - Popover: max(21 title, 21 slot) + py-tight(12*2)= 45 ✓ 自然輕量
// Q10 穩定性:title-only / title+button / refresh in/out 全 case header 高度 = title + py(slot=title,不超過)
//
// 負 my 公式:(slot - native) / 2,density-aware:
//   Dialog md: (24 - 28) / 2 = -2px;  lg: (24 - 32) / 2 = -4px
//   Popover md: (21 - 28) / 2 = -3.5px(sub-pixel,可接受)
const CHROME_UNBOUNDED_SLOT = '[&_[data-unbounded]]:my-[calc((var(--chrome-slot-h,calc(var(--font-body-lg-size)*1.5))-var(--field-height-sm))/2)]'

/**
 * 輕量浮層 header 的 slot override —— **SSOT,禁各自 inline**(2026-06-16 收斂)。
 * Popover-tier header(title = PopoverTitle `text-body`)的 slot = body line-box = `calc(--font-body-size×1.5)` = 21,
 * 衍生自 title typography → title 字級改,slot 自動跟(取代舊各自寫死的 1.25rem / 20 巧合值)。
 * 消費者(同設計邏輯,皆 raw SurfaceHeader + PopoverTitle):PopoverHeader / DataTable sort·filter panel /
 * FileItem upload-manager。Default slot(Dialog/Sheet,title = text-body-lg)= 24,在 CHROME_UNBOUNDED_SLOT fallback。
 */
export const COMPACT_HEADER_SLOT = '[--chrome-slot-h:calc(var(--font-body-size)*1.5)]'

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
   *   row 2 = tabsSlot 包在 `HEADER_TABS_SLOT_WRAPPER_CLASS` wrapper(v3:wrapper 自身
   *           無 px / 無 border;TabsList 自己 w-full + px-loose,border-b 延展全寬 —
   *           W1 視覺一條線。詳 chrome-header.tsx v3 fix 註解)
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
            對齊既有 `tabs.spec.md`「Underline 與 TabsList border 的視覺關係」段「selected 底線從
            TabsList 的 gray border 位置長出來」(token = border-divider,tabs.tsx TABS_LIST_BASE)
            + GitHub Primer UnderlineNav / Ant Design line type / Mantine default 共識
            (全派 TabsList 自畫 full-width underline)。*/}
        <div className={HEADER_TABS_SLOT_WRAPPER_CLASS}>
          {tabsSlot}
        </div>
      </div>
    )
  }

  // Padding-based(預設) — Dialog/Sheet 用 body-lg title (16/24)，自然撐 max(24 title, 24 button slot) = 24
  // → header = 24 + py-tight 12×2 = 48 chrome-header-height ✓ 穩定無需 min-h
  // Popover 等輕量 chrome 走 COMPACT_HEADER_SLOT(slot = calc(--font-body-size×1.5)=21 = title line-box,無 min-h / 無 py override)：max(21 title, 21 slot) + py-tight 12×2 = 45（見上方 L57）
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

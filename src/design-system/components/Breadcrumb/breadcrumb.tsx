// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { ChevronRight, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Breadcrumb — 顯示當前頁面在階層中的位置
 *
 * 基於 shadcn/ui Breadcrumb 結構(純 HTML nav + ol + li + a/span),
 * 橋接設計系統 token。
 *
 * ── 結構 ──
 *   <Breadcrumb>
 *     <BreadcrumbList size="md">
 *       <BreadcrumbItem>
 *         <BreadcrumbLink href="/projects">專案</BreadcrumbLink>
 *       </BreadcrumbItem>
 *       <BreadcrumbSeparator />
 *       <BreadcrumbItem>
 *         <BreadcrumbPage>目前頁面</BreadcrumbPage>
 *       </BreadcrumbItem>
 *     </BreadcrumbList>
 *   </Breadcrumb>
 *
 * ── Size(跟 page title 配對) ──
 *   sm  text-body(14)     → 建議配 text-h4(20) title —— Dialog / panel / drawer
 *   md  text-body(14)     → 建議配 text-h3(24) title —— 一般頁面 header (預設)
 *   lg  text-body-lg(16)  → 建議配 text-h2(32) title —— Detail page hero / landing
 *
 * ── 視覺 ──
 *   Link (預設): text-fg-secondary
 *   Link hover:  text-primary-hover (canonical「互動高亮」, 跟 Tabs / Chip 用法一致)
 *   Page (當前): text-foreground + font-medium
 *   Separator:  ChevronRight (size 跟 list 一致), text-fg-muted
 *
 * ── 詳見 breadcrumb.spec.md ──
 */

// ── Size context ─────────────────────────────────────────────────────────────

type BreadcrumbSize = 'sm' | 'md' | 'lg'

interface BreadcrumbContextValue {
  size: BreadcrumbSize
}

const BreadcrumbContext = React.createContext<BreadcrumbContextValue>({ size: 'md' })

const BREADCRUMB_TEXT_CLASS: Record<BreadcrumbSize, string> = {
  sm: 'text-body',
  md: 'text-body',
  lg: 'text-body-lg',
}

// Separator / ellipsis icon 尺寸 — 跟文字對齊
const BREADCRUMB_ICON_SIZE: Record<BreadcrumbSize, number> = {
  sm: 14,
  md: 14,
  lg: 16,
}

// ── Breadcrumb (nav root) ────────────────────────────────────────────────────

const Breadcrumb = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<'nav'>
>(({ ...props }, ref) => (
  <nav ref={ref} aria-label="Breadcrumb" {...props} />
))
Breadcrumb.displayName = 'Breadcrumb'

// ── BreadcrumbList (ol) ──────────────────────────────────────────────────────

interface BreadcrumbListProps extends React.ComponentPropsWithoutRef<'ol'> {
  /**
   * 字體尺寸 — 依據與之配對的 page title 選擇:
   *   sm  → 配 text-h4(20) title (Dialog / panel / drawer)
   *   md  → 配 text-h3(24) title (一般頁面 header,預設)
   *   lg  → 配 text-h2(32) title (Detail page hero / landing)
   */
  size?: BreadcrumbSize
}

const BreadcrumbList = React.forwardRef<HTMLOListElement, BreadcrumbListProps>(
  ({ className, size = 'md', ...props }, ref) => {
    // Memoize provider value(2026-04-22 D3 perf audit):單 field wrapper memoize
    const ctxValue = React.useMemo(() => ({ size }), [size])
    return (
    <BreadcrumbContext.Provider value={ctxValue}>
      <ol
        ref={ref}
        // gap-1 (4px) — separator 與兩邊 items 間距;緊湊節奏,符合 breadcrumb 密集流動感
        className={cn(
          'flex flex-wrap items-center gap-1 text-fg-secondary leading-compact',
          BREADCRUMB_TEXT_CLASS[size],
          className
        )}
        {...props}
      />
    </BreadcrumbContext.Provider>
    )
  },
)
BreadcrumbList.displayName = 'BreadcrumbList'

// ── BreadcrumbItem (li) ──────────────────────────────────────────────────────

const BreadcrumbItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentPropsWithoutRef<'li'>
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    className={cn('inline-flex items-center', className)}
    {...props}
  />
))
BreadcrumbItem.displayName = 'BreadcrumbItem'

// ── BreadcrumbLink (a) ───────────────────────────────────────────────────────

interface BreadcrumbLinkProps extends React.ComponentPropsWithoutRef<'a'> {
  /** 將樣式套用至子元件(e.g. React Router Link) */
  asChild?: boolean
}

const BreadcrumbLink = React.forwardRef<HTMLAnchorElement, BreadcrumbLinkProps>(
  ({ asChild, className, ...props }, ref) => {
    const Comp = asChild ? Slot : 'a'
    return (
      <Comp
        ref={ref}
        className={cn(
          // inline-flex + gap-2: 支援 consumer 在 children 裡放 icon + label,
          // icon 與 label 間距固定 8px (gap-2)。無 icon 時 gap 無作用。
          'inline-flex items-center gap-2',
          // 預設: fg-secondary (neutral-8)
          'text-fg-secondary',
          // Hover: primary-hover (canonical 互動高亮, 跟 Tabs / Chip 同一套)
          'hover:text-primary-hover',
          'transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'rounded-md',
          className
        )}
        {...props}
      />
    )
  }
)
BreadcrumbLink.displayName = 'BreadcrumbLink'

// ── BreadcrumbPage (current, non-clickable) ──────────────────────────────────

const BreadcrumbPage = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<'span'>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    role="link"
    aria-disabled="true"
    aria-current="page"
    // inline-flex + gap-2 跟 BreadcrumbLink 一致,支援 icon + label 子元素。
    // text-foreground 區分於 fg-secondary 的 links,但不加粗 —
    // 加粗會讓 breadcrumb 最右端視覺過重,破壞「你從哪來 → 你在這」的流動感
    className={cn('inline-flex items-center gap-2 text-foreground', className)}
    {...props}
  />
))
BreadcrumbPage.displayName = 'BreadcrumbPage'

// ── BreadcrumbSeparator ──────────────────────────────────────────────────────

interface BreadcrumbSeparatorProps extends React.ComponentPropsWithoutRef<'li'> {
  children?: React.ReactNode
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const BreadcrumbSeparator = React.forwardRef<HTMLLIElement, BreadcrumbSeparatorProps>(
  ({ children, className, ...props }, ref) => {
    const { size } = React.useContext(BreadcrumbContext)
    return (
      <li
        ref={ref}
        role="presentation"
        aria-hidden="true"
        className={cn('inline-flex items-center text-fg-muted', className)}
        {...props}
      >
        {children ?? <ChevronRight size={BREADCRUMB_ICON_SIZE[size]} aria-hidden />}
      </li>
    )
  }
)
BreadcrumbSeparator.displayName = 'BreadcrumbSeparator'

// ── BreadcrumbEllipsis ───────────────────────────────────────────────────────

/**
 * BreadcrumbEllipsis — 折疊路徑的 "⋯" 按鈕
 *
 * 永遠渲染為單一 <button>(不是 display-only span),對齊 Material / Atlassian /
 * Ant Design 的互動 ellipsis 作法。配合 DropdownMenuTrigger asChild 使用:
 *
 * ```tsx
 * <DropdownMenu>
 *   <DropdownMenuTrigger asChild>
 *     <BreadcrumbEllipsis />  // Trigger's Slot 注入 onClick / aria-* 到此 button
 *   </DropdownMenuTrigger>
 *   <DropdownMenuContent>
 *     <DropdownMenuItem asChild><a href="/org">組織</a></DropdownMenuItem>
 *   </DropdownMenuContent>
 * </DropdownMenu>
 * ```
 *
 * 設計決策:為什麼不做成 display-only span 或 asChild 變體
 *   - Display-only 的 "⋯" 是資訊不是控制,現代 UX 預期可點擊展開 → 永遠 button
 *   - asChild + Slot 會要求單一 child,但此元件本身要渲染 icon,兩者衝突
 *   - 永遠 button 讓 DropdownMenuTrigger asChild 可以乾淨注入行為(Trigger 視
 *     BreadcrumbEllipsis 為單一 child, 透過 React.cloneElement 把 props 合進 button)
 */
type BreadcrumbEllipsisProps = React.ComponentPropsWithoutRef<'button'>

const BreadcrumbEllipsis = React.forwardRef<HTMLButtonElement, BreadcrumbEllipsisProps>(
  ({ className, 'aria-label': ariaLabel = '顯示折疊路徑' /* i18n-allow: DS default; consumer override via aria-label prop */, ...props }, ref) => {
    const { size } = React.useContext(BreadcrumbContext)
    return (
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel}
        className={cn(
          'inline-flex items-center text-fg-muted',
          'hover:text-primary-hover transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-md',
          className
        )}
        {...props}
      >
        <MoreHorizontal size={BREADCRUMB_ICON_SIZE[size]} aria-hidden />
      </button>
    )
  }
)
BreadcrumbEllipsis.displayName = 'BreadcrumbEllipsis'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const breadcrumbMeta = {
  component: 'Breadcrumb',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-fg-muted', 'text-fg-secondary', 'text-foreground'],
    ring: ['ring-ring'],
  },
} as const

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}
export type { BreadcrumbSize, BreadcrumbListProps, BreadcrumbEllipsisProps }

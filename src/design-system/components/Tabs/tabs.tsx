// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cva } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/design-system/components/DropdownMenu/dropdown-menu'
import {
  useScrollEdges,
  useScrollByPage,
  buildFadeMask,
  ARROW_BUTTON_WIDTH,
  OverflowScrollArrow,
  OverflowMenuTriggerButton,
} from '@/design-system/patterns/horizontal-overflow/horizontal-overflow'

/**
 * Tabs — 基於 Radix Tabs，橋接設計系統 token
 *
 * ── 定位 ──
 *   同一上下文底下切換平行的 view。切 view（不是切 value）。
 *   切 value 用 SegmentedControl；切路由用 navigation。
 *
 * ── Size ──
 *   sm   h-tab-sm（32/40），Dialog / Sidebar / dense
 *   md   h-tab-md（40/48），★ 預設，一般頁面
 *   lg   h-tab-lg（48/56），page-level hero
 *
 * ── 寬度行為 ──
 *   Trigger 寬度永遠由內容決定（hug content）。
 *   Triggers 之間 gap 為 --layout-space-loose（16px / 24px lg density）。
 *
 * ── Trigger 結構 ──
 *   [startIcon?] [label] [suffix: badge? + endIcon?]
 *   slot 間 gap-2，suffix 內 gap-1
 *
 * ── Selected underline ──
 *   使用 ::after 絕對定位在 bottom: -1px，2px primary-hover，
 *   蓋住 TabsList 的 1px gray border（單一視覺線條，不雙線）。
 */

// ── Size context ──
type TabsSize = 'sm' | 'md' | 'lg'
type TabsOverflow = 'none' | 'scroll' | 'menu'

interface TabsContextValue {
  size: TabsSize
}
const TabsContext = React.createContext<TabsContextValue>({ size: 'md' })

// ── Root ──
// Wrap Radix Tabs 以支援 value/onValueChange 的 context pass-through
// （menu 模式的 overflow items 需要能 proxy click 觸發同一個 onValueChange）
interface TabsProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {}

const TabsValueContext = React.createContext<{
  value?: string
  onValueChange?: (value: string) => void
}>({})

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  TabsProps
>(({ value, onValueChange, defaultValue, children, ...props }, ref) => {
  // 內部維護一份 uncontrolled state，讓 overflow menu 的 proxy 有 onValueChange 可呼叫
  const [internalValue, setInternalValue] = React.useState<string | undefined>(defaultValue)
  const isControlled = value !== undefined
  const currentValue = isControlled ? value : internalValue

  const handleValueChange = React.useCallback(
    (next: string) => {
      if (!isControlled) setInternalValue(next)
      onValueChange?.(next)
    },
    [isControlled, onValueChange]
  )

  const valueContext = React.useMemo(
    () => ({ value: currentValue, onValueChange: handleValueChange }),
    [currentValue, handleValueChange]
  )

  return (
    <TabsValueContext.Provider value={valueContext}>
      <TabsPrimitive.Root
        ref={ref}
        value={currentValue}
        onValueChange={handleValueChange}
        {...props}
      >
        {children}
      </TabsPrimitive.Root>
    </TabsValueContext.Provider>
  )
})
Tabs.displayName = 'Tabs'

// ── List ──
// TabsList 基礎 class — inline-flex 單列 + gap-loose + 底部 border-border
const TABS_LIST_BASE = [
  'inline-flex items-stretch',
  'gap-[var(--layout-space-loose)]',
  'border-b border-border',
].join(' ')

interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  size?: TabsSize
  /**
   * Overflow 處理模式。詳見 tabs.spec.md 的 overflow 段。
   *   'none'   ★ 預設，不處理，triggers 溢出父容器（適用 tabs 數量可控的情境）
   *   'scroll' 單行橫向滾動 + 邊緣 fade mask（Material / Polaris / iOS 作法）
   *   'menu'   塞不下收進 "⋯" dropdown，所有 triggers 仍在 DOM 保留 Radix a11y
   *            （Ant Design / Atlassian 作法）
   */
  overflow?: TabsOverflow
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, size = 'md', overflow = 'none', children, ...props }, ref) => {
  const tabsSizeContext = React.useMemo(() => ({ size }), [size])
  if (overflow === 'scroll') {
    return (
      <TabsContext.Provider value={tabsSizeContext}>
        <ScrollTabsList ref={ref} className={className} {...props}>
          {children}
        </ScrollTabsList>
      </TabsContext.Provider>
    )
  }
  if (overflow === 'menu') {
    return (
      <TabsContext.Provider value={tabsSizeContext}>
        <MenuTabsList ref={ref} className={className} {...props}>
          {children}
        </MenuTabsList>
      </TabsContext.Provider>
    )
  }
  // none（預設）
  return (
    <TabsContext.Provider value={tabsSizeContext}>
      <TabsPrimitive.List
        ref={ref}
        className={cn(TABS_LIST_BASE, 'w-fit', className)}
        {...props}
      >
        {children}
      </TabsPrimitive.List>
    </TabsContext.Provider>
  )
})
TabsList.displayName = 'TabsList'

// ── Scroll mode ──
//
// 共同策略(對齊 Material 3 / Ant Design 世界級作法):
//   - 容器 overflow-x-auto(真的可滾,鍵盤焦點可 scroll-into-view)
//   - border-b 在外層 wrapper,不在 scroll container,避免 mask 淡化 border
//   - mask / arrow / fade 全部從 horizontal-overflow pattern module 取得——
//     參見 `patterns/horizontal-overflow/horizontal-overflow.spec.md`
//   - Menu 模式 = scroll 模式 + 額外的 ⌄ quick-jump button,點 menu item 同時
//     觸發 onValueChange + scrollIntoView,讓使用者在 tab strip 看到選中的 tab
// 單行水平滾動 + 邊緣 fade mask 延伸到 arrow button 底下 + 左右 always-visible arrows
//   - 鍵盤: Radix 原生方向鍵 + 瀏覽器 scroll-into-view
//   - Trackpad: 兩指橫向滑動
//   - 滑鼠滾輪: 點 arrow buttons (Shift+wheel 太隱晦)

const ScrollTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
  const { scrollRef, atStart, atEnd, canScroll } = useScrollEdges<HTMLDivElement>()
  const scrollByPage = useScrollByPage(scrollRef)
  const maskImage = buildFadeMask({
    canScroll,
    atStart,
    atEnd,
    reserveArrowWidth: ARROW_BUTTON_WIDTH,
  })

  return (
    <div className="relative border-b border-border">
      <div
        ref={scrollRef}
        className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        <TabsPrimitive.List
          ref={ref}
          className={cn(
            'inline-flex items-stretch gap-[var(--layout-space-loose)] w-fit',
            className
          )}
          {...props}
        >
          {children}
        </TabsPrimitive.List>
      </div>
      {!atStart && canScroll && (
        <OverflowScrollArrow direction="left" onClick={() => scrollByPage('left')} />
      )}
      {!atEnd && canScroll && (
        <OverflowScrollArrow direction="right" onClick={() => scrollByPage('right')} />
      )}
    </div>
  )
})
ScrollTabsList.displayName = 'ScrollTabsList'

// ── Menu mode ──
// Show-all navigator pattern (Chrome tab dropdown / VS Code editor tabs / Discord channel jumper):
//   - Menu 永遠顯示全部 tabs,active 的用 checked 標記 (單選語意)
//   - 點 menu item = onValueChange + scrollIntoView(center),把該 tab 捲到視圖中央
//   - Menu 內容穩定,跟 scroll 位置無關,使用者對「⋯ = navigator」的直覺一致
//
// 為什麼底層仍是 overflow-x-auto 而非 overflow-hidden:
//   - scrollIntoView 需要真實 scroll 容器
//   - 鍵盤 focus 也依賴真實 scroll 讓 browser auto scroll-into-view
//   - scrollbar 用 CSS 隱藏,視覺看不出來
//
// Fade mask 純視覺,軟化內容硬邊,跟 menu 機制正交 (兩者可並存)。
// Menu button 出現條件: canScroll (有溢出空間才需要 navigator)。

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const MenuTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
  const { scrollRef, atStart, atEnd, canScroll } = useScrollEdges<HTMLDivElement>()
  const { onValueChange, value: activeValue } = React.useContext(TabsValueContext)

  // Local ref map — 追蹤每個 trigger 的 DOM 元素,供 scrollIntoView 使用。
  // 不用 useOverflowIndices 因為 menu 永遠顯示全部,不需要動態 overflow 計算。
  // code-quality-allow: long-function — helper fn 結構緊密,拆 sub-fn 會跨 fn 傳 state 反而複雜
  const itemRefs = React.useRef<Map<number, HTMLElement>>(new Map())
  const registerItem = React.useCallback(
    (index: number) => (el: HTMLElement | null) => {
      if (el) itemRefs.current.set(index, el)
      else itemRefs.current.delete(index)
    },
    []
  )

  const items = React.useMemo(
    () => React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement[],
    [children]
  )

  const enhancedChildren = items.map((child, i) =>
    React.cloneElement(
      child as React.ReactElement<{ ref?: React.Ref<HTMLElement> }>,
      { ref: registerItem(i) }
    )
  )

  // Menu 模式沒有 arrows,但仍套 fade mask (reserveArrowWidth: 0) 軟化內容硬邊
  // code-quality-allow: long-function — helper fn 結構緊密,拆 sub-fn 會跨 fn 傳 state 反而複雜
  const maskImage = buildFadeMask({ canScroll, atStart, atEnd, reserveArrowWidth: 0 })

  const handleMenuSelect = React.useCallback(
    (triggerValue: string, index: number) => {
      onValueChange?.(triggerValue)
      // 下一個 tick 再 scroll, 讓 Radix 先完成 data-state 更新
      requestAnimationFrame(() => {
        const el = itemRefs.current.get(index)
        el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      })
    },
    [onValueChange]
  )

  return (
    <div className="flex items-center border-b border-border">
      <div
        ref={scrollRef}
        className="flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        <TabsPrimitive.List
          ref={ref}
          className={cn(
            'inline-flex items-stretch gap-[var(--layout-space-loose)] w-fit',
            className
          )}
          {...props}
        >
          {enhancedChildren}
        </TabsPrimitive.List>
      </div>
      {canScroll && (
        <div className="flex-shrink-0 pl-[var(--layout-space-loose)] flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <OverflowMenuTriggerButton
                aria-label={`頁籤選單(共 ${items.length} 個)`}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {items.map((trigger, index) => {
                const triggerProps = trigger.props as {
                  value?: string
                  children?: React.ReactNode
                  disabled?: boolean
                }
                const triggerValue = triggerProps.value
                if (typeof triggerValue !== 'string') return null
                // 單選 active 用 DropdownMenuItem 的 selected prop
                //  → 對應 bg-neutral-selected 持續選中背景, 跟 SelectMenu 單選完全
                //  同一套 canonical 視覺, 全 DS 一致。不可用 className 發明樣式。
                return (
                  <DropdownMenuItem
                    key={triggerValue}
                    disabled={triggerProps.disabled}
                    selected={activeValue === triggerValue}
                    onSelect={() => handleMenuSelect(triggerValue, index)}
                  >
                    {triggerProps.children}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
})
MenuTabsList.displayName = 'MenuTabsList'

// ── Trigger ──
const tabsTriggerVariants = cva(
  [
    'relative inline-flex items-center justify-center',
    'gap-2',
    'whitespace-nowrap',
    'font-medium text-fg-secondary',
    'transition-colors duration-150',
    'cursor-pointer select-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    // Trigger 無水平 padding — 寬度 = 內容寬度。triggers 間的分隔靠 TabsList 的 gap-[layout-space-loose]
    // selected underline：::after 絕對定位在 bottom:-1px，2px primary-hover
    // left-0/right-0 因為 trigger 已無 padding，底線等於內容寬度
    // 底線蓋住 TabsList 的 1px gray border，視覺單一線條
    'after:absolute after:left-0 after:right-0 after:bottom-[-1px] after:h-0.5',
    'after:bg-transparent after:transition-colors after:duration-150',
    // hover（未選）：文字轉深
    'hover:text-foreground',
    // selected
    'data-[state=active]:text-foreground data-[state=active]:font-medium',
    'data-[state=active]:after:bg-primary-hover',
    // disabled：cursor-not-allowed + 不吃 hover 色
    // 不用 pointer-events-none，否則 cursor 不會改變；button[disabled] 本身就擋 click
    'disabled:cursor-not-allowed disabled:text-fg-disabled',
    'disabled:hover:text-fg-disabled',
  ],
  {
    variants: {
      size: {
        // leading-compact：trigger 是單行文字容器，使用 1.3 行高避免 text-body/body-lg 預設 1.5 造成垂直偏移
        sm: 'h-[var(--tab-height-sm)] text-body leading-compact',
        md: 'h-[var(--tab-height-md)] text-body leading-compact',
        lg: 'h-[var(--tab-height-lg)] text-body-lg leading-compact',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /** 左側 icon（LucideIcon） */
  startIcon?: LucideIcon
  /** 右側 badge（通常是計數指示器） */
  badge?: React.ReactNode
  /** 右側 icon（少用，通常是 ChevronDown 等展開指示） */
  endIcon?: LucideIcon
}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, startIcon: StartIcon, badge, endIcon: EndIcon, children, ...props }, ref) => {
  const { size } = React.useContext(TabsContext)
  const iconSize = size === 'lg' ? 20 : 16
  const hasSuffix = badge != null || EndIcon !== undefined

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(tabsTriggerVariants({ size }), className)}
      {...props}
    >
      {StartIcon && <StartIcon size={iconSize} aria-hidden />}
      {children != null && <span>{children}</span>}
      {hasSuffix && (
        <span className="inline-flex items-center gap-1">
          {badge}
          {EndIcon && <EndIcon size={iconSize} aria-hidden />}
        </span>
      )}
    </TabsPrimitive.Trigger>
  )
})
TabsTrigger.displayName = 'TabsTrigger'

// ── Content ──
const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      className
    )}
    {...props}
  />
))
TabsContent.displayName = 'TabsContent'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const tabsMeta = {
  component: 'Tabs',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {
    sm: { fieldHeight: 28, iconSize: 16, typography: 'body' },
    md: { fieldHeight: 32, iconSize: 16, typography: 'body' },
    lg: { fieldHeight: 40, iconSize: 20, typography: 'body' },
  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-primary-hover', 'bg-transparent'],
    fg: ['text-fg-disabled', 'text-fg-secondary', 'text-foreground'],
    ring: ['ring-ring'],
  },
  defaultSize: 'md',
} as const

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsTriggerVariants }
export type { TabsSize, TabsListProps, TabsTriggerProps }

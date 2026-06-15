// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import { cva } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
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
 * Chip — Material Design Filter Chip
 *
 * 基於 Radix ToggleGroup，橋接設計系統 token。
 * 必須在 <ChipGroup> 內使用。
 *
 * ── 內部結構（鏡射 Button）──
 *   [startIcon?] [<span px-1>label</span>] [<span gap-1>badge? + endIcon?</span>]
 *
 * ── Size ──
 *   單一 size = h-field-sm（28/32 density-aware）
 *   對齊 Material 3 / Atlassian / Polaris 世界級共識
 *
 * ── State ──
 *   default   bg-surface border-border text-fg-secondary
 *   hover     border-border-hover text-foreground（對齊 Input / SegmentedControl）
 *   selected  bg-surface（不變） border-primary-hover text-primary-hover
 *   disabled  cursor-not-allowed text-fg-disabled
 *
 * ── 詳見 chip.spec.md ──
 */

// ── Chip item ────────────────────────────────────────────────────────────────

const chipVariants = cva(
  [
    'inline-flex items-center justify-center',
    'h-field-sm px-3 gap-1',
    'rounded-full border border-border',
    // 預設文字: text-fg-secondary (neutral-8) — 對齊 SegmentedControl / Tabs 未選狀態
    'bg-surface text-fg-secondary',
    'text-body leading-compact font-medium whitespace-nowrap',
    'transition-colors duration-150',
    'cursor-pointer select-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    // hover（未選）：border 加深一階 + 文字轉深，對齊 Input / SegmentedControl hover
    'hover:border-border-hover hover:text-foreground',
    // selected: 文字 + 邊框都用 primary-hover,底色維持 bg-surface 不變
    //   ── pill 風格 canonical 選中規則,跟 SegmentedControl 完全一致:
    //      primary-hover 同時染文字和線條;底色不改 (不用 primary-subtle)。
    'data-[state=on]:border-primary-hover data-[state=on]:text-primary-hover',
    // disabled：cursor-not-allowed + 鎖 hover 不變色
    // 不用 pointer-events-none（否則 cursor-not-allowed 不會顯示）
    'disabled:cursor-not-allowed disabled:text-fg-disabled',
    'disabled:hover:border-border disabled:hover:text-fg-disabled',
  ]
)

export interface ChipProps
  extends React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> {
  /** 左側 icon（LucideIcon），最多一個 */
  startIcon?: LucideIcon
  /** 右側 badge（通常是計數指示器）*/
  badge?: React.ReactNode
  /** 右側 icon（少見，通常是 ChevronDown 指示可展開）*/
  endIcon?: LucideIcon
}

const Chip = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  ChipProps
>(({ className, startIcon: StartIcon, badge, endIcon: EndIcon, children, ...props }, ref) => {
  const hasSuffix = badge != null || EndIcon !== undefined

  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(chipVariants(), className)}
      {...props}
    >
      {StartIcon && <StartIcon size={16} aria-hidden />}
      {children != null && <span className="px-1">{children}</span>}
      {hasSuffix && (
        <span className="inline-flex items-center gap-1">
          {badge}
          {EndIcon && <EndIcon size={16} aria-hidden />}
        </span>
      )}
    </ToggleGroupPrimitive.Item>
  )
})
Chip.displayName = 'Chip'

// ── ChipGroup ────────────────────────────────────────────────────────────────

export type ChipGroupLayout = 'wrap' | 'scroll' | 'menu'

export type ChipGroupProps = React.ComponentPropsWithoutRef<
  typeof ToggleGroupPrimitive.Root
> & {
  /** Overflow 處理模式。預設 `wrap`（塞不下換行）。詳見 chip.spec.md */
  layout?: ChipGroupLayout
}

const ChipGroup = React.forwardRef<HTMLDivElement, ChipGroupProps>(
  ({ layout = 'wrap', className, children, ...props }, ref) => {
    if (layout === 'scroll') {
      return (
        <ScrollChipGroup ref={ref} className={className} {...props}>
          {children}
        </ScrollChipGroup>
      )
    }
    if (layout === 'menu') {
      return (
        <MenuChipGroup ref={ref} className={className} {...props}>
          {children}
        </MenuChipGroup>
      )
    }
    // wrap（預設）
    return (
      <ToggleGroupPrimitive.Root
        ref={ref}
        className={cn('flex flex-wrap gap-2', className)}
        {...props}
      >
        {children}
      </ToggleGroupPrimitive.Root>
    )
  }
)
ChipGroup.displayName = 'ChipGroup'

// ── Scroll / Menu modes ──
// Fade mask / arrows / menu trigger 全部從 horizontal-overflow pattern module 取用。
// 詳見 `patterns/horizontal-overflow/horizontal-overflow.spec.md`。
//
// Canonical 規則:所有 overflow affordance 一律是 Button text sm iconOnly,
// 不論在 Chip / Tab / Step / SegmentedControl。Chip menu trigger 曾經用
// chip-shape 圓形 button,已改回 text button 對齊 mental model。

// ── ScrollChipGroup ──────────────────────────────────────────────────────────

const ScrollChipGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
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
    <div className="relative">
      <div
        ref={scrollRef}
        className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        <ToggleGroupPrimitive.Root
          ref={ref}
          className={cn('flex flex-nowrap gap-2 w-fit', className)}
          {...props}
        >
          {children}
        </ToggleGroupPrimitive.Root>
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
ScrollChipGroup.displayName = 'ScrollChipGroup'

// ── MenuChipGroup ────────────────────────────────────────────────────────────
// Show-all navigator pattern (Chrome tab dropdown / VS Code editor tabs):
//   - Menu 永遠顯示全部 chips,每個都用 DropdownMenuCheckboxItem + checked 反映 selection
//   - 點 menu item = toggle selection + scrollIntoView,把該 chip 捲到中央
//   - 不用動態 overflow 計算,menu 內容穩定
//
// Menu trigger 使用 canonical `<OverflowMenuTriggerButton>`(= Button text sm iconOnly
// + ChevronDown),跟 Tabs menu trigger 完全同一套——overflow affordance 屬於工具層,
// 不該用 chip 自己的視覺語言(圓形 outlined)去渲染,否則 mental model 錯誤(使用者
// 會誤以為是第 N+1 個可選 chip)。
//
// 過去 Chip menu trigger 曾用 `chipVariants() + aspect-square + p-0` 做成圓形 pill,
// 已按 `horizontal-overflow.spec.md` 的 canonical 規則改回 text button。
//
// Fade mask 仍保留(reserveArrowWidth: 0),軟化內容硬邊。

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const MenuChipGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, children, ...props }, ref) => {
  const { scrollRef, atStart, atEnd, canScroll } = useScrollEdges<HTMLDivElement>()

  // Local ref map — 追蹤每個 chip 的 DOM 元素供 scrollIntoView 使用。
  // 不用 useOverflowIndices 因為 menu 永遠顯示全部, 不需要動態 overflow 計算。
  // code-quality-allow: long-function — helper fn 結構緊密,拆 sub-fn 會跨 fn 傳 state 反而複雜
  const itemRefs = React.useRef<Map<number, HTMLElement>>(new Map())
  // 2026-05-16 audit codex Round 6:capture rAF + cancel on unmount(defensive hygiene)
  const scrollRafIdRef = React.useRef<number>(0)
  React.useEffect(() => () => { if (scrollRafIdRef.current) cancelAnimationFrame(scrollRafIdRef.current) }, [])
  const registerItem = React.useCallback(
    (index: number) => (el: HTMLElement | null) => {
      if (el) itemRefs.current.set(index, el)
      else itemRefs.current.delete(index)
    },
    []
  )

  const menuMaskImage = buildFadeMask({ canScroll, atStart, atEnd, reserveArrowWidth: 0 })

  const items = React.useMemo(
    () => React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement[],
    [children]
  )

  const groupType = (props as { type?: 'single' | 'multiple' }).type ?? 'single'
  const groupValue = (props as { value?: string | string[] }).value
  const groupOnValueChange = (
    props as { onValueChange?: (value: string | string[]) => void }
  ).onValueChange

  // code-quality-allow: long-function — helper fn 結構緊密,拆 sub-fn 會跨 fn 傳 state 反而複雜
  const isSelected = React.useCallback(
    (chipValue: string): boolean => {
      if (groupType === 'multiple') {
        return Array.isArray(groupValue) && groupValue.includes(chipValue)
      }
      return groupValue === chipValue
    },
    [groupType, groupValue]
  )

  // code-quality-allow: long-function — multi / single / none selection mode each has 事務性 branch,拆 fn 會跨 fn 傳 chipValue/index/groupOnValueChange state 反而難讀
  const toggleFromMenu = React.useCallback(
    (chipValue: string, index: number) => {
      if (!groupOnValueChange) {
        if (import.meta.env?.DEV) {
          console.warn(
            '[ChipGroup] layout="menu" 需要 controlled 使用（請傳 value + onValueChange），否則 menu items 無法同步主 chip 選擇狀態。'
          )
        }
        return
      }
      if (groupType === 'multiple') {
        const current = (Array.isArray(groupValue) ? groupValue : []) as string[]
        const next = current.includes(chipValue)
          ? current.filter((v) => v !== chipValue)
          : [...current, chipValue]
        ;(groupOnValueChange as (v: string[]) => void)(next)
      } else {
        ;(groupOnValueChange as (v: string) => void)(chipValue)
      }
      // scrollIntoView: 讓剛選中的 chip 出現在視圖中央
      if (scrollRafIdRef.current) cancelAnimationFrame(scrollRafIdRef.current)
      scrollRafIdRef.current = requestAnimationFrame(() => {
        scrollRafIdRef.current = 0
        itemRefs.current.get(index)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      })
    },
    [groupType, groupValue, groupOnValueChange]
  )

  const enhancedItems = items.map((child, i) =>
    React.cloneElement(
      child as React.ReactElement<{ ref?: React.Ref<HTMLElement> }>,
      { ref: registerItem(i) }
    )
  )

  return (
    <div className="flex items-center gap-2">
      <div
        ref={scrollRef}
        className="flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: menuMaskImage, WebkitMaskImage: menuMaskImage }}
      >
        <ToggleGroupPrimitive.Root
          ref={ref}
          className={cn('flex flex-nowrap gap-2 w-fit', className)}
          {...props}
        >
          {enhancedItems}
        </ToggleGroupPrimitive.Root>
      </div>
      {canScroll && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <OverflowMenuTriggerButton
              aria-label={`選項選單(共 ${items.length} 個)`}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {items.map((chip, index) => {
              const chipProps = chip.props as { value?: string; children?: React.ReactNode; disabled?: boolean }
              const chipValue = chipProps.value
              if (typeof chipValue !== 'string') return null
              return (
                <DropdownMenuCheckboxItem
                  key={chipValue}
                  checked={isSelected(chipValue)}
                  disabled={chipProps.disabled}
                  onCheckedChange={() => toggleFromMenu(chipValue, index)}
                >
                  {chipProps.children}
                </DropdownMenuCheckboxItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
})
MenuChipGroup.displayName = 'MenuChipGroup'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const chipMeta = {
  component: 'Chip',
  family: 3,
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'selected', 'focus-visible', 'disabled'], // selected = data-[state=on](primary-hover);cva 無 active 樣式
  tokens: {
    bg: ['bg-surface'],
    fg: ['text-fg-disabled', 'text-fg-secondary', 'text-foreground', 'text-primary-hover'],
    ring: ['ring-ring'],
  },
} as const

export { Chip, ChipGroup, chipVariants }

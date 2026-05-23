import * as React from 'react'
import { cn } from '@/lib/utils'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/design-system/components/HoverCard/hover-card'
import { tagVariants } from '@/design-system/components/Tag/tag'
import { HOVER_DELAY_RICH_MS, HOVER_DELAY_CLOSE_MS } from '@/design-system/tokens/motion/motion'

/**
 * OverflowIndicator — +N 觸發器 + HoverCard 顯示溢出內容
 *
 * 統一用 HoverCard（不用 Tooltip）——溢出內容可能需要互動：
 * - 人員 +N：tag dismiss + hover name card
 * - 一般 +N：穩定顯示溢出項目
 *
 * trigger 不用 Tag 元件（Tag 有內建 truncation Tooltip 會跟 HoverCard 衝突），
 * 改用 tagVariants 直接套樣式。
 */

const triggerSize: Record<string, string> = {
  sm: 'h-5 min-w-5',
  md: 'h-6 min-w-6',
  lg: 'h-6 min-w-6',
}

const triggerText: Record<string, string> = {
  sm: 'text-[10px]',
  md: 'text-caption',
  lg: 'text-caption',
}

export interface OverflowIndicatorProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  count: number
  shape?: 'circle' | 'tag'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  className?: string
}

function ShrinkWrapList({ children }: { children: React.ReactNode }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  // 2026-05-16 audit codex Round 6:rAF capture + cancel on unmount/re-run(defensive hygiene)。
  // 原 callback ref `requestAnimationFrame(() => ...)` 沒 cancel,unmount-during-rAF 可能 fire 後
  // mutate detached element.style — no-op but pattern hygiene 應對齊 DS-wide rAF cancel canonical。
  React.useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    let rafId = 0
    rafId = requestAnimationFrame(() => {
      rafId = 0
      const cs = getComputedStyle(container)
      const padL = parseFloat(cs.paddingLeft) || 0
      const padR = parseFloat(cs.paddingRight) || 0
      const gap = parseFloat(cs.gap) || parseFloat(cs.columnGap) || 0
      const available = container.offsetWidth - padL - padR

      const items = Array.from(container.children) as HTMLElement[]
      if (items.length === 0) return

      let currentRow = 0
      let maxRow = 0

      items.forEach(item => {
        const w = item.offsetWidth
        const needed = currentRow > 0 ? currentRow + gap + w : w

        if (needed > available && currentRow > 0) {
          maxRow = Math.max(maxRow, currentRow)
          currentRow = w
        } else {
          currentRow = needed
        }
      })
      maxRow = Math.max(maxRow, currentRow)

      container.style.maxWidth = `${Math.ceil(maxRow) + padL + padR + 1}px`
    })
    return () => { if (rafId) cancelAnimationFrame(rafId) }
  }, [children])

  return (
    <div ref={containerRef} className="flex flex-wrap gap-1 p-2 max-w-[280px]">
      {children}
    </div>
  )
}

const OverflowIndicator = React.forwardRef<HTMLSpanElement, OverflowIndicatorProps>(
  function OverflowIndicator(
    { count, shape = 'circle', size = 'md', children, className, ...props },
    ref,
  ) {
    if (count <= 0) return null

    const trigger = shape === 'tag' ? (
      <span
        ref={ref}
        data-overflow-indicator=""
        className={cn(tagVariants({ color: 'neutral', size }), 'cursor-default', className)}
        {...props}
      >
        <span className="px-1">+{count}</span>
      </span>
    ) : (
      <span
        ref={ref}
        data-overflow-indicator=""
        className={cn(
          'shrink-0 rounded-full inline-grid place-content-center',
          'bg-muted text-foreground font-medium leading-none cursor-default',
          triggerSize[size],
          triggerText[size],
          className,
        )}
        {...props}
      >
        +{count}
      </span>
    )

    // 2026-05-18 fix(per user audit「所有 hovercard 應消費 hover delay token」+ motion.spec.md SSOT):
    // rich tier(可互動 popup,user 可移浮層上操作)= HOVER_DELAY_RICH_MS;close = HOVER_DELAY_CLOSE_MS。
    return (
      <HoverCard openDelay={HOVER_DELAY_RICH_MS} closeDelay={HOVER_DELAY_CLOSE_MS}>
        <HoverCardTrigger asChild>
          {trigger}
        </HoverCardTrigger>
        <HoverCardContent className="bg-tooltip rounded-lg" data-theme="dark">
          <ShrinkWrapList>{children}</ShrinkWrapList>
        </HoverCardContent>
      </HoverCard>
    )
  },
)
OverflowIndicator.displayName = 'OverflowIndicator'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const overflowIndicatorMeta = {
  component: 'OverflowIndicator',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-muted'],
    fg: ['text-foreground'],
    ring: [],
  },
} as const

export { OverflowIndicator }

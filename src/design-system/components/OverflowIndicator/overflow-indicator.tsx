import * as React from 'react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip/tooltip'
import { Tag } from '@/design-system/components/Tag/tag'

// ── OverflowIndicator ───────────────────────────────────────────────────────
// 溢出指示器：+N 觸發器 + tooltip 顯示隱藏內容。
//
// 兩種 shape：
//   circle — avatar 堆疊溢出（rounded-full）
//   tag    — tag 溢出（用 Tag component，與 Tag 外觀一致）
//
// Tooltip 用 flex-wrap 排列，JS 量測後收縮容器寬度到最寬行。

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

export interface OverflowIndicatorProps {
  count: number
  shape?: 'circle' | 'tag'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  className?: string
}

// ── ShrinkWrapList ──────────────────────────────────────────────────────────
// flex-wrap 容器，mount 後量測每行實際寬度，收縮到最寬行。
// 邏輯來自消費端驗證過的 calculateContainerWidth 演算法。

function ShrinkWrapList({ children }: { children: React.ReactNode }) {
  const ref = React.useCallback((container: HTMLDivElement | null) => {
    if (!container) return

    // 重置讓 flex-wrap 以原始 max-width 排列
    container.style.maxWidth = ''

    // requestAnimationFrame 確保 layout 完成
    requestAnimationFrame(() => {
      const cs = getComputedStyle(container)
      const padL = parseFloat(cs.paddingLeft) || 0
      const padR = parseFloat(cs.paddingRight) || 0
      const gap = parseFloat(cs.gap) || parseFloat(cs.columnGap) || 0
      const available = container.offsetWidth - padL - padR

      const items = Array.from(container.children) as HTMLElement[]
      if (items.length === 0) return

      let currentRow = 0
      let maxRow = 0

      items.forEach((item, i) => {
        const w = item.offsetWidth
        const withGap = currentRow > 0 ? gap + w : w

        if (currentRow + withGap > available && currentRow > 0) {
          maxRow = Math.max(maxRow, currentRow)
          currentRow = w
        } else {
          currentRow += withGap
        }
      })
      maxRow = Math.max(maxRow, currentRow)

      container.style.maxWidth = `${Math.ceil(maxRow) + padL + padR}px`
    })
  }, [children])

  return (
    <div ref={ref} className="flex flex-wrap gap-1 p-2 max-w-[280px]">
      {children}
    </div>
  )
}

function OverflowIndicator({ count, shape = 'circle', size = 'md', children, className }: OverflowIndicatorProps) {
  if (count <= 0) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {shape === 'tag' ? (
          <Tag variant="neutral" size={size} className={cn('cursor-default', className)}>
            +{count}
          </Tag>
        ) : (
          <span
            className={cn(
              'shrink-0 rounded-full inline-grid place-content-center',
              'bg-muted text-foreground font-medium leading-none cursor-default',
              triggerSize[size],
              triggerText[size],
              className,
            )}
          >
            +{count}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent className="!p-0">
        <ShrinkWrapList>{children}</ShrinkWrapList>
      </TooltipContent>
    </Tooltip>
  )
}
OverflowIndicator.displayName = 'OverflowIndicator'

export { OverflowIndicator }

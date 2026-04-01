import * as React from 'react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip/tooltip'

// ── OverflowIndicator ───────────────────────────────────────────────────────
// 溢出指示器：+N 觸發器 + tooltip 顯示隱藏內容。
//
// 用於任何「清單溢出 +N」的場景（MultiSelect tag 溢出、多人 avatar 溢出等）。
// 觸發器尺寸與 Tag/Avatar 高度對齊：sm=20px, md/lg=24px。
// Tooltip 內容由消費端提供（children），內部統一 flex-wrap gap-1 layout。
// Tag 在此 tooltip 內保留預設 max-width（不加 max-w-none），超長時截斷。

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
  /** 溢出數量 */
  count: number
  /** 尺寸，與 Tag/Avatar 高度對齊 */
  size?: 'sm' | 'md' | 'lg'
  /** tooltip 內容（通常是 Tag 列表） */
  children: React.ReactNode
  /** 額外 className（套用在 +N 觸發器上） */
  className?: string
}

function OverflowIndicator({ count, size = 'md', children, className }: OverflowIndicatorProps) {
  if (count <= 0) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
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
      </TooltipTrigger>
      <TooltipContent className="w-fit max-w-[280px] px-2 py-2">
        <div className="flex flex-wrap gap-1">{children}</div>
      </TooltipContent>
    </Tooltip>
  )
}
OverflowIndicator.displayName = 'OverflowIndicator'

export { OverflowIndicator }

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip/tooltip'

// ── OverflowIndicator ───────────────────────────────────────────────────────
// 溢出指示器：+N 觸發器 + tooltip 顯示隱藏內容。
//
// 兩種 shape：
//   circle — avatar 堆疊溢出（rounded-full，圓形）
//   tag    — tag 溢出（rounded-md，膠囊形，跟 Tag 外觀一致）
//
// 觸發器尺寸與 Tag/Avatar 高度對齊：sm=20px, md/lg=24px。
// Tooltip 四邊等距 p-2，w-fit 貼合內容。

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
  /** 觸發器外觀：circle = avatar 溢出，tag = tag 溢出 */
  shape?: 'circle' | 'tag'
  /** 尺寸，與 Tag/Avatar 高度對齊 */
  size?: 'sm' | 'md' | 'lg'
  /** tooltip 內容（通常是 Tag 列表） */
  children: React.ReactNode
  /** 額外 className（套用在 +N 觸發器上） */
  className?: string
}

function OverflowIndicator({ count, shape = 'circle', size = 'md', children, className }: OverflowIndicatorProps) {
  if (count <= 0) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'shrink-0 inline-grid place-content-center',
            'bg-muted text-foreground font-medium leading-none cursor-default',
            shape === 'circle' ? 'rounded-full' : 'rounded-md px-1',
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

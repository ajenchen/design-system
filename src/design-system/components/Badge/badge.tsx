import * as React from 'react'
import { cn } from '@/lib/utils'

// ── Badge（notification count indicator）────────────────────────────────────
// 通知計數指示器，用於未讀數量、待辦計數等。
//
// 固定規格：16px 高、10px 字、font-medium、bg-notification + text-white。
// 個位數時寬 = 高 = 16px（正圓），多位數時左右 padding 等距（膠囊）。
// 數字水平垂直置中。可設 max 上限（超過顯示 "max+"）。

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** 顯示的數量 */
  count: number
  /** 數量上限，超過時顯示 "max+"（例：max=99 → "99+"） */
  max?: number
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ count, max, className, ...props }, ref) => {
    const display = max != null && count > max ? `${max}+` : `${count}`

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center',
          'min-w-4 h-4 px-1 rounded-full',
          'bg-notification text-white',
          'text-[10px] font-medium leading-none',
          className,
        )}
        {...props}
      >
        {display}
      </span>
    )
  }
)
Badge.displayName = 'Badge'

export { Badge }

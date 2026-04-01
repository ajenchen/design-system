import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// ── Badge（notification count indicator）────────────────────────────────────
// 通知計數指示器，用於未讀數量、待辦計數等。
//
// 兩種模式：
//   count — 16px 高，10px 字，font-medium。個位數正圓，多位數膠囊。
//   dot   — 6×6px 純色圓點，無文字。
//
// 四個層級（視覺強度由高到低）：
//   critical — 紅底白字（bg-notification）
//   high     — 藍底白字（bg-primary）
//   medium   — 淺藍底藍字（bg-primary-subtle + text-primary）
//   low      — 灰底灰字（neutral-3 + neutral-7）

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full leading-none',
  {
    variants: {
      variant: {
        critical: 'bg-notification text-white',
        high: 'bg-primary text-white',
        medium: 'bg-primary-subtle text-primary',
        low: 'bg-secondary text-fg-muted',
      },
      dot: {
        true: 'w-1.5 h-1.5',
        false: 'min-w-4 h-4 px-1 text-[10px] font-medium',
      },
    },
    defaultVariants: {
      variant: 'critical',
      dot: false,
    },
  }
)

export interface BadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'>,
    Omit<VariantProps<typeof badgeVariants>, 'dot'> {
  /** dot 模式：6×6px 純色圓點，無文字 */
  dot?: boolean
  /** 顯示的數量（dot 模式下忽略） */
  count?: number
  /** 數量上限，超過時顯示 "max+"（例：max=99 → "99+"） */
  max?: number
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant, dot = false, count, max, className, ...props }, ref) => {
    const display = dot ? null : (
      max != null && count != null && count > max ? `${max}+` : `${count}`
    )

    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, dot }), className)}
        {...props}
      >
        {display}
      </span>
    )
  }
)
Badge.displayName = 'Badge'

export { Badge, badgeVariants }

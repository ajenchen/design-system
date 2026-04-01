import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/design-system/components/Tooltip/tooltip"

// ── Badge（= Tag in other systems）──────────────────────────────────────────
// inline label，用於分類標籤、狀態標記、多選已選值。
//
// 三種尺寸（子元件補齊原則——消費端直接透傳 size，不做 mapping）：
//   sm — 20px 高, 12px 字, 4px badge-px, font-medium（配 field sm）
//   md — 24px 高, 14px 字, 4px badge-px, font-normal（配 field md）— 預設
//   lg — 24px = md alias（配 field lg，子元件補齊原則）
//
// 截斷：max-w-40（160px），超出時文字 truncate + 自動 tooltip。

const badgeVariants = cva(
  "inline-flex items-center rounded-md border border-transparent transition-colors cursor-text",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground",
        primary: "bg-primary-subtle text-primary",
        error: "bg-error-subtle text-error",
        success: "bg-success-subtle text-success",
        warning: "bg-warning-subtle text-warning-foreground",
        outline: "border-border bg-transparent text-foreground",
      },
      size: {
        sm: "h-5 px-1 text-caption font-medium",
        md: "h-6 px-1 text-body font-normal",
        lg: "h-6 px-1 text-body font-normal",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

export interface BadgeProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'prefix'>,
    VariantProps<typeof badgeVariants> {
  prefix?: React.ReactNode
  suffix?: React.ReactNode
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, size, prefix, suffix, children, ...props }, forwardedRef) => {
    const internalRef = React.useRef<HTMLDivElement>(null)
    const [isTruncated, setIsTruncated] = React.useState(false)

    const setRef = React.useCallback((el: HTMLDivElement | null) => {
      internalRef.current = el
      if (typeof forwardedRef === 'function') forwardedRef(el)
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    }, [forwardedRef])

    React.useEffect(() => {
      const el = internalRef.current
      if (!el) return
      const check = () => {
        // 暫時移除所有寬度限制，量自然寬度，再還原比對
        const prevMax = el.style.maxWidth
        const prevW = el.style.width
        const prevOv = el.style.overflow
        el.style.maxWidth = 'none'
        el.style.width = 'max-content'
        el.style.overflow = 'visible'
        const naturalWidth = el.offsetWidth
        el.style.maxWidth = prevMax
        el.style.width = prevW
        el.style.overflow = prevOv
        const actualWidth = el.offsetWidth
        setIsTruncated(naturalWidth > actualWidth + 1)
      }
      check()
      const obs = new ResizeObserver(check)
      obs.observe(el)
      return () => obs.disconnect()
    }, [children])

    const badge = (
      <div
        ref={setRef}
        className={cn(badgeVariants({ variant, size }), 'min-w-0 max-w-40 overflow-hidden', className)}
        {...props}
      >
        {prefix}
        <span className="px-1 truncate min-w-0">{children}</span>
        {suffix}
      </div>
    )

    if (!isTruncated) return badge

    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{children}</TooltipContent>
      </Tooltip>
    )
  }
)
Badge.displayName = 'Badge'

export { Badge, badgeVariants }

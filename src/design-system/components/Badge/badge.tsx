import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/design-system/components/Tooltip/tooltip"

// ── Badge（= Tag in other systems）──────────────────────────────────────────
// inline label，用於分類標籤、狀態標記、多選已選值。
// 尺寸在元件內定義（不引用 field-height token，獨立於 Button 尺寸系統）。
//
// 三種尺寸（子元件補齊原則——消費端直接透傳 size，不做 mapping）：
//   sm — 20px 高, 12px 字, 4px badge-px, font-medium（配 field sm）
//   md — 24px 高, 14px 字, 4px badge-px, font-normal（配 field md）— 預設
//   lg — 24px = md alias（配 field lg，子元件補齊原則）
//
// 內部結構：
//   [badge-px] [prefix?] [text-px TEXT text-px] [suffix?] [badge-px]
//   badge-px = 外層呼吸空間（統一 4px）
//   text-px  = 文字自身 padding（固定 4px），同時作為與 prefix/suffix 的間距
//   不用 gap——text padding 自然拉開

const badgeVariants = cva(
  "inline-flex items-center rounded-md border border-transparent transition-colors",
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
        sm: "h-5 px-1 text-caption font-medium",     /* 20px, badge-px=4px */
        md: "h-6 px-1 text-body font-normal",         /* 24px, badge-px=4px — 預設 */
        lg: "h-6 px-1 text-body font-normal",         /* 24px = md alias，子元件補齊 */
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
  /** 前綴元素（icon 等），顏色繼承文字色 */
  prefix?: React.ReactNode
  /** 後綴元素（icon、close button 等），顏色繼承文字色 */
  suffix?: React.ReactNode
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, size, prefix, suffix, children, ...props }, ref) => {
    const textRef = React.useRef<HTMLSpanElement>(null)
    const [isTruncated, setIsTruncated] = React.useState(false)

    React.useEffect(() => {
      const el = textRef.current
      if (!el) return
      const check = () => setIsTruncated(el.scrollWidth > el.clientWidth)
      check()
      const obs = new ResizeObserver(check)
      obs.observe(el)
      return () => obs.disconnect()
    }, [children])

    const badge = (
      <div ref={ref} className={cn(badgeVariants({ variant, size }), 'min-w-0 max-w-40', className)} {...props}>
        {prefix}
        <span ref={textRef} className="px-1 truncate">{children}</span>
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

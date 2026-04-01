import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/design-system/components/Tooltip/tooltip"

// ── Tag（inline label）─────────────────────────────────────────────────────
// 用於分類標籤、狀態標記、多選已選值。
//
// 三種尺寸（子元件補齊原則——消費端直接透傳 size，不做 mapping）：
//   sm — 20px 高, 12px 字, 4px tag-px, font-medium（配 field sm）
//   md — 24px 高, 14px 字, 4px tag-px, font-normal（配 field md）— 預設
//   lg — 24px = md alias（配 field lg，子元件補齊原則）
//
// 截斷：max-w-40（160px），超出時文字 truncate + 自動 tooltip。
// 用 Canvas measureText 偵測截斷（scrollWidth 在 flex 內不可靠）。

let _measureCtx: CanvasRenderingContext2D | null = null
function getMeasureCtx() {
  if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d')
  return _measureCtx
}

const tagVariants = cva(
  "inline-flex items-center rounded-md border border-transparent transition-colors cursor-text",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-foreground",
        blue: "bg-[var(--info-subtle)] text-[var(--info)]",
        red: "bg-error-subtle text-error",
        green: "bg-success-subtle text-success",
        yellow: "bg-warning-subtle text-warning-foreground",
        turquoise: "bg-[var(--color-turquoise-1)] text-[var(--color-turquoise-6)]",
        purple: "bg-[var(--color-purple-1)] text-[var(--color-purple-6)]",
        magenta: "bg-[var(--color-magenta-1)] text-[var(--color-magenta-6)]",
        indigo: "bg-[var(--color-indigo-1)] text-[var(--color-indigo-6)]",
      },
      size: {
        sm: "h-5 px-1 text-caption font-medium",
        md: "h-6 px-1 text-body font-normal",
        lg: "h-6 px-1 text-body font-normal",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "md",
    },
  }
)

export interface TagProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'prefix'>,
    VariantProps<typeof tagVariants> {
  /** 左側 icon（LucideIcon），由 Tag 統一 16px。與 avatar 互斥。 */
  icon?: LucideIcon
  /** 左側 avatar（ReactNode），與 icon 互斥。 */
  avatar?: React.ReactNode
  /** 可移除——Tag 自動渲染 dismiss 按鈕並控制尺寸與互動樣式 */
  onDismiss?: () => void
}

// ── Dismiss（internal）────────────────────────────────────────────────────
// Inline action：16px icon，18px hover 背景，由 Tag 內部渲染。

function TagDismiss({ onDismiss, label }: { onDismiss: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onDismiss() }}
      className="group/action relative grid place-content-center text-fg-muted hover:text-foreground active:text-foreground transition-colors cursor-pointer"
      style={{ width: 16, height: 16 }}
      aria-label={`移除 ${label}`}
    >
      <span
        className="absolute rounded-sm pointer-events-none bg-transparent group-hover/action:bg-neutral-hover group-active/action:bg-neutral-active transition-colors"
        style={{ width: 18, height: 18, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        aria-hidden
      />
      <X size={16} className="relative" aria-hidden />
    </button>
  )
}

function TagInner(
  { className, variant, size, icon: Icon, avatar, onDismiss, children, ...props }: TagProps,
  forwardedRef: React.ForwardedRef<HTMLDivElement>,
) {
  const ownRef = React.useRef<HTMLDivElement>(null)
  const [isTruncated, setIsTruncated] = React.useState(false)

  React.useLayoutEffect(() => {
    const el = ownRef.current
    if (!el) return
    const ctx = getMeasureCtx()
    const check = () => {
      const textSpan = el.querySelector('[data-tag-text]')
      if (!textSpan || !ctx) return
      const text = textSpan.textContent || ''
      const cs = getComputedStyle(textSpan)
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      const textWidth = ctx.measureText(text).width
      const padL = parseFloat(cs.paddingLeft) || 0
      const padR = parseFloat(cs.paddingRight) || 0
      const needed = textWidth + padL + padR
      setIsTruncated(needed > (textSpan as HTMLElement).clientWidth + 1)
    }
    check()
    const obs = new ResizeObserver(check)
    obs.observe(el)
    return () => obs.disconnect()
  }, [children])

  const label = typeof children === 'string' ? children : ''

  const tag = (
    <div
      ref={(el) => {
        ownRef.current = el
        if (typeof forwardedRef === 'function') forwardedRef(el)
        else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = el
      }}
      className={cn(tagVariants({ variant, size }), 'min-w-0 max-w-40 overflow-hidden', className)}
      {...props}
    >
      {Icon && <Icon size={16} aria-hidden />}
      {avatar}
      <span data-tag-text="" className="px-1 truncate min-w-0">{children}</span>
      {onDismiss && <TagDismiss onDismiss={onDismiss} label={label} />}
    </div>
  )

  if (!isTruncated) return tag

  return (
    <Tooltip>
      <TooltipTrigger asChild>{tag}</TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  )
}

const Tag = React.forwardRef<HTMLDivElement, TagProps>(TagInner)
Tag.displayName = 'Tag'

export { Tag, tagVariants }

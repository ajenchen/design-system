import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/design-system/components/Tooltip/tooltip"
import { ItemInlineActionButton } from "@/design-system/patterns/element-anatomy/item-anatomy"

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
        // 直接引用 primitive（bg=step-1, text=step-7），不經過語義層
        // step-1 在 dark mode 用 alpha 公式，step-7 用 lighter 公式——兩個 mode 都正確
        neutral:   "bg-secondary text-foreground",
        blue:      "bg-[var(--color-blue-1)] text-[var(--color-blue-7)]",
        red:       "bg-[var(--color-deep-orange-1)] text-[var(--color-deep-orange-7)]",
        green:     "bg-[var(--color-green-1)] text-[var(--color-green-7)]",
        yellow:    "bg-[var(--color-yellow-1)] text-[var(--color-yellow-7)]",
        turquoise: "bg-[var(--color-turquoise-1)] text-[var(--color-turquoise-7)]",
        purple:    "bg-[var(--color-purple-1)] text-[var(--color-purple-7)]",
        magenta:   "bg-[var(--color-magenta-1)] text-[var(--color-magenta-7)]",
        indigo:    "bg-[var(--color-indigo-1)] text-[var(--color-indigo-7)]",
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

// ── Solid variant 色彩（step-6 底 + 白字，warning 用 --warning-foreground）──
// 直接引用 primitive step-6，不經過語義層
// neutral 用 neutral-9 + --inverse-fg（light=白字, dark=深字，自動反轉）
const SOLID_CLASSES: Record<string, string> = {
  neutral:   'bg-[var(--color-neutral-9)] text-inverse-fg',
  blue:      'bg-[var(--color-blue-6)] text-on-emphasis',
  red:       'bg-[var(--color-deep-orange-6)] text-on-emphasis',
  green:     'bg-[var(--color-green-6)] text-on-emphasis',
  yellow:    'bg-[var(--color-yellow-6)] text-[var(--warning-foreground)]',
  turquoise: 'bg-[var(--color-turquoise-6)] text-on-emphasis',
  purple:    'bg-[var(--color-purple-6)] text-on-emphasis',
  magenta:   'bg-[var(--color-magenta-6)] text-on-emphasis',
  indigo:    'bg-[var(--color-indigo-6)] text-on-emphasis',
}

export interface TagProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'prefix'>,
    VariantProps<typeof tagVariants> {
  /** 左側 icon（LucideIcon），由 Tag 統一 16px。與 avatar 互斥。 */
  icon?: LucideIcon
  /** 左側 avatar（ReactNode），與 icon 互斥。 */
  avatar?: React.ReactNode
  /** 可移除——Tag 自動渲染 dismiss 按鈕並控制尺寸與互動樣式 */
  onDismiss?: () => void
  /** 深底白字模式（step-6 背景 + 白色前景，warning 例外） */
  solid?: boolean
}

// ── Solid dismiss hover/active bg ──
// 用 semantic --{hue}-hover/active token，跟 --primary-hover/active 同模式：
// solid 色彩 shade change（hover 較亮 step、active 較暗 step），跟 Button 等
// 互動元件視覺一致。在 semantic 層做 dark mode swap 確保方向跨 mode 一致。
// neutral 特例：bg 是 neutral-9 隨 mode 反轉，用 --inverse-neutral-* 鏡射
const SOLID_DISMISS_HOVER: Record<string, { hover: string; active: string }> = {
  neutral:   { hover: 'var(--inverse-neutral-hover)', active: 'var(--inverse-neutral-active)' },
  blue:      { hover: 'var(--blue-hover)',            active: 'var(--blue-active)' },
  red:       { hover: 'var(--red-hover)',             active: 'var(--red-active)' },
  green:     { hover: 'var(--green-hover)',           active: 'var(--green-active)' },
  yellow:    { hover: 'var(--yellow-hover)',          active: 'var(--yellow-active)' },
  turquoise: { hover: 'var(--turquoise-hover)',       active: 'var(--turquoise-active)' },
  purple:    { hover: 'var(--purple-hover)',          active: 'var(--purple-active)' },
  magenta:   { hover: 'var(--magenta-hover)',         active: 'var(--magenta-active)' },
  indigo:    { hover: 'var(--indigo-hover)',          active: 'var(--indigo-active)' },
}

// ── Dismiss（internal）────────────────────────────────────────────────────
// 走 `ItemInlineActionButton`(item-anatomy SSOT)+ `hoverBgClassName` override prop
// (2026-05-01 整合,消除原 Tag 自刻 `<button>` 繞 DS infra 的 tech debt)。
//
// 視覺對齊:`size="md"` → icon 16 / hover-bg 18,跟 Tag 既有手刻幾何完全相等。
// Solid variant(blue/green/red 等)透過 `hoverBgClassName` 套色相 override token;
// Subtle variant 落用 ItemInlineActionButton 預設 neutral-hover。
// 圖標色繼承 Tag 文字色 → `text-current` 三態覆寫。

function TagDismiss({ onDismiss, label, solid, variant }: { onDismiss: () => void; label: string; solid?: boolean; variant?: string }) {
  const solidColors = solid && variant ? SOLID_DISMISS_HOVER[variant] : undefined

  return (
    <ItemInlineActionButton
      icon={X}
      size="md"
      onClick={(e) => { e.stopPropagation(); onDismiss() }}
      aria-label={`移除 ${label}`}
      style={solidColors ? ({ '--dismiss-hover': solidColors.hover, '--dismiss-active': solidColors.active } as React.CSSProperties) : undefined}
      hoverBgClassName={
        solidColors
          ? 'group-hover/action:bg-[var(--dismiss-hover)] group-active/action:bg-[var(--dismiss-active)]'
          : undefined
      }
      // Override default fg-muted → 繼承 Tag 文字色(label 同色)
      className="text-current hover:text-current active:text-current"
    />
  )
}

function TagInner(
  { className, variant, size, icon: Icon, avatar, onDismiss, solid, children, ...props }: TagProps,
  forwardedRef: React.ForwardedRef<HTMLDivElement>,
) {
  const solidClass = solid ? SOLID_CLASSES[variant ?? 'neutral'] : undefined
  const ownRef = React.useRef<HTMLDivElement | null>(null)
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
      className={cn(tagVariants({ variant, size }), solidClass, 'w-fit min-w-0 max-w-40 overflow-hidden', className)}
      {...props}
    >
      {Icon && <Icon size={16} aria-hidden />}
      {avatar && <span className="shrink-0 w-4 h-4 rounded-full overflow-hidden inline-grid place-content-center [&>*]:w-full [&>*]:h-full">{avatar}</span>}
      <span data-tag-text="" className="px-1 truncate min-w-0">{children}</span>
      {onDismiss && <TagDismiss onDismiss={onDismiss} label={label} solid={solid} variant={variant ?? 'neutral'} />}
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

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const tagMeta = {
  component: 'Tag',
  family: 3,
  variants: {
    neutral: { purpose: '通用分類、草稿、無特定語義' },
    blue: { purpose: '進行中、資訊提示、active 狀態（對應 --info）' },
    red: { purpose: '錯誤、已封鎖、危險（對應 --error）' },
    green: { purpose: '成功、已完成、已核准（對應 --success）' },
    yellow: { purpose: '警告、待審核、注意（對應 --warning）' },
    turquoise: { purpose: '分類色（無固定語義）' },
    purple: { purpose: '分類色（無固定語義）' },
    magenta: { purpose: '分類色（無固定語義）' },
    indigo: { purpose: '分類色（無固定語義）' },
  },
  sizes: {
    sm: { fieldHeight: 28, iconSize: 16, typography: 'body' },
    md: { fieldHeight: 32, iconSize: 16, typography: 'body' },
    lg: { fieldHeight: 40, iconSize: 20, typography: 'body' },
  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-neutral-active', 'bg-neutral-hover', 'bg-secondary', 'bg-transparent'],
    fg: ['text-foreground', 'text-inverse-fg'],
    ring: [],
  },
  defaultVariant: 'neutral',
  defaultSize: 'md',
} as const

export { Tag, tagVariants }

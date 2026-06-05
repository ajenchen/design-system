import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/design-system/components/Tooltip/tooltip"
import { ItemInlineActionButton } from "@/design-system/patterns/element-anatomy/item-anatomy"
import { CAT_SUBTLE, CAT_SOLID, CAT_INTERACT } from "@/design-system/tokens/categorical-color"

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
      // color：categorical 色相(裝飾性分類,非語意狀態)。**消費 categorical-color SSOT**——
      // key X 一律對 `--color-X-*`(1:1,零 offset)。neutral 非色相(無 hue),用 secondary 底自處理。
      // 2026-06-04 修:原 `red` 誤接 `--color-deep-orange-*`(red=品牌紅 hue-25 ≠ deep-orange hue-38
      // ≠ 語意 --error〔= deep-orange〕);改消費 SSOT 後 red→`--color-red-*`,並補齊全 12 色相。
      color: {
        neutral: "bg-secondary text-foreground",
        ...CAT_SUBTLE,
      },
      size: {
        sm: "h-5 px-1 text-caption font-medium",
        md: "h-6 px-1 text-body font-normal",
        lg: "h-6 px-1 text-body font-normal",
      },
    },
    defaultVariants: {
      color: "neutral",
      size: "md",
    },
  }
)

// ── Solid variant 色彩（step-6 底 + on-emphasis 配對文字,消費 categorical-color SSOT）──
// 白字 --on-emphasis(夠深的 hue)/ 深字 --on-emphasis-dark(亮 hue:yellow/amber/orange/lime);green 白字例外。
// **消費 categorical-color SSOT**(CAT_SOLID,1:1 色相)。neutral 非色相,用 neutral-9
// + --inverse-fg（light=白字, dark=深字，自動反轉）自處理。
const SOLID_CLASSES: Record<string, string> = {
  neutral: 'bg-[var(--color-neutral-9)] text-inverse-fg',
  ...CAT_SOLID,
}

export interface TagProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'prefix' | 'color'>,
    VariantProps<typeof tagVariants> {
  /** 左側 icon（LucideIcon），由 Tag 統一 16px。與 avatar 互斥。 */
  icon?: LucideIcon
  /** 左側 avatar（ReactNode），與 icon 互斥。 */
  avatar?: React.ReactNode
  /** 可移除——Tag 自動渲染 remove 按鈕並控制尺寸與互動樣式(從集合移除 item) */
  onRemove?: () => void
  /** 深底模式（step-6 背景 + on-emphasis 配對前景;亮色 hue yellow/amber/orange/lime 用深字 --on-emphasis-dark,green 白字例外） */
  solid?: boolean
  /**
   * 2026-05-15 Q3 真 SSOT fix(per user verbatim「同空間兩判斷點」+「不要冰山一角」):
   * Tag 寬度由 parent constrain,不套預設 max-w-40(160px)。用於 cell-as-input narrow cell
   * (< 160px)時 Tag fit cell 寬度 + truncate ellipsis,而非 160px 後被 cell `overflow-hidden`
   * 硬切。對齊「同 cell width → 同 overflow 判斷」SSOT。Default false 保 backward compat
   * (wrap layout / pill rail 等仍受 160px 保護)。
   */
  unbounded?: boolean
}

// ── Solid dismiss hover/active bg ──
// **消費 categorical-color SSOT**(CAT_INTERACT,semantic --{hue}-hover/active token),
// 跟 --primary-hover/active 同模式:solid 色彩 shade change(hover 較亮 step、active 較暗 step),
// 在 semantic 層做 dark mode swap 確保方向跨 mode 一致。
// neutral 特例:bg 是 neutral-9 隨 mode 反轉,用 --inverse-neutral-* 鏡射,自處理。
const SOLID_DISMISS_HOVER: Record<string, { hover: string; active: string }> = {
  neutral: { hover: 'var(--inverse-neutral-hover)', active: 'var(--inverse-neutral-active)' },
  ...CAT_INTERACT,
}

// ── Dismiss（internal）────────────────────────────────────────────────────
// 走 `ItemInlineActionButton`(item-anatomy SSOT)+ `hoverBgClassName` override prop
// (2026-05-01 整合,消除原 Tag 自刻 `<button>` 繞 DS infra 的 tech debt)。
//
// 視覺對齊:`size="md"` → icon 16 / hover-bg 18,跟 Tag 既有手刻幾何完全相等。
// Solid variant(blue/green/red 等)透過 `hoverBgClassName` 套色相 override token;
// Subtle variant 落用 ItemInlineActionButton 預設 neutral-hover。
// 圖標色繼承 Tag 文字色 → `text-current` 三態覆寫。

function TagDismiss({ onRemove, label, solid, color }: { onRemove: () => void; label: string; solid?: boolean; color?: string }) {
  const solidColors = solid && color ? SOLID_DISMISS_HOVER[color] : undefined

  return (
    <ItemInlineActionButton
      icon={X}
      size="md"
      onClick={(e) => { e.stopPropagation(); onRemove() }}
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
  { className, color, size, icon: Icon, avatar, onRemove, solid, unbounded = false, children, style, ...props }: TagProps,
  forwardedRef: React.ForwardedRef<HTMLDivElement>,
) {
  const solidClass = solid ? SOLID_CLASSES[color ?? 'neutral'] : undefined
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
      data-tag-root=""
      className={cn(tagVariants({ color, size }), solidClass, 'w-fit min-w-0 overflow-hidden', className)}
      // 2026-05-18 Round 5 fix(per Codex M31 Round 5 verdict + user 拍板「那就開始做」):
      // 用 CSS var `--combobox-tag-area-inline-size`(由 Combobox useOverflowCount JS-injected)取代
      // `min(100%, 10rem)` cyclic percentage。CSS Sizing 3 §5.2.1:percentage 在 indefinite containing
      // block 退化為 initial value → Round 4 的 100% 沒 enforce。改 explicit px 值(JS measured)避此 trap。
      // unbounded=true:cap = inject 寬(回 cell-as-input narrow cell 原 behavior)
      // default:cap = min(inject 寬, 160px)— 兩 cap 取小。fallback(無 var,Form context 等)= 100% / 10rem。
      style={{
        maxWidth: unbounded
          ? 'var(--combobox-tag-area-inline-size, 100%)'
          : 'min(var(--combobox-tag-area-inline-size, 10rem), 10rem)',
        ...style,
      }}
      {...props}
    >
      {Icon && <Icon size={16} aria-hidden />}
      {avatar && <span className="shrink-0 w-4 h-4 rounded-full overflow-hidden inline-grid place-content-center [&>*]:w-full [&>*]:h-full">{avatar}</span>}
      <span data-tag-text="" className="px-1 truncate min-w-0">{children}</span>
      {onRemove && <TagDismiss onRemove={onRemove} label={label} solid={solid} color={color ?? 'neutral'} />}
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
  // categorical 色相(裝飾性分類,非語意狀態)。**1:1 對 `--color-{hue}-*` primitive,零 offset**。
  // 不對應語意 token——語意狀態(error/info/success/warning)走 Notice / Alert 等狀態元件,
  // 不是 Tag 色相。2026-06-04 修:移除原「red 對應 --error / blue 對應 --info ...」誤導框架
  // (red = 品牌紅 hue-25,跟語意 --error〔= deep-orange〕無關)。
  variants: {
    neutral: { purpose: '通用分類、草稿、無特定語義(secondary 底)' },
    blue: { purpose: 'categorical 色相(--color-blue-*)' },
    green: { purpose: 'categorical 色相(--color-green-*)' },
    'deep-orange': { purpose: 'categorical 色相(--color-deep-orange-*,hue 38)' },
    yellow: { purpose: 'categorical 色相(--color-yellow-*,淺底深字)' },
    red: { purpose: 'categorical 色相(--color-red-*,品牌紅家族 hue 25;≠ 語意 --error)' },
    orange: { purpose: 'categorical 色相(--color-orange-*)' },
    amber: { purpose: 'categorical 色相(--color-amber-*,淺底深字)' },
    lime: { purpose: 'categorical 色相(--color-lime-*)' },
    turquoise: { purpose: 'categorical 色相(--color-turquoise-*)' },
    indigo: { purpose: 'categorical 色相(--color-indigo-*)' },
    purple: { purpose: 'categorical 色相(--color-purple-*)' },
    magenta: { purpose: 'categorical 色相(--color-magenta-*)' },
  },
  sizes: {
    // Tag 尺寸不引用 field-height token（spec.md:180/241——Tag 與 Field 尺寸獨立）。
    // height = Tag 自身高度（cva h-5/h-6/h-6 = 20/24/24，lg = md alias）。
    // iconSize 全尺寸統一 16（tag.tsx:195 硬寫 size={16}）。
    sm: { height: 20, iconSize: 16, typography: 'caption' },
    md: { height: 24, iconSize: 16, typography: 'body' },
    lg: { height: 24, iconSize: 16, typography: 'body' },
  },
  // Tag 為純展示 indicator，無互動 state（spec.md:249-256「為何無 StateBehavior」）。
  // 唯一行為 dismiss 屬 Inline Action pattern，非 Tag 自有 state。
  states: ['default'],
  tokens: {
    bg: ['bg-neutral-active', 'bg-neutral-hover', 'bg-secondary', 'bg-transparent'],
    fg: ['text-foreground', 'text-inverse-fg'],
    ring: [],
  },
  defaultVariant: 'neutral',
  defaultSize: 'md',
} as const

export { Tag, tagVariants }

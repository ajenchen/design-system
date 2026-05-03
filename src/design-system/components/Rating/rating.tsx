// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { Star, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFieldContext } from '@/design-system/components/Field/field-context'

/**
 * Rating — 星星評分元件
 *
 * 世界級對照:Ant Design `<Rate>`、Material MUI `<Rating>`。
 * shadcn 核心沒有 Rating,本元件自建。
 *
 * ── 使用情境 ──
 * - review / feedback:商品評分 / 服務評分(可編輯 + 唯讀兩種)
 * - display:已提交評分的唯讀呈現(商品清單星等)
 *
 * ── 視覺 ──
 * 填色用 `var(--warning)`(yellow-6,世界級黃星 convention;與 warning 語意共用色相
 * 但語境不同,評分 = UX convention color 非 status)。
 * 空色用 `var(--color-neutral-4)`(灰色;與 disabled/empty 同級)。
 *
 * ── 互動 ──
 * interactive(預設):hover 預覽、click 設值、keyboard Left/Right 改值
 * readOnly:純顯示,不響應 hover / click
 *
 * ── 精度 ──
 * precision="full"(預設) — 整星(1, 2, 3, 4, 5)
 * precision="half" — 半星(0.5, 1, 1.5, 2, 2.5, ..., 5)
 */

// ── Icon size canonical(2026-04-21 AR48 修正)──
//
// Rating 的「一顆星」視覺重量接近 **Avatar / identity icon**,不是純 inline icon。
// 理由:
// - 星星是 filled shape(解析整個 icon 是重量感的一部分),不像純 outline icon 靠 stroke
// - Field 內 Rating 跟 Avatar / Tag 並排時視覺份量要對齊,否則 row height 一致但 icon 看起來比重量不對
// - 世界級對照:Ant Rate in Form = 20px、Material MUI Rating fontSize=inherit 預設約 24、Airbnb 評分星 24px
//
// 因此 Field 內 Rating icon size 對齊 **item-anatomy inline Avatar sizes**:sm=20 / md=24 / lg=24。
// 非 icon tier(16/16/20)——star 不是次要 affordance icon,它是主要資料視覺。
//
// Container 高度仍對齊 `--field-height-*`(sm=28 / md=32 / lg=36),讓 Rating 可與其他
// field-height family 元件(Input / Select)並排時 row height 對齊。
//
// ── 使用情境 ──
// - **Standalone**(獨立展示評分,如商品卡 / 評論)→ 預設 `xs`(container 24,icon 20,
//   對齊 Avatar sm 20px;iOS HIG / Airbnb 商品卡星星 20-24px)
// - **Field 內**(表單評分欄位)→ 跟 Field 尺寸對齊(sm=20 / md=24 / lg=24,default md)
const SIZE_PX = { xs: 20, sm: 20, md: 24, lg: 24 } as const
const CONTAINER_HEIGHT: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: 'h-field-xs',
  sm: 'h-field-sm',
  md: 'h-field-md',
  lg: 'h-field-lg',
}

export interface RatingProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** 當前評分(0 ~ max) */
  value?: number
  /** 預設值(uncontrolled) */
  defaultValue?: number
  /** 評分改變 callback */
  onChange?: (value: number) => void
  /** 滿分(預設 5) */
  max?: number
  /** 尺寸。standalone 建議 xs(24px);Field 內跟隨 Field size 傳 sm/md/lg */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** 精度:full = 整星,half = 半星 */
  precision?: 'full' | 'half'
  /** 唯讀(無 hover / click 響應) */
  readOnly?: boolean
  /** 完全停用 */
  disabled?: boolean
  /**
   * Loading 狀態 — 正在取得既有評分 / 正在儲存。
   * 視覺同 disabled(composite 整塊 opacity-disabled)但 semantic 不同:
   * loading = 暫時性等待(aria-busy),disabled = 永久業務規則(aria-disabled)。
   * 詳 rating.spec.md「Interactive vs ReadOnly」+「Loading canonical」
   */
  loading?: boolean
  /** 自訂 icon(預設 Star);傳 LucideIcon */
  icon?: LucideIcon
  /** a11y label(readOnly 時必填,interactive 時建議填) */
  'aria-label'?: string
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const Rating = React.forwardRef<HTMLDivElement, RatingProps>(
  (
    {
      value,
      defaultValue = 0,
      onChange,
      max = 5,
      size: sizeProp,
      precision = 'full',
      readOnly = false,
      disabled = false,
      loading = false,
      icon: Icon = Star,
      className,
      ...props
    },
    ref,
  ) => {
    // Context-aware default size(AR31 canonical):
    //   - Field 內(有 FieldContext.size) → 跟 Field size 對齊(sm / md / lg)
    //   - Standalone(無 Field context) → default `xs`(24px,對齊 Avatar / Tag sm / iOS HIG standalone)
    // consumer 可傳 size 顯式 override。世界級對照:Material Rating standalone 24dp、
    // Ant Rate in Form 跟 Form.itemSize,standalone 24px。
    const fieldCtx = useFieldContext()
    const fieldSize = fieldCtx?.size as ('sm' | 'md' | 'lg' | undefined)
    const size: 'xs' | 'sm' | 'md' | 'lg' =
      sizeProp ?? fieldSize ?? 'xs'
    const [internalValue, setInternalValue] = React.useState(defaultValue)
    const [hoverValue, setHoverValue] = React.useState<number | null>(null)
    const isControlled = value !== undefined
    const currentValue = isControlled ? value : internalValue
    const displayValue = hoverValue ?? currentValue
    const iconPx = SIZE_PX[size]
    const isInteractive = !readOnly && !disabled && !loading

    const setValue = (v: number) => {
      if (!isControlled) setInternalValue(v)
      onChange?.(v)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isInteractive) return
      const step = precision === 'half' ? 0.5 : 1
      // Full ARIA slider pattern(WAI-ARIA):Arrow / Home / End 支援 — D4 UX audit 2026-04-22
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault()
        setValue(Math.min(max, currentValue + step))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault()
        setValue(Math.max(0, currentValue - step))
      } else if (e.key === 'Home') {
        e.preventDefault()
        setValue(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setValue(max)
      }
    }

    return (
      <div
        ref={ref}
        role={isInteractive ? 'slider' : 'img'}
        aria-valuenow={isInteractive ? currentValue : undefined}
        aria-valuemin={isInteractive ? 0 : undefined}
        aria-valuemax={isInteractive ? max : undefined}
        aria-valuetext={isInteractive ? `${currentValue} of ${max} stars` : undefined}
        aria-disabled={disabled || undefined}
        // a11y: aria-readonly 只允許於 slider role(非 img)— axe aria-allowed-attr 2026-04-25
        aria-readonly={isInteractive && readOnly ? true : undefined}
        aria-busy={loading || undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onKeyDown={handleKeyDown}
        onMouseLeave={() => setHoverValue(null)}
        className={cn(
          'inline-flex items-center gap-1',
          // Container 對齊 field-height family,讓 Rating 可與 Input/Select/Button 並排 row-align
          CONTAINER_HEIGHT[size],
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md',
          // disabled 跟 loading 視覺相同(composite uniform dim),semantic 由 aria-disabled / aria-busy 區分
          (disabled || loading) && 'opacity-disabled pointer-events-none',
          className,
        )}
        {...props}
      >
        {Array.from({ length: max }, (_, i) => {
          const starValue = i + 1
          const fillRatio = Math.max(0, Math.min(1, displayValue - i)) // 0..1
          const isHalf = precision === 'half' && fillRatio > 0 && fillRatio < 1

          return (
            <StarIcon
              key={i}
              Icon={Icon}
              sizePx={iconPx}
              fillRatio={fillRatio}
              isHalf={isHalf}
              interactive={isInteractive}
              onHover={(halfFirst) => {
                if (!isInteractive) return
                const v = precision === 'half' && halfFirst ? starValue - 0.5 : starValue
                setHoverValue(v)
              }}
              onClick={(halfFirst) => {
                if (!isInteractive) return
                const v = precision === 'half' && halfFirst ? starValue - 0.5 : starValue
                setValue(v)
              }}
            />
          )
        })}
      </div>
    )
  },
)
Rating.displayName = 'Rating'

// ── StarIcon: 單顆星 + half-precision overlay ─────────────────────────────

interface StarIconProps {
  Icon: LucideIcon
  sizePx: number
  fillRatio: number // 0..1
  isHalf: boolean
  interactive: boolean
  onHover: (halfFirst: boolean) => void
  onClick: (halfFirst: boolean) => void
}

const FILL_FILLED = 'var(--warning)' // yellow-6 — 黃星 convention
const FILL_EMPTY = 'var(--color-neutral-4)' // 灰色空星

function StarIcon({ Icon, sizePx, fillRatio, isHalf, interactive, onHover, onClick }: StarIconProps) {
  // a11y(2026-04-25 axe nested-interactive fix):inner 點擊目標改 <span>(非 interactive
  // element),不會跟外層 role='slider' 形成 nested-interactive 違規。鍵盤控制統一在外層
  // slider 的 arrow keys,inner 只處理 mouse click 定位。Ant Rate / Material MUI 同模式。
  if (!isHalf) {
    // Full: 一整顆 fill(filled 或 empty)
    const fill = fillRatio >= 1 ? FILL_FILLED : FILL_EMPTY
    return (
      <span
        role="presentation"
        onMouseEnter={interactive ? () => onHover(false) : undefined}
        onClick={interactive ? () => onClick(false) : undefined}
        className={cn(
          'inline-flex',
          interactive ? 'cursor-pointer' : 'cursor-default',
        )}
        style={{ color: fill }}
        aria-hidden
      >
        {/* stroke="none" 移除 Lucide Star 預設的 outline stroke(1.5px 黑線),
            讓星星是純 fill-only 的 shape——fill 與 outline 同色視覺上仍有亮度差。
            世界級對照:Ant Rate / Material MUI Rating 皆純 fill,無 outline stroke。*/}
        <Icon size={sizePx} fill={fill} stroke="none" className="shrink-0" />
      </span>
    )
  }

  // Half: 兩個重疊 icon,左半 filled / 右半 empty + 兩個 hover zone 切半星
  return (
    <span className="relative inline-flex" style={{ width: sizePx, height: sizePx }}>
      <Icon size={sizePx} fill={FILL_EMPTY} stroke="none" className="absolute inset-0" style={{ color: FILL_EMPTY }} />
      <span className="absolute inset-0 overflow-hidden" style={{ width: sizePx * fillRatio }}>
        <Icon size={sizePx} fill={FILL_FILLED} stroke="none" style={{ color: FILL_FILLED }} />
      </span>
      {interactive && (
        <>
          <span
            role="presentation"
            onMouseEnter={() => onHover(true)}
            onClick={() => onClick(true)}
            className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
            aria-hidden
          />
          <span
            role="presentation"
            onMouseEnter={() => onHover(false)}
            onClick={() => onClick(false)}
            className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
            aria-hidden
          />
        </>
      )}
    </span>
  )
}

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const ratingMeta = {
  component: 'Rating',
  family: 4,
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-transparent'],
    fg: [],
    ring: ['ring-ring'],
  },
} as const

export { Rating }

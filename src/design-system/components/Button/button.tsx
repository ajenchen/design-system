import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'

/**
 * Button — shadcn 風格，橋接設計系統 token
 *
 * ── Variants ──
 *   primary    主要操作，藍底白字
 *   secondary  次要品牌操作，藍框藍字；正面 vs 負面並存時用於正面那個
 *   tertiary   一般輔助操作，灰框灰字，hover 轉藍（最常用的非主要按鈕）
 *   text       無底色無邊框，hover 顯示灰底（工具列、密集 UI）
 *   checked    Toggle 選中狀態，淡藍底藍字
 *   link       外觀像連結的按鈕（本質仍是 button）
 *
 * ── danger prop ──
 *   danger     套用在任何 variant 上，將顏色改為危險色（紅色）
 *
 *   <Button variant="primary" danger>永久刪除</Button>        → 紅底白字（立即不可逆）
 *   <Button variant="secondary" danger>移至垃圾桶</Button>    → 紅框紅字（點下去還可反悔）
 *
 * ── Sizes（預設 sm）──
 *   xs   h-6（24px 固定），8px padding，12px 字，不隨模式縮放
 *   sm   h-[--ui-height-28]，md=28px / lg=32px  ← 預設
 *   md   h-[--ui-height-32]，md=32px / lg=36px
 *   lg   h-[--ui-height-36]，md=36px / lg=40px
 *   icon-only 不是獨立尺寸 — 加 iconOnly prop 讓任何尺寸變正方形
 *
 * ── 內部結構 ──
 *   [startIcon?]  [label]  [badge? + endIcon?]
 *
 * ── 用法範例 ──
 *   <Button startIcon={Plus}>新增</Button>
 *   <Button variant="tertiary">取消</Button>
 *   <Button variant="primary" danger>永久刪除</Button>
 *   <Button variant="secondary" danger>移至垃圾桶</Button>
 *   <Button badge={<Badge>3</Badge>} endIcon={ChevronDown}>通知</Button>
 *   <Button size="sm" iconOnly startIcon={Plus} aria-label="新增" />
 *
 * ── asChild ──
 *   <Button asChild><Link to="/home">回首頁</Link></Button>
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center',
    'whitespace-nowrap font-medium',
    'border border-transparent',
    'transition-colors duration-150',
    'cursor-pointer select-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    'disabled:pointer-events-none',
    'rounded-md',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-primary text-white',
          'hover:bg-primary-hover',
          'active:bg-primary-active',
          'disabled:bg-disabled disabled:text-fg-disabled disabled:border-transparent',
        ],
        secondary: [
          'bg-surface text-primary border-primary',
          'hover:text-primary-hover hover:border-primary-hover',
          'active:text-primary-active active:border-primary-active',
          'disabled:bg-transparent disabled:text-fg-disabled disabled:border-border',
        ],
        tertiary: [
          'bg-surface text-foreground border-border',
          'hover:text-primary-hover hover:border-primary-hover',
          'active:text-primary-active active:border-primary-active',
          'disabled:bg-transparent disabled:text-fg-disabled disabled:border-border',
        ],
        text: [
          'bg-transparent text-foreground border-transparent',
          'hover:bg-neutral-hover',
          'active:bg-neutral-active',
          'disabled:bg-transparent disabled:text-fg-disabled',
        ],
        checked: [
          'bg-primary-subtle text-primary border-transparent',
          'hover:text-primary-hover',
          'active:text-primary-active',
          'disabled:bg-disabled disabled:text-fg-disabled disabled:border-transparent',
        ],
        link: [
          'bg-transparent text-primary border-transparent',
          'hover:text-primary-hover',
          'active:text-primary-active',
          'disabled:text-fg-disabled',
        ],
      },
      danger: {
        true: '', // 實際樣式由 compoundVariants 提供
      },
      size: {
        xs: 'h-6 px-2 text-caption leading-compact gap-1',
        sm: 'h-[var(--ui-height-28)] px-3 min-w-14 text-body leading-compact gap-2',
        md: 'h-[var(--ui-height-32)] px-3 min-w-16 text-body leading-compact gap-2',
        lg: 'h-[var(--ui-height-36)] px-3 min-w-20 text-body-lg leading-compact gap-2',
      },
    },
    compoundVariants: [
      // primary + danger → 紅底白字（立即不可逆操作）
      {
        variant: 'primary',
        danger: true,
        class: [
          'bg-error text-white border-transparent',
          'hover:bg-error-hover',
          'active:bg-error-active',
        ],
      },
      // secondary + danger → 紅框紅字（有確認步驟的危險操作）
      {
        variant: 'secondary',
        danger: true,
        class: [
          'bg-surface text-error border-error',
          'hover:text-error-hover hover:border-error-hover',
          'active:text-error-active active:border-error-active',
        ],
      },
      // text + danger → 紅字，hover 灰底
      {
        variant: 'text',
        danger: true,
        class: [
          'text-error',
          'hover:bg-neutral-hover hover:text-error-hover',
          'active:bg-neutral-active active:text-error-active',
        ],
      },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'sm',
    },
  }
)

// ── ButtonGroup Context ──────────────────────────────────────────────────────
// ButtonGroup provides this context; Button reads it for fullWidth injection.
// Context lives here (not in button-group.tsx) so there is no circular import.
interface ButtonGroupContextValue {
  fullWidth?: boolean
}
const ButtonGroupContext = React.createContext<ButtonGroupContextValue>({})

type InternalVariant = VariantProps<typeof buttonVariants>['variant']

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<VariantProps<typeof buttonVariants>, 'variant' | 'danger'> {
  /** 將樣式套用至子元件（e.g. React Router Link） */
  asChild?: boolean
  /**
   * 按鈕視覺強調等級。
   * `destructive` / `ghost` 為 shadcn 內部 compat，請勿在應用程式碼中直接使用。
   */
  variant?: 'primary' | 'secondary' | 'tertiary' | 'text' | 'checked' | 'link' | (string & {})
  /** 套用危險色（紅色）。可與任何 variant 組合使用。 */
  danger?: boolean
  /** 左側 icon（LucideIcon），最多一個，loading 時自動替換為 spinner */
  startIcon?: LucideIcon
  /** 右側 badge，通常傳入 Badge 元件（ReactNode） */
  badge?: React.ReactNode
  /** 右側 icon（LucideIcon），放在 badge 右邊，通常用於 ChevronDown 等方向指示 */
  endIcon?: LucideIcon
  /** Icon-only 模式：移除 padding，變為正方形（必須同時設定 aria-label） */
  iconOnly?: boolean
  /** 載入中狀態：startIcon 替換為 spinner，自動 disabled；badge / endIcon 維持顯示以避免 layout shift */
  loading?: boolean
  /** 撐滿父容器寬度 */
  fullWidth?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant: variantProp,
      danger: dangerProp,
      size,
      asChild = false,
      startIcon: StartIcon,
      badge,
      endIcon: EndIcon,
      iconOnly = false,
      loading = false,
      fullWidth = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    // shadcn compat：AlertDialog、Toast 等元件內部會傳入這些 alias，
    // 在此靜默轉換，不暴露到型別或自動完成。
    const resolvedVariant: InternalVariant =
      (variantProp as string) === 'destructive' ? 'primary' :
      (variantProp as string) === 'ghost'        ? 'text'    :
      (variantProp as InternalVariant) ?? 'primary'

    const resolvedDanger = dangerProp || (variantProp as string) === 'destructive'

    // ButtonGroup context：vertical group 自動注入 fullWidth
    const groupCtx = React.useContext(ButtonGroupContext)
    const resolvedFullWidth = fullWidth || !!groupCtx.fullWidth

    const Comp = asChild ? Slot : 'button'
    const iconSize = size === 'lg' ? 20 : 16

    // loading 行為：spinner 永遠在 prefix 位置
    //   有 prefix icon → icon 換成 spinner（同位置，零 layout shift）
    //   無 prefix icon → spinner 加在文字左邊（按鈕略微變寬，可接受）
    const hasSuffix = badge != null || EndIcon !== undefined

    // icon-only 自動 tooltip：從 props 提取 aria-label，同時保留在 DOM
    const { 'aria-label': ariaLabel, ...restProps } = props

    const buttonEl = (
      <Comp
        className={cn(
          buttonVariants({ variant: resolvedVariant, danger: resolvedDanger, size, className }),
          iconOnly && 'aspect-square p-0 min-w-0',
          resolvedFullWidth && 'w-full',
        )}
        ref={ref}
        type="button"
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-label={ariaLabel}
        {...restProps}
      >
        {loading
          ? <Loader2 size={iconSize} className="animate-spin" aria-hidden />
          : StartIcon && <StartIcon size={iconSize} aria-hidden />
        }
        {children != null && <span className="px-1">{children}</span>}
        {hasSuffix && (
          <span className="inline-flex items-center gap-1 pr-1">
            {badge}
            {EndIcon && <EndIcon size={iconSize} aria-hidden />}
          </span>
        )}
      </Comp>
    )

    // icon-only + aria-label → 自動包 Tooltip（tooltip 是元件保證的行為）
    if (iconOnly && typeof ariaLabel === 'string' && !asChild) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{buttonEl}</TooltipTrigger>
            <TooltipContent>{ariaLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    return buttonEl
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants, ButtonGroupContext }

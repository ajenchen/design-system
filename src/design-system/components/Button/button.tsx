import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { CircularProgress } from '@/design-system/components/CircularProgress/circular-progress'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFieldContext } from '@/design-system/components/Field/field-context'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'

/**
 * Button — shadcn 風格，橋接設計系統 token
 *
 * ── Variants ──
 *   primary    主要操作，藍底白字
 *   secondary  次要品牌操作，藍框藍字；正面 vs 負面並存時用於正面那個
 *   tertiary   一般輔助操作，灰框灰字，hover 轉藍（最常用的非主要按鈕）
 *   text       無底色無邊框，hover 顯示灰底（工具列、密集 UI）
 *   link       外觀像連結的按鈕（本質仍是 button）
 *
 * ── danger prop ──
 *   danger     套用在任何 variant 上，將顏色改為危險色（紅色）
 *
 *   <Button variant="primary" danger>永久刪除</Button>        → 紅底白字（立即不可逆）
 *   <Button variant="secondary" danger>移至垃圾桶</Button>    → 紅框紅字（點下去還可反悔）
 *
 * ── pressed prop（toggle）──
 *   pressed    Toggle 按下狀態（持續 on/off），寫入 aria-pressed + data-state
 *   僅 secondary / tertiary / text 三個 variant 支援 toggle 視覺：
 *     - secondary + pressed → primary-subtle 底、primary 字、透明邊框
 *     - tertiary  + pressed → primary-subtle 底、primary 字、透明邊框（同 secondary 按下視覺）
 *     - text      + pressed → neutral-selected 底，hover 反向變淺，:active 深一階
 *   primary / link 傳入 pressed 無視覺效果（語意不符）
 *
 * ── Sizes（預設 md）──
 *   xs   h-field-xs（24px 固定），不隨 density 縮放
 *   sm   h-field-sm，md=28px / lg=32px
 *   md   h-field-md，md=32px / lg=36px  ← 預設（跟 Field/Input 對齊）
 *   lg   h-field-lg，md=36px / lg=40px
 *   icon-only 不是獨立尺寸 — 加 iconOnly prop 讓任何尺寸變正方形
 *
 * ── 內部結構 ──
 *   [startIcon?]  [label]  [badge? + endIcon?]
 *
 * ── 用法範例 ──
 *   <Button startIcon={Plus}>新增</Button>
 *   <Button variant="tertiary">取消</Button>
 *   <Button variant="primary" danger>永久刪除</Button>
 *   <Button variant="text" pressed={isPinned} startIcon={Pin} aria-label="釘選" iconOnly />
 *   <Button badge={<Badge count={3} />} endIcon={ChevronDown}>通知</Button>
 *   <Button size="sm" iconOnly startIcon={Plus} aria-label="新增" />
 *   <Button iconOnly startIcon={Bell} aria-label="通知 (3 則)"
 *           overlayBadge={<Badge count={3} />} />  ← badge 自動貼 icon 右上角
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
          'bg-primary text-on-emphasis',
          'hover:bg-primary-hover',
          'active:bg-primary-active',
          'disabled:bg-disabled disabled:text-fg-disabled disabled:border-transparent',
        ],
        secondary: [
          'bg-surface text-primary border-primary',
          'hover:text-primary-hover hover:border-primary-hover',
          'active:text-primary-active active:border-primary-active',
          'disabled:bg-transparent disabled:text-fg-disabled disabled:border-border',
          // Toggle pressed（secondary + data-state=on）：對齊原 checked variant 視覺
          'data-[state=on]:bg-primary-subtle data-[state=on]:text-primary data-[state=on]:border-transparent',
          'data-[state=on]:hover:text-primary-hover',
          'data-[state=on]:active:text-primary-active',
          'data-[state=on]:disabled:bg-disabled data-[state=on]:disabled:text-fg-disabled data-[state=on]:disabled:border-transparent',
        ],
        tertiary: [
          'bg-surface text-foreground border-border',
          'hover:text-primary-hover hover:border-primary-hover',
          'active:text-primary-active active:border-primary-active',
          'disabled:bg-transparent disabled:text-fg-disabled disabled:border-border',
          // Toggle pressed（tertiary + data-state=on）：與 secondary pressed 共用視覺
          'data-[state=on]:bg-primary-subtle data-[state=on]:text-primary data-[state=on]:border-transparent',
          'data-[state=on]:hover:text-primary-hover',
          'data-[state=on]:active:text-primary-active',
          'data-[state=on]:disabled:bg-disabled data-[state=on]:disabled:text-fg-disabled data-[state=on]:disabled:border-transparent',
        ],
        text: [
          'bg-transparent text-foreground border-transparent',
          'hover:bg-neutral-hover',
          'active:bg-neutral-active',
          'disabled:bg-transparent disabled:text-fg-disabled',
          // Toggle pressed（text + data-state=on）：走 neutral-selected family
          'data-[state=on]:bg-neutral-selected',
          'data-[state=on]:hover:bg-neutral-selected-hover',
          'data-[state=on]:active:bg-neutral-selected-active',
          'data-[state=on]:disabled:bg-transparent data-[state=on]:disabled:text-fg-disabled',
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
        xs: 'h-field-xs px-2 text-caption leading-compact gap-0',
        sm: 'h-field-sm px-3 min-w-14 text-body leading-compact gap-1',
        md: 'h-field-md px-3 min-w-16 text-body leading-compact gap-1',
        lg: 'h-field-lg px-3 min-w-20 text-body-lg leading-compact gap-1',
      },
    },
    compoundVariants: [
      // primary + danger → 紅底白字（立即不可逆操作）
      {
        variant: 'primary',
        danger: true,
        class: [
          'bg-error text-on-emphasis border-transparent',
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
      size: 'md',
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
  variant?: 'primary' | 'secondary' | 'tertiary' | 'text' | 'link' | (string & {})
  /** 套用危險色（紅色）。可與任何 variant 組合使用。 */
  danger?: boolean
  /**
   * Toggle 按下狀態（持續 on/off）。設定時 Button 變為 toggle：
   * - 自動寫入 `aria-pressed` + `data-state="on" | "off"`
   * - 樣式由 variant 的 `data-[state=on]` 分支套用
   * - 僅 secondary / tertiary / text 有 toggle 視覺；primary / link 傳入無效果
   *
   * 不傳此 prop 時 Button 就是一般按鈕，不帶 aria-pressed。
   */
  pressed?: boolean
  /** 左側 icon（LucideIcon），最多一個，loading 時自動替換為 spinner */
  startIcon?: LucideIcon
  /** 右側 badge（ReactNode），通常傳入計數指示器 */
  badge?: React.ReactNode
  /**
   * Overlay badge(iconOnly 專用)。接收 `<Badge>` 元素,Button 內部**自動定位在 startIcon 右上角**——
   * badge 中心對齊 icon 的 top-right corner(Material BadgedBox / iOS App icon canonical),不是按鈕邊緣。
   * 解決手刻 `relative + absolute -top-1 -right-1` 讓 badge 飄在按鈕 chrome 右上的問題。
   *
   * 世界級對照:Material BadgedBox、iOS App Icon、Ant Badge wrap icon,badge 相對於**視覺重心**(icon)。
   * 只在 `iconOnly=true` 時生效;非 iconOnly 時應該用 inline `badge` prop 放 suffix 位置。
   */
  overlayBadge?: React.ReactNode
  /** 右側 icon（LucideIcon），放在 badge 右邊，通常用於 ChevronDown 等方向指示 */
  endIcon?: LucideIcon
  /** Icon-only 模式：移除 padding，變為正方形（必須同時設定 aria-label） */
  iconOnly?: boolean
  /**
   * Dismiss 視覺類(cross-implementation dimming canonical)。用於 row dedicated region 的 close / delete /
   * remove / clear 按鈕(callback 語意為 onClose / onDismiss / onRemove / onClear)。
   *
   * 自動套用:
   * - `variant="text"`(強制,即使傳其他 variant 也 override)
   * - `iconOnly=true`(強制)
   * - Icon 色 override 為 `fg-muted` → hover `foreground`(跟 Inline Action dismiss 視覺一致)
   *
   * 目的:dismiss 視覺弱化不管實作(Inline Action 或 Button),cross-implementation 一致 —
   * user 不該感受到 dismiss 視覺差異。
   *
   * 典型 case:FileItem / DataTable row 內的 delete / remove(row dedicated region 用 Button,
   * 非 Inline Action)。
   *
   * 詳見 button.spec.md「Dismiss 視覺類」段 + patterns/element-anatomy/item-anatomy.spec.md
   * 「Dismiss 按鈕 canonical」段。
   */
  dismiss?: boolean
  /** 載入中狀態：startIcon 替換為 spinner，自動 disabled；badge / endIcon 維持顯示以避免 layout shift */
  loading?: boolean
  /** 撐滿父容器寬度 */
  fullWidth?: boolean
}

/**
 * Icon-only padding — calc `(field-height - icon-size) / 2` per size。
 *
 * 設計:startIcon 到左邊距離 = padding = `(height - icon) / 2`。
 * 純 icon-only 時 width = 2*padding + icon = height → **自然正方形**,不需要 aspect-square。
 * 有 suffix(badge / endIcon)時 width = 2*pad + icon + gap + suffix > height → **自然長方形**。
 * StartIcon 到左邊距離始終不變,形狀自動適應內容。
 *
 * 用 CSS var 讓 density 切換時 padding 自動跟著算(field-height 會變)。
 */
const ICON_ONLY_PX: Record<string, string> = {
  xs: 'px-[calc((var(--field-height-xs)-16px)/2)]',
  sm: 'px-[calc((var(--field-height-sm)-16px)/2)]',
  md: 'px-[calc((var(--field-height-md)-16px)/2)]',
  lg: 'px-[calc((var(--field-height-lg)-20px)/2)]',
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
      overlayBadge,
      endIcon: EndIcon,
      iconOnly = false,
      dismiss = false,
      loading = false,
      fullWidth = false,
      pressed,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    // ── FieldContext：在 Field 內時自動讀 size，讓 Button 跟 Input 同高 ──
    const fieldCtx = useFieldContext?.()
    const resolvedSize = size ?? (fieldCtx?.size as typeof size) ?? 'md'

    // ── Dismiss 視覺類 override(2026-04-22 cross-implementation dimming canonical) ──
    // dismiss=true 強制:variant="text" + iconOnly=true + icon 色弱化(fg-muted → hover foreground)
    // 跟 Inline Action dismiss 視覺一致。詳見 button.spec.md「Dismiss 視覺類」。
    const resolvedIconOnly = iconOnly || dismiss

    // ── Dev-mode warning:overlayBadge 只適用 iconOnly ──
    // 有 label 的 Button 傳入 overlayBadge 會被忽略(只 render icon / 不渲染 overlay slot),
    // 靜默忽略會讓 consumer 誤以為「傳了但位置錯」。Dev mode 印 warning 引導改用 `badge` prop
    // (inline 位置,跟 label 並列)或改 `iconOnly`。Spec SSOT:badge.spec.md「Overlay 適用元件」。
    if (process.env.NODE_ENV !== 'production' && overlayBadge && !iconOnly) {
      // eslint-disable-next-line no-console
      console.warn(
        '[DS Button] `overlayBadge` 只適用於 `iconOnly` Button。有 label 的 Button 請改用 `badge` prop(inline 位置,跟 label 並列),或移除 label 改為 iconOnly。SSOT:badge.spec.md「Overlay 適用元件 canonical」節。'
      )
    }

    // shadcn compat:AlertDialog、Toast 等元件內部會傳入這些 alias,
    // 在此靜默轉換,不暴露到型別或自動完成。
    // dismiss=true 強制 variant=text(dismiss canonical);override 其他 variant 傳入。
    const resolvedVariant: InternalVariant =
      dismiss ? 'text' :
      (variantProp as string) === 'destructive' ? 'primary' :
      (variantProp as string) === 'ghost'        ? 'text'    :
      (variantProp as InternalVariant) ?? 'primary'

    const resolvedDanger = dangerProp || (variantProp as string) === 'destructive'

    // ButtonGroup context：vertical group 自動注入 fullWidth
    const groupCtx = React.useContext(ButtonGroupContext)
    const resolvedFullWidth = fullWidth || !!groupCtx.fullWidth

    const Comp = asChild ? Slot : 'button'
    const iconSize = resolvedSize === 'lg' ? 20 : 16

    // loading 行為：spinner 永遠在 prefix 位置
    //   有 prefix icon → icon 換成 spinner（同位置，零 layout shift）
    //   無 prefix icon → spinner 加在文字左邊（按鈕略微變寬，可接受）
    const hasSuffix = badge != null || EndIcon !== undefined

    // icon-only 自動 tooltip：從 props 提取 aria-label，同時保留在 DOM
    const { 'aria-label': ariaLabel, ...restProps } = props

    // Toggle 狀態：pressed 定義時自動寫入 aria-pressed + data-state。
    // 未定義時不寫入任何 toggle 屬性（按鈕為一般 action button）。
    // 樣式由 cva 的 data-[state=on] 分支套用——secondary/tertiary 走 primary-subtle，
    // text 走 neutral-selected family；primary/link 不定義 on 分支，傳入無效果。
    const toggleAttrs =
      pressed === undefined
        ? {}
        : { 'aria-pressed': pressed, 'data-state': pressed ? 'on' : 'off' }

    const buttonEl = (
      <Comp
        className={cn(
          buttonVariants({ variant: resolvedVariant, danger: resolvedDanger, size: resolvedSize, className }),
          // iconOnly 鐵律:width === height(即使 children / badge / loading 被誤傳,
          // aspect-square 仍強制方形)。padding 用 calc 保 icon 在正中心,aspect-square
          // 只是雙重保險,不影響 padding 計算。
          resolvedIconOnly && cn(ICON_ONLY_PX[resolvedSize], 'aspect-square min-w-0 gap-0'),
          // Dismiss 視覺弱化:override Button text variant 預設 foreground 為 fg-muted → hover foreground
          // 跟 Inline Action dismiss 視覺一致(cross-implementation dimming canonical)
          dismiss && 'text-fg-muted hover:text-foreground',
          resolvedFullWidth && 'w-full',
        )}
        ref={ref}
        type="button"
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-label={ariaLabel}
        {...toggleAttrs}
        {...restProps}
      >
        {loading ? (
          <CircularProgress size={iconSize} className="text-current" />
        ) : StartIcon ? (
          resolvedIconOnly && overlayBadge ? (
            // Overlay badge canonical:wrapper 貼 icon 尺寸,badge 中心對齊 icon top-right corner
            // (Material BadgedBox / iOS App icon),不是 button chrome 角。
            //
            // CSS 細節(2026-04-20 bug fix):用 `inline-block` + 明確 width/height + `leading-none`
            // 避免 `inline-flex` span 在 Button flex container 內被撐高/撐寬(inline-flex 的 span
            // 在某些瀏覽器下會把絕對定位子元素的 translate 計算基準搞錯,造成 badge 噴飛、Button
            // aspect-square 失效)。明確給 span width/height = iconSize 鎖住 positioning context。
            <span
              className="relative inline-block leading-none shrink-0 pointer-events-none"
              style={{ width: iconSize, height: iconSize }}
            >
              <StartIcon size={iconSize} aria-hidden />
              <span className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 pointer-events-auto">
                {overlayBadge}
              </span>
            </span>
          ) : (
            <StartIcon size={iconSize} aria-hidden />
          )
        ) : null}
        {children != null && <span className="px-1">{children}</span>}
        {hasSuffix && (
          <span className="inline-flex items-center gap-1">
            {badge}
            {EndIcon && <EndIcon size={iconSize} aria-hidden />}
          </span>
        )}
      </Comp>
    )

    // icon-only + aria-label → 自動包 Tooltip（tooltip 是元件保證的行為）
    // 不建立獨立 TooltipProvider——依賴全域 Provider，
    // 這樣所有 tooltip 共享同一組 delay 參數和 warm-up 機制
    if (resolvedIconOnly && typeof ariaLabel === 'string' && !asChild) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{buttonEl}</TooltipTrigger>
          <TooltipContent>{ariaLabel}</TooltipContent>
        </Tooltip>
      )
    }

    return buttonEl
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants, ButtonGroupContext }

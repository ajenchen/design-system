// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import { cva } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFieldContext } from '@/design-system/components/Field/field-context'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'

/**
 * SegmentedControl — 互斥多選一的 value 選擇器
 *
 * 基於 Radix ToggleGroup（寫死 type="single"），橋接設計系統 token。
 * 內部 item 結構鏡射 Button，但兩者型別獨立。
 *
 * ── 定位 ──
 *   切 value（不是切 view）。塞得進 Field，Tabs 不行。
 *   切 view → Tabs；單一 on/off → Button pressed；>5 個選項 → Select。
 *
 * ── Size（對齊 field-height / Button 系列）──
 *   xs   h-field-xs（24 固定）
 *   sm   h-field-sm（28/32）
 *   md   h-field-md（32/36）★ 預設（跟 Button / Input / 所有 field-height 系列一致）
 *   lg   h-field-lg（36/40）
 *
 * ── fullWidth ──
 *   false  ★ 預設，item 寬度由內容決定（hug content）
 *   true   SegmentedControl 撐滿父容器寬度，所有 item 等分
 *
 * ── Item 結構 ──
 *   [startIcon?] [<span px-1>label</span>] [<span gap-1>suffix?</span>]
 *   suffix 目前只支援 badge；endIcon 為保留 slot、未開放
 *
 * ── iconOnly（group-level）──
 *   整組同時 icon-only 或全帶 label，不可混搭。
 */

type SegmentedControlSize = 'xs' | 'sm' | 'md' | 'lg'

interface SegmentedControlContextValue {
  size: SegmentedControlSize
  fullWidth: boolean
  iconOnly: boolean
  disabled: boolean
}

const SegmentedControlContext = React.createContext<SegmentedControlContextValue>({
  size: 'md',
  fullWidth: false,
  iconOnly: false,
  disabled: false,
})

// ── Root ──
const segmentedControlVariants = cva(
  'flex items-stretch rounded-md',
  {
    variants: {
      fullWidth: {
        true: 'w-full',
        false: 'w-fit',
      },
    },
    defaultVariants: {
      fullWidth: false,
    },
  }
)

export interface SegmentedControlProps
  extends Omit<
      React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>,
      'type' | 'defaultValue' | 'value' | 'onValueChange'
    > {
  size?: SegmentedControlSize
  /** 撐滿父容器寬度，所有 item 等分。預設 false（hug content） */
  fullWidth?: boolean
  iconOnly?: boolean
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}

const SegmentedControl = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  SegmentedControlProps
>(
  (
    {
      className,
      size: sizeProp,
      fullWidth = false,
      iconOnly = false,
      disabled = false,
      children,
      value,
      defaultValue,
      onValueChange,
      ...props
    },
    ref
  ) => {
    // Field 內自動讀 size，跟 Button 同機制
    const fieldCtx = useFieldContext?.()
    const resolvedSize: SegmentedControlSize =
      sizeProp ?? (fieldCtx?.size as SegmentedControlSize) ?? 'md'
    const resolvedDisabled = disabled || !!fieldCtx?.disabled

    // Memoize provider value(2026-04-22 D3 perf audit):避免每次父 render 重建 4-field object
    // 讓 children SegmentedControlItem 不必要 re-render
    const ctxValue = React.useMemo(
      () => ({ size: resolvedSize, fullWidth, iconOnly, disabled: resolvedDisabled }),
      [resolvedSize, fullWidth, iconOnly, resolvedDisabled],
    )

    return (
      <SegmentedControlContext.Provider value={ctxValue}>
        <ToggleGroupPrimitive.Root
          ref={ref}
          type="single"
          value={value}
          defaultValue={defaultValue}
          onValueChange={(v) => {
            // Radix 的 single ToggleGroup 允許 deselect（返回空字串）
            // SegmentedControl 是 radio 語意，不允許空值——忽略 deselect
            if (v) onValueChange?.(v)
          }}
          disabled={resolvedDisabled}
          className={cn(segmentedControlVariants({ fullWidth }), className)}
          {...props}
        >
          {children}
        </ToggleGroupPrimitive.Root>
      </SegmentedControlContext.Provider>
    )
  }
)
SegmentedControl.displayName = 'SegmentedControl'

// ── Item ──

/**
 * Icon-only base — Polaris/Atlassian idiom:`aspect-square + p-0 + flex-center`。
 * 0 magic-number、0 公式、0 border-deduction;flex centering(已在 itemVariants base)
 * 自動將 SVG 視覺置中,任何 size / icon 都自然正方形。
 *
 * 對齊 `Button.tsx` 的 `ICON_ONLY_BASE`(2026-04-25 從 padding-formula 派改 padding-free)。
 * Rule-of-3:目前 2 處 consumer(Button + SegmentedControl),尚未抽 utility/token;
 * 第 3 個 host 加入時抽到 `src/design-system/utils/`。
 *
 * 舊公式 `(field-height - icon)/2` 沒扣 border 2px,造成 SegmentedControl item 從
 * 設計 spec「自然正方形」漂移為 34×32 長方形(2026-04-25 audit 發現)。
 */
const ICON_ONLY_BASE = 'aspect-square p-0 min-w-0 gap-0'

const itemVariants = cva(
  [
    'relative inline-flex items-center justify-center',
    'whitespace-nowrap font-medium',
    'border border-border bg-surface text-fg-secondary',
    'transition-colors duration-150',
    'cursor-pointer select-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:z-20',
    // disabled：cursor-not-allowed + 鎖住 hover 色（不用 pointer-events-none，否則 cursor 無法變）
    // button[disabled] 本身擋 click，不需靠 pointer-events: none
    'disabled:cursor-not-allowed disabled:text-fg-disabled',
    'disabled:hover:text-fg-disabled disabled:hover:border-border',
    // hover（未選）：border 加深一階 + 文字轉深，對齊 Input / Chip hover
    'hover:text-foreground hover:border-border-hover hover:z-[5]',
    // selected: 文字 + 邊框都用 primary-hover,底色維持 bg-surface 不變 (跟 Chip 一致)
    //   ── 這是 pill 風格元件 (Chip / SegmentedControl) 的 canonical 選中規則:
    //      primary-hover 同時染文字和線條;底色不改 (不用 primary-subtle)。
    //      Tabs 是 underline 風格,規則不同 (文字 foreground + 底線 primary-hover)。
    //   z-10 讓 border 浮在相鄰 item 之上
    'data-[state=on]:text-primary-hover data-[state=on]:border-primary-hover data-[state=on]:z-10',
    // item 連體：除第一個外，-ml-px 讓相鄰 border 重疊
    'first:rounded-l-md last:rounded-r-md',
    '[&:not(:first-child)]:-ml-px',
  ],
  {
    variants: {
      size: {
        xs: 'h-field-xs px-2 text-caption leading-compact gap-0',
        sm: 'h-field-sm px-3 text-body leading-compact gap-1',
        md: 'h-field-md px-3 text-body leading-compact gap-1',
        lg: 'h-field-lg px-3 text-body-lg leading-compact gap-1',
      },
      fullWidth: {
        true: 'flex-1 min-w-0',
        false: '',
      },
    },
    defaultVariants: {
      size: 'md',
      fullWidth: false,
    },
  }
)

// iconOnly 是 group-level 決策（由 <SegmentedControl iconOnly> 控制），
// 不是 per-item 決策，所以 Item 型別不用 discriminated union 強制 iconOnly。
// 但當 group iconOnly = true 時，每個 item 必須提供 startIcon + aria-label——
// 這是語意契約，在 render 階段檢查並在 dev mode 發出警告（TS 層做不到這層檢查）。
export interface SegmentedControlItemProps
  extends React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> {
  /** 左側 icon（LucideIcon）。group iconOnly = true 時必填。 */
  startIcon?: LucideIcon
  /** 右側 suffix badge（通常是計數指示器）。group iconOnly = true 時會被忽略。 */
  badge?: React.ReactNode
  /**
   * 無障礙名稱。帶 label 時可選（label 已傳達語意），
   * 但 group iconOnly = true 時必填——同時驅動 screen reader 和自動 tooltip。
   */
  'aria-label'?: string
  children?: React.ReactNode
}

const SegmentedControlItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  SegmentedControlItemProps
>(({ className, startIcon: StartIcon, badge, children, 'aria-label': ariaLabel, ...restProps }, ref) => {
  const { size, fullWidth, iconOnly: groupIconOnly } = React.useContext(SegmentedControlContext)
  const iconSize = size === 'lg' ? 20 : size === 'xs' ? 14 : 16
  const hasSuffix = badge != null

  // Dev-mode 語意契約檢查：group iconOnly = true 時，item 必須有 startIcon + aria-label
  if (import.meta.env?.DEV && groupIconOnly) {
    if (!StartIcon) {
      console.warn(
        '[SegmentedControl] iconOnly 群組內的 item 必須提供 startIcon。'
      )
    }
    if (!ariaLabel) {
      console.warn(
        '[SegmentedControl] iconOnly 群組內的 item 必須提供 aria-label（作為無障礙名稱與自動 tooltip 來源）。'
      )
    }
  }

  const effectiveIconOnly = groupIconOnly

  const itemEl = (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        itemVariants({ size, fullWidth }),
        effectiveIconOnly && ICON_ONLY_BASE,
        className,
      )}
      aria-label={ariaLabel}
      {...restProps}
    >
      {StartIcon && <StartIcon size={iconSize} aria-hidden />}
      {!effectiveIconOnly && children != null && <span className="px-1">{children}</span>}
      {/* suffix wrapper：即使目前只有 badge，wrapper 從第一天就存在，
          未來若開放 endIcon，直接加入此 span 內 gap-1 自動生效 */}
      {hasSuffix && !effectiveIconOnly && (
        <span className="inline-flex items-center gap-1">{badge}</span>
      )}
    </ToggleGroupPrimitive.Item>
  )

  // icon-only 自動包 Tooltip（與 Button icon-only 一致）
  if (effectiveIconOnly && typeof ariaLabel === 'string') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{itemEl}</TooltipTrigger>
        <TooltipContent>{ariaLabel}</TooltipContent>
      </Tooltip>
    )
  }

  return itemEl
})
SegmentedControlItem.displayName = 'SegmentedControlItem'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const segmentedControlMeta = {
  component: 'SegmentedControl',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-surface'],
    fg: ['text-fg-disabled', 'text-fg-secondary', 'text-foreground'],
    ring: ['ring-ring'],
  },
} as const

export { SegmentedControl, SegmentedControlItem, segmentedControlVariants, itemVariants as segmentedControlItemVariants }
export type { SegmentedControlSize }

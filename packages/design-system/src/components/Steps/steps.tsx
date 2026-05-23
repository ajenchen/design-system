// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — foundational composite(Steps + StepItem + orientation/state/connector 邏輯緊密耦合,拆檔會讓 props drilling 複雜化超過可讀 gain)
import * as React from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────

export type StepsSize = 'sm' | 'md' | 'lg'
// code-quality-allow: dead-export — public API surface — consumer-exposed for future use
export type StepsOrientation = 'vertical' | 'horizontal'
export type StepsExpansion = 'follow-active' | 'multiple'
export type StepContentState = 'upcoming' | 'reachable' | 'current' | 'completed' | 'error'

// ── Constants ─────────────────────────────────────────────────────────────

const INDICATOR_SIZE: Record<StepsSize, number> = {
  sm: 8,
  md: 24,
  lg: 32,
}

const INDICATOR_ICON_SIZE: Record<StepsSize, number> = {
  sm: 0,
  md: 16,
  lg: 20,
}

const SM_HIT_AREA = 24

const INDICATOR_BOX_WIDTH: Record<StepsSize, number> = {
  sm: SM_HIT_AREA,
  md: INDICATOR_SIZE.md,
  lg: INDICATOR_SIZE.lg,
}

// ── Outer ring (box-shadow, zero layout impact) ───────────────────────────

const RING_GAP_PX = 2
const RING_WIDTH_PX = 2

function getOuterRingShadow(ringColor: string): string {
  return `0 0 0 ${RING_GAP_PX}px var(--surface), 0 0 0 ${RING_GAP_PX + RING_WIDTH_PX}px ${ringColor}`
}

function resolveRingColor(state: StepContentState, linear: boolean): string {
  if (state === 'error') return 'var(--error-hover)'
  if (state === 'current' && !linear) return 'var(--border-hover)'
  return 'var(--primary-hover)'
}

// ── Contexts ──────────────────────────────────────────────────────────────

interface StepsContextValue {
  value: string | undefined
  completedValues: Set<string>
  errorValues: Set<string>
  reachableValues: Set<string>
  linear: boolean
  size: StepsSize
  orientation: StepsOrientation
  expansion: StepsExpansion
  expandedSet: Set<string>
  setValue: (value: string) => void
  toggleExpanded: (value: string) => void
}

const StepsContext = React.createContext<StepsContextValue | null>(null)

function useStepsContext(): StepsContextValue {
  const ctx = React.useContext(StepsContext)
  if (!ctx) throw new Error('Steps compound components must be rendered inside <Steps>')
  return ctx
}

interface StepItemContextValue {
  value: string
  state: StepContentState
  focused: boolean
  disabled: boolean
  clickable: boolean
  expanded: boolean
  isLast: boolean
  activate: () => void
}

const StepItemContext = React.createContext<StepItemContextValue | null>(null)

function useStepItemContext(): StepItemContextValue {
  const ctx = React.useContext(StepItemContext)
  if (!ctx) throw new Error('StepLabel / StepDescription / StepContent must be inside <StepItem>')
  return ctx
}

const StepIndexContext = React.createContext<number>(0)

// ── Pure helpers ──────────────────────────────────────────────────────────

function computeState(
  itemValue: string,
  value: string | undefined,
  completedValues: Set<string>,
  errorValues: Set<string>,
  reachableValues: Set<string>,
  linear: boolean,
  override: StepContentState | undefined,
): StepContentState {
  if (override) return override
  if (errorValues.has(itemValue)) return 'error'
  if (completedValues.has(itemValue)) return 'completed'
  if (itemValue === value) return 'current'
  if (linear && reachableValues.has(itemValue)) return 'reachable'
  return 'upcoming'
}

function isClickable(
  state: StepContentState,
  linear: boolean,
  disabled: boolean,
): boolean {
  if (disabled) return false
  if (!linear) return true
  return state !== 'upcoming'
}

function normalizeExpanded(
  defaultExpanded: 'all' | 'none' | string[] | undefined,
  allValues: string[],
): Set<string> {
  if (defaultExpanded === 'all') return new Set(allValues)
  if (!defaultExpanded || defaultExpanded === 'none') return new Set()
  return new Set(defaultExpanded)
}

function computeReachableValues(
  childValues: string[],
  completedValues: string[],
): Set<string> {
  const completed = new Set(completedValues)
  const reachable = new Set(completed)
  for (const v of childValues) {
    if (!completed.has(v)) {
      reachable.add(v)
      break
    }
  }
  return reachable
}

// ── Steps root ────────────────────────────────────────────────────────────

const stepsRootVariants = cva('list-none p-0 m-0', {
  variants: {
    orientation: {
      vertical: 'flex flex-col',
      horizontal: 'flex flex-row items-start gap-3',
    },
  },
  defaultVariants: { orientation: 'vertical' },
})

export interface StepsProps
  extends Omit<React.HTMLAttributes<HTMLOListElement>, 'onChange' | 'defaultValue'>,
    VariantProps<typeof stepsRootVariants> {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  completedValues?: string[]
  errorValues?: string[]
  linear?: boolean
  size?: StepsSize
  orientation?: StepsOrientation
  expansion?: StepsExpansion
  defaultExpanded?: 'all' | 'none' | string[]
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const Steps = React.forwardRef<HTMLOListElement, StepsProps>(
  (
    {
      value: valueProp,
      defaultValue,
      onValueChange,
      completedValues = [],
      errorValues = [],
      linear = true,
      size = 'md',
      orientation = 'vertical',
      expansion = 'follow-active',
      defaultExpanded,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = React.useState<string | undefined>(defaultValue)
    const isControlled = valueProp !== undefined
    const value = isControlled ? valueProp : internalValue

    const setValue = React.useCallback(
      (next: string) => {
        if (!isControlled) setInternalValue(next)
        onValueChange?.(next)
      },
      [isControlled, onValueChange],
    )

    const childValues = React.useMemo(() => {
      const vals: string[] = []
      React.Children.forEach(children, child => {
        if (
          React.isValidElement(child) &&
          typeof child.props === 'object' &&
          child.props &&
          'value' in child.props
        ) {
          vals.push(String((child.props as { value: string }).value))
        }
      })
      return vals
    }, [children])

    const reachableValues = React.useMemo(
      () => computeReachableValues(childValues, completedValues),
      [childValues, completedValues],
    )

    const [expandedSet, setExpandedSet] = React.useState<Set<string>>(() =>
      normalizeExpanded(defaultExpanded, childValues),
    )

    const toggleExpanded = React.useCallback((itemValue: string) => {
      setExpandedSet(prev => {
        const next = new Set(prev)
        if (next.has(itemValue)) next.delete(itemValue)
        else next.add(itemValue)
        return next
      })
    }, [])

    const ctxValue = React.useMemo<StepsContextValue>(
      () => ({
        value,
        completedValues: new Set(completedValues),
        errorValues: new Set(errorValues),
        reachableValues,
        linear,
        size,
        orientation,
        expansion,
        expandedSet,
        setValue,
        toggleExpanded,
      }),
      [value, completedValues, errorValues, reachableValues, linear, size, orientation, expansion, expandedSet, setValue, toggleExpanded],
    )

    // Interleave horizontal connectors between items
    const count = React.Children.count(children)
    const itemsWithIndex: React.ReactNode[] = []

    React.Children.forEach(children, (child, index) => {
      if (!React.isValidElement(child)) {
        itemsWithIndex.push(child)
        return
      }
      const isLast = index === count - 1
      const cloned = React.cloneElement(
        child as React.ReactElement<StepItemInjectedProps>,
        { __isLast: isLast },
      )
      itemsWithIndex.push(
        <StepIndexContext.Provider key={`item-${index}`} value={index + 1}>
          {cloned}
        </StepIndexContext.Provider>,
      )
      // Horizontal connectors are now INSIDE each StepItem (Ant Design pattern),
      // not between items. No interleaving needed.
    })

    return (
      <StepsContext.Provider value={ctxValue}>
        <ol
          ref={ref}
          data-orientation={orientation}
          data-size={size}
          className={cn(stepsRootVariants({ orientation }), className)}
          {...props}
        >
          {itemsWithIndex}
        </ol>
      </StepsContext.Provider>
    )
  },
)
Steps.displayName = 'Steps'

// ── StepItem ──────────────────────────────────────────────────────────────

interface StepItemInjectedProps {
  __isLast?: boolean
}

export interface StepItemProps
  extends Omit<React.HTMLAttributes<HTMLLIElement>, 'value'>,
    StepItemInjectedProps {
  value: string
  state?: 'error'
  disabled?: boolean
}

const stepItemVariants = cva('group/step-item outline-none', {
  variants: {
    orientation: {
      // pb-6 on li provides spacing for next item; connector is absolute within li
      vertical: 'relative flex flex-col',
      // Ant Design pattern:flex-1 等寬(最後一步用 last: 覆蓋成自然寬度)。
      // Connector 在 item 內部(不是 items 之間的獨立元素)。
      horizontal: 'flex-1 min-w-0 last:flex-none last:shrink-0',
    },
    size: {
      sm: 'text-body',
      md: 'text-body',
      lg: 'text-body-lg',
    },
  },
  defaultVariants: { orientation: 'vertical', size: 'md' },
})

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const StepItem = React.forwardRef<HTMLLIElement, StepItemProps>(
  ({ value, state: stateOverride, disabled = false, children, className, __isLast = false, ...props }, ref) => {
    const steps = useStepsContext()
    const state = computeState(
      value,
      steps.value,
      steps.completedValues,
      steps.errorValues,
      steps.reachableValues,
      steps.linear,
      stateOverride,
    )
    const focused = value === steps.value
    const clickable = isClickable(state, steps.linear, disabled)
    const expanded =
      steps.expansion === 'follow-active' ? focused : steps.expandedSet.has(value)

    const activate = React.useCallback(() => {
      if (!clickable) return
      // 永遠更新 focus(value),multiple 模式額外 toggle 展開
      steps.setValue(value)
      if (steps.expansion === 'multiple') {
        steps.toggleExpanded(value)
      }
    }, [clickable, steps, value])

    const itemCtx = React.useMemo<StepItemContextValue>(() => ({
      value,
      state,
      focused,
      disabled,
      clickable,
      expanded,
      isLast: __isLast,
      activate,
    }), [value, state, focused, disabled, clickable, expanded, __isLast, activate])

    const isVertical = steps.orientation === 'vertical'

    return (
      <StepItemContext.Provider value={itemCtx}>
        <li
          ref={ref}
          data-state={state}
          data-focused={focused || undefined}
          data-disabled={disabled || undefined}
          data-clickable={clickable || undefined}
          aria-current={focused ? 'step' : undefined}
          aria-disabled={disabled || undefined}
          className={cn(
            stepItemVariants({ orientation: steps.orientation, size: steps.size }),
            isVertical && !__isLast && 'pb-6',
            !clickable && 'cursor-not-allowed',
            className,
          )}
          {...props}
        >
          <StepItemLayout>{children}</StepItemLayout>
        </li>
      </StepItemContext.Provider>
    )
  },
)
StepItem.displayName = 'StepItem'

// ── StepItem internal layout ─────────────────────────────────────────────

function StepItemLayout({ children }: { children: React.ReactNode }) {
  const steps = useStepsContext()
  const item = useStepItemContext()

  let labelNode: React.ReactNode = null
  let descNode: React.ReactNode = null
  let contentNode: React.ReactNode = null
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return
    if (child.type === StepLabel) labelNode = child
    else if (child.type === StepDescription) descNode = child
    else if (child.type === StepContent) contentNode = child
  })

  if (steps.orientation === 'horizontal') {
    return <HorizontalLayout label={labelNode} description={descNode} />
  }
  return (
    <VerticalLayout label={labelNode} description={descNode} content={contentNode} isLast={item.isLast} />
  )
}

// ── Clickable header ─────────────────────────────────────────────────────

function StepItemHeader({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const item = useStepItemContext()
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!item.clickable) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      item.activate()
    }
  }
  return (
    <div
      role={item.clickable ? 'button' : undefined}
      tabIndex={item.clickable ? 0 : undefined}
      onClick={item.clickable ? item.activate : undefined}
      onKeyDown={item.clickable ? onKeyDown : undefined}
      aria-disabled={item.disabled || undefined}
      className={cn(
        'outline-none',
        item.clickable
          ? 'cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
          : 'cursor-not-allowed',
        className,
      )}
      style={style}
    >
      {children}
    </div>
  )
}

// ── Vertical layout ──────────────────────────────────────────────────────

function VerticalLayout({
  label,
  description,
  content,
  isLast,
}: {
  label: React.ReactNode
  description: React.ReactNode
  content: React.ReactNode
  isLast: boolean
}) {
  const steps = useStepsContext()
  const item = useStepItemContext()
  const showContent = !!content && item.expanded
  const indicatorBox = INDICATOR_BOX_WIDTH[steps.size]

  return (
    <>
      <StepItemHeader className="flex items-start gap-3">
        <div className="shrink-0" style={{ width: indicatorBox }}>
          <div className="h-[1lh] flex items-center justify-center">
            <StepIndicator />
          </div>
        </div>
        <div className="flex-1 min-w-0 flex items-start">
          <div className="flex-1 min-w-0 flex flex-col">
            {label}
            {description}
          </div>
          {steps.expansion === 'multiple' && !!content && (
            <span aria-hidden className="h-[1lh] flex items-center shrink-0 ml-2">
              <ChevronDown
                size={16}
                className={cn(
                  'text-fg-muted transition-transform duration-150',
                  item.expanded && 'rotate-180',
                )}
              />
            </span>
          )}
        </div>
      </StepItemHeader>
      {showContent && (
        <div className="flex items-start gap-3 mt-3">
          <div className="shrink-0" style={{ width: indicatorBox }} />
          <div className="flex-1 min-w-0">{content}</div>
        </div>
      )}
      {!isLast && <VerticalConnectorLine />}
    </>
  )
}

// ── Vertical connector ───────────────────────────────────────────────────

function VerticalConnectorLine() {
  const steps = useStepsContext()
  const item = useStepItemContext()
  const isBlue = item.state === 'completed'
  const radius = INDICATOR_SIZE[steps.size] / 2
  const gap = 8

  return (
    <div
      aria-hidden
      className={cn(
        'absolute w-px',
        isBlue ? 'bg-primary' : 'bg-border',
      )}
      style={{
        left: INDICATOR_BOX_WIDTH[steps.size] / 2,
        top: `calc(0.5lh + ${radius}px + ${gap}px)`,
        bottom: `calc(${radius}px - 0.5lh + ${gap}px)`,
      }}
    />
  )
}

// ── Horizontal layout (Ant Design pattern) ──────────────────────────────
//
// Connector 在 **item 內部**(不是 items 之間的獨立元素):
//   Step (flex-1): [indicator][gap][label][gap][──connector──]
//   Last step:     [indicator][gap][label]  (無 connector)
//
// Root: flex-row gap-3 → gap 只在 step items 之間
// Step items: flex-1 等寬(最後一步 flex-none 自然寬度)
//
// 等距保證:
//   label→connector gap = item 內 flex gap-3 = 12px
//   connector→next circle = root gap-3 = 12px
//   兩邊都是 12px ✓
//
// Description 在 step item 內(connector 下方),wrap 到 item 寬度 = 最長到連結線尾段 ✓

function HorizontalLayout({
  label,
  description,
}: {
  label: React.ReactNode
  description: React.ReactNode
}) {
  const item = useStepItemContext()
  const steps = useStepsContext()
  const isBlue = item.state === 'completed'
  const indicatorBox = INDICATOR_BOX_WIDTH[steps.size]

  return (
    <>
      {/* Row 1: indicator + label + connector(在同一個 flex row) */}
      <StepItemHeader className="flex items-start gap-3">
        <div className="h-[1lh] flex items-center shrink-0">
          <StepIndicator />
        </div>
        <div className="shrink-0 min-w-0">{label}</div>
        {/* Connector 在 item 內部,flex-1 填滿剩餘寬度 */}
        {!item.isLast && (
          <div className="h-[1lh] flex-1 flex items-center min-w-4" aria-hidden>
            <div className={cn('h-px w-full', isBlue ? 'bg-primary' : 'bg-border')} />
          </div>
        )}
      </StepItemHeader>
      {/* Row 2: description — 在 item 寬度內 wrap(含 connector 佔的空間) */}
      {description && (
        <div className="min-w-0" style={{ paddingLeft: indicatorBox + 12 }}>
          {description}
        </div>
      )}
    </>
  )
}

// ── StepIndicator ────────────────────────────────────────────────────────

function StepIndicator() {
  const steps = useStepsContext()
  const item = useStepItemContext()
  const { size, linear } = steps
  const { state, focused, disabled } = item

  if (size === 'sm') return <SmIndicator state={state} focused={focused} disabled={disabled} linear={linear} />
  return <MdLgIndicator size={size} state={state} focused={focused} disabled={disabled} linear={linear} />
}

// ── sm indicator: 8px dot in 24px hit area ───────────────────────────────

function SmIndicator({
  state,
  focused,
  disabled,
  linear,
}: {
  state: StepContentState
  focused: boolean
  disabled: boolean
  linear: boolean
}) {
  // sm current (linear) and reachable: hollow ring
  const isHollow = (state === 'current' && linear) || state === 'reachable'

  let dotStyle: React.CSSProperties
  if (isHollow) {
    dotStyle = {
      width: INDICATOR_SIZE.sm,
      height: INDICATOR_SIZE.sm,
      background: 'transparent',
      border: '2px solid var(--primary-hover)',
      boxShadow: focused ? getOuterRingShadow(resolveRingColor(state, linear)) : undefined,
    }
  } else {
    const dotBg =
      state === 'completed' ? 'var(--primary)'
        : state === 'error' ? 'var(--error)'
          : state === 'current' && !linear ? 'var(--fg-disabled)'
            : 'var(--fg-disabled)' // upcoming + non-linear fallback

    dotStyle = {
      width: INDICATOR_SIZE.sm,
      height: INDICATOR_SIZE.sm,
      background: dotBg,
      boxShadow: focused ? getOuterRingShadow(resolveRingColor(state, linear)) : undefined,
    }
  }

  return (
    <span
      aria-hidden
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: SM_HIT_AREA, height: SM_HIT_AREA }}
    >
      <span
        className={cn('block rounded-full', disabled && 'opacity-disabled')}
        style={dotStyle}
      />
    </span>
  )
}

// ── md/lg indicator: filled circle with number/icon ──────────────────────

function MdLgIndicator({
  size,
  state,
  focused,
  disabled,
  linear,
}: {
  size: StepsSize
  state: StepContentState
  focused: boolean
  disabled: boolean
  linear: boolean
}) {
  const diameter = INDICATOR_SIZE[size]
  const iconPx = INDICATOR_ICON_SIZE[size]

  let fillBg: string
  let contentColor: string

  switch (state) {
    case 'error':
      fillBg = 'var(--error)'
      contentColor = 'var(--on-emphasis)'
      break
    case 'completed':
      fillBg = 'var(--primary)'
      contentColor = 'var(--on-emphasis)'
      break
    case 'current':
      if (linear) {
        fillBg = 'var(--primary)'
        contentColor = 'var(--on-emphasis)'
      } else {
        fillBg = 'var(--secondary)'
        contentColor = 'var(--foreground)'
      }
      break
    case 'reachable':
      fillBg = 'var(--primary)'
      contentColor = 'var(--on-emphasis)'
      break
    default: // upcoming
      if (linear) {
        fillBg = 'var(--muted)'
        contentColor = 'var(--fg-disabled)'
      } else {
        fillBg = 'var(--secondary)'
        contentColor = 'var(--foreground)'
      }
      break
  }

  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex items-center justify-center shrink-0 rounded-full',
        'font-medium leading-none transition-colors',
        disabled && 'opacity-disabled',
      )}
      style={{
        width: diameter,
        height: diameter,
        background: fillBg,
        color: contentColor,
        fontSize: size === 'lg' ? 'var(--font-body-size)' : 'var(--font-caption-size)',
        boxShadow: focused ? getOuterRingShadow(resolveRingColor(state, linear)) : undefined,
      }}
    >
      <IndicatorContent state={state} iconPx={iconPx} />
    </span>
  )
}

function IndicatorContent({ state, iconPx }: { state: StepContentState; iconPx: number }) {
  if (state === 'completed') return <Check size={iconPx} strokeWidth={2.5} />
  if (state === 'error') return <X size={iconPx} strokeWidth={2.5} />
  return <StepNumber />
}

function StepNumber() {
  const index = React.useContext(StepIndexContext)
  return <span>{index}</span>
}

// ── StepLabel ────────────────────────────────────────────────────────────

export interface StepLabelProps extends React.HTMLAttributes<HTMLSpanElement> {}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const StepLabel = React.forwardRef<HTMLSpanElement, StepLabelProps>(
  ({ className, children, ...props }, ref) => {
    const { size } = useStepsContext()
    const { state, focused, disabled } = useStepItemContext()

    return (
      <span
        ref={ref}
        className={cn(
          'font-medium break-words',
          size === 'lg' ? 'text-body-lg' : 'text-body',
          disabled
            ? 'text-fg-disabled'
            : state === 'error'
              ? 'text-error-text'
              : focused
                ? 'text-foreground'
                : 'text-fg-secondary',
          className,
        )}
        {...props}
      >
        {children}
      </span>
    )
  },
)
StepLabel.displayName = 'StepLabel'

// ── StepDescription ──────────────────────────────────────────────────────

export interface StepDescriptionProps extends React.HTMLAttributes<HTMLSpanElement> {}

const StepDescription = React.forwardRef<HTMLSpanElement, StepDescriptionProps>(
  ({ className, children, style, ...props }, ref) => {
    const { size } = useStepsContext()
    const { disabled } = useStepItemContext()

    return (
      <span
        ref={ref}
        className={cn(
          // Steps 跟 MenuItem 同 scanning-family:sm/md = scanning(body+caption),lg = scanning-lg(body-lg+body-compact)
          size === 'lg'
            ? 'mt-[var(--item-gap-label-desc-scanning-lg)]'
            : 'mt-[var(--item-gap-label-desc-scanning)]',
          'leading-compact break-words',
          disabled ? 'text-fg-disabled' : 'text-fg-secondary',
          className,
        )}
        style={{
          fontSize: size === 'lg' ? 'var(--font-body-size)' : 'var(--font-caption-size)',
          ...style,
        }}
        {...props}
      >
        {children}
      </span>
    )
  },
)
StepDescription.displayName = 'StepDescription'

// ── StepContent ──────────────────────────────────────────────────────────

export interface StepContentProps extends React.HTMLAttributes<HTMLDivElement> {}

const StepContent = React.forwardRef<HTMLDivElement, StepContentProps>(
  ({ className, children, ...props }, ref) => {
    const { orientation } = useStepsContext()
    if (orientation === 'horizontal') return null
    return (
      <div
        ref={ref}
        className={cn('text-body text-foreground min-w-0', className)}
        {...props}
      >
        {children}
      </div>
    )
  },
)
StepContent.displayName = 'StepContent'

// ── Exports ──────────────────────────────────────────────────────────────

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const stepsMeta = {
  component: 'Steps',
  family: 2,
  variants: {},
  sizes: {
    sm: { px: 8, when: 'Sidebar / 緊湊 onboarding;indicator 8px dot' },
    md: { px: 24, when: '預設 — wizard / checkout / 註冊主流程;indicator 24px circle' },
    lg: { px: 32, when: 'Marketing 流程展示 / 重要 onboarding;indicator 32px circle' },
  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-primary'],
    fg: ['--fg-disabled', '--foreground', '--on-emphasis', 'text-error-text', 'text-fg-disabled', 'text-fg-muted', 'text-fg-secondary', 'text-foreground'],
    ring: [],
  },
} as const

export { Steps, StepItem, StepLabel, StepDescription, StepContent, stepsRootVariants, stepItemVariants }

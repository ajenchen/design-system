import * as React from 'react'
import { X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, EMPTY_DISPLAY, nakedCellRowModeAlign } from '@/design-system/components/Field/field-wrapper'
import { useFieldContext } from '@/design-system/components/Field/field-context'
import { Tag } from '@/design-system/components/Tag/tag'
import { ItemInlineAction, ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { OverflowIndicator } from '@/design-system/components/OverflowIndicator/overflow-indicator'
import { SelectMenu, type SelectMenuOption } from '@/design-system/components/SelectMenu/select-menu'
import { useIsTouchDevice } from '@/design-system/hooks/use-is-touch-device'

// ── constants ───────────────────────────────────────────────────────────────

const GAP = 4

const tagPadding: Record<string, string> = {
  sm: 'px-[calc((var(--field-height-sm)_-_1.25rem)_/_2)]',
  md: 'px-[calc((var(--field-height-md)_-_1.5rem)_/_2)]',
  lg: 'px-[calc((var(--field-height-lg)_-_1.5rem)_/_2)]',
}

export interface SelectOption { value: string; label: string }

// ── useOverflowCount (unchanged) ────────────────────────────────────────────

function useOverflowCount(
  containerRef: React.RefObject<HTMLDivElement | null>,
  tagEls: React.MutableRefObject<(HTMLDivElement | null)[]>,
  overflowEl: React.RefObject<HTMLDivElement | null>,
  totalCount: number,
  enabled: boolean,
  gap: number = GAP,  // (2026-05-07 v15.13)stack avatar 模式傳 0
): { visibleCount: number; ready: boolean } {
  const [state, setState] = React.useState({ visibleCount: totalCount, ready: !enabled })

  React.useEffect(() => {
    if (!enabled || totalCount === 0) { setState({ visibleCount: totalCount, ready: true }); return }
    const container = containerRef.current
    if (!container) return

    const calc = () => {
      const cs = getComputedStyle(container)
      const available = container.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
      for (const el of tagEls.current) if (el) el.hidden = false
      const ofEl = overflowEl.current
      if (ofEl) ofEl.hidden = false
      const overflowW = ofEl?.offsetWidth || 60
      // **#3 fix(2026-05-04)**:width-check 先於 count++,並處理 i=0 邊界(1 tag 自身就太寬 → 全 hidden 顯 +N)
      // 之前 bug:greedy `count++` 永遠至少 = 1,1-tag-too-wide case 視覺呈半個 tag clipped + +N(錯)
      // 修後:1 tag 太寬時 count = 0,全 N tags 走 +N 顯 indicator
      let used = 0, count = 0
      for (let i = 0; i < totalCount; i++) {
        const el = tagEls.current[i]
        if (!el) continue
        const w = el.offsetWidth
        const next = used + (count > 0 ? gap : 0) + w
        const remaining = totalCount - count - 1
        // width check FIRST(無 `count > 0` 短路):任何超寬都 break,包含 i=0 case
        if (remaining > 0 && next + gap + overflowW > available) break
        if (remaining === 0 && next > available) break
        used = next; count++
      }
      for (let i = 0; i < tagEls.current.length; i++) { const el = tagEls.current[i]; if (el) el.hidden = i >= count }
      if (ofEl) ofEl.hidden = count >= totalCount
      setState({ visibleCount: count, ready: true })
    }

    requestAnimationFrame(calc)
    const obs = new ResizeObserver(calc)
    obs.observe(container)
    return () => obs.disconnect()
  }, [containerRef, totalCount, enabled, gap])  // codex P2 fix(2026-05-07):gap 入 deps,runtime 改 tagAreaGapPx 才會 recalc

  return state
}

// ── OverflowTagList (unchanged) ──────────────────────────────────────────────

interface OverflowTagListProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  items: { value: string; label: string }[]
  size: 'sm' | 'md' | 'lg'
  wrap: boolean
  renderTag: (item: { value: string; label: string }, index: number) => React.ReactNode
  onRemove?: (value: string) => void
  trailing?: React.ReactNode
  /** Tag area gap in px(default 4)。Stack mode 傳 0 讓 negative margin 生效 */
  gap?: number
  /**
   * Optional class merged into each tag's outer measurement wrapper `<div className="shrink-0">`.
   * (2026-05-07 v15.13)為 PeoplePicker stack mode 提供 hook point — 讓 stack avatar 走
   * `-ml-0.5 first:ml-0 relative inline-flex group/avatar` 達成 overlap + dismiss group selector,
   * 同時保留 `useOverflowCount` 量測 wrapper(必要,不可移除)。
   *
   * **Caveat(Q2 known tradeoff)**:`-ml-0.5` 負 margin 不改 each wrapper 的 `offsetWidth` →
   * `useOverflowCount` 累加按完整寬計算 → 視覺實際塞得進的 tag 數 > 量測判定能塞的數 →
   * **+N indicator 偏保守**(視覺還有空間但已顯 `+N`)。當前 v1 接受此 tradeoff;若窄 trigger
   * + 多人場景明顯不對,future 可加 `overlapPx` prop 讓量測補償。
   */
  tagWrapperClassName?: string
}

function OverflowTagList({ containerRef, items, size, wrap, renderTag, onRemove, trailing, tagWrapperClassName, gap = GAP }: OverflowTagListProps) {
  const tagEls = React.useRef<(HTMLDivElement | null)[]>([])
  const overflowEl = React.useRef<HTMLDivElement>(null)
  const { visibleCount, ready } = useOverflowCount(containerRef, tagEls, overflowEl, items.length, !wrap, gap)
  tagEls.current.length = items.length

  if (wrap) return <>{items.map((item, i) => renderTag(item, i))}{trailing}</>

  const overflow = items.length - visibleCount
  const hiddenItems = items.slice(visibleCount)

  return (
    <span className="contents" style={{ opacity: ready ? 1 : 0 }}>
      {items.map((item, i) => (
        <div key={item.value} ref={el => { tagEls.current[i] = el }} className={cn('shrink-0', tagWrapperClassName)}>{renderTag(item, i)}</div>
      ))}
      <div ref={overflowEl} className="shrink-0">
        <OverflowIndicator count={overflow} shape="tag" size={size}>
          {hiddenItems.map(item => (
            <Tag key={item.value} size="sm" onDismiss={onRemove ? () => onRemove(item.value) : undefined}>
              {item.label}
            </Tag>
          ))}
        </OverflowIndicator>
      </div>
      {trailing}
    </span>
  )
}

// ── Internal tag-stack renderer (consumed by ReadonlyMultiSelect / mode='display') ───
//
// Phase B2(2026-05-05):原 ComboboxDisplay sub-component 已 retire,改 inline `<Combobox mode="display">`。
// 本 helper 只負責 tag-stack 內容渲染(OverflowTagList 消費),不包 Field wrapper。
function ComboboxTagStack({
  value, options, tagSize = 'md', wrap = false, containerRef: externalRef, disabled = false,
}: {
  value?: string[] | null; options?: SelectOption[]; tagSize?: 'sm' | 'md' | 'lg'
  wrap?: boolean; containerRef?: React.RefObject<HTMLDivElement | null>; disabled?: boolean
}) {
  const ownRef = React.useRef<HTMLDivElement>(null)
  if (!value || value.length === 0) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  const items = value.map(v => ({ value: v, label: options?.find(o => o.value === v)?.label ?? v }))
  const disabledClass = disabled ? 'bg-disabled text-fg-disabled' : undefined

  const content = (
    <OverflowTagList containerRef={externalRef ?? ownRef} items={items} size={tagSize} wrap={wrap}
      renderTag={(item) => <Tag size={tagSize} className={cn('shrink-0', disabledClass)}>{item.label}</Tag>} />
  )

  if (externalRef) return content
  // 2026-05-05 v9 fix(Bug 4):display path 內 wrapper 必須 `flex-1 min-w-0`,否則在 cell flex
  // parent 下不認領完整可用寬度 → OverflowTagList 量得寬度小於 edit path → 顯 `+N` 多於 edit。
  // edit path tagAreaRef wrapper 已是 `flex-1 min-w-0`(NativeCombobox/CustomCombobox line 258 / 354),
  // display 必對稱才 SSOT。
  return (
    <div ref={ownRef} className={cn('flex-1 min-w-0 flex items-center', wrap ? 'flex-wrap' : 'overflow-visible')} style={{ gap: GAP }}>
      {content}
    </div>
  )
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface ComboboxProps {
  mode?: FieldMode
  /** Field chrome variant. Default = context.variant ?? 'default'. Per-prop override. */
  variant?: FieldVariant
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  options: SelectOption[]
  value?: string[]
  onChange?: (value: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  wrap?: boolean
  clearable?: boolean
  /** 啟用搜尋 */
  searchable?: boolean
  /** 搜尋框位置：menu（浮層內，預設）或 trigger（inline input） */
  searchIn?: 'menu' | 'trigger'
  /** 搜尋框 placeholder（未有選項時顯示)。Default: 「搜尋…」 */
  searchPlaceholder?: string
  /** 搜尋框 ARIA label。Default: 「搜尋選項」 */
  searchAriaLabel?: string
  /** Empty-selection placeholder text。Default: 「選擇…」 */
  emptyPlaceholder?: string
  /** a11y:無 Field wrapper 時提供 role='combobox' 的 accessible name(axe aria-input-field-name) */
  'aria-label'?: string
  /** Initial open state(uncontrolled)— 對齊 Select.defaultOpen / Radix Popover canonical。
   *  DataTable cell-as-input 1-step open 用 */
  defaultOpen?: boolean
  /** open state 變更 callback。DataTable cell-as-input 用:open=false → cell exit edit */
  onOpenChange?: (open: boolean) => void
  /**
   * Selected tag pill 客製 render(2026-05-07 v15.5)。
   *
   * 設了 → 每個 selected tag pill 走 consumer 提供的 ReactNode(收 item={value, label}
   * + onRemove,consumer 自己組 onDismiss);沒設 → 走預設 `<Tag>` text-only pill。
   *
   * 用例:PeoplePicker(multi)用此 slot 把 selected tag 換成 avatar + name pill,而非
   * 純文字 Tag。對齊 PeoplePicker = Combobox wrapper SSOT。
   */
  tagRenderer?: (item: { value: string; label: string }, onRemove: () => void) => React.ReactNode
  /**
   * Optional class merged into each tag's outer measurement wrapper (2026-05-07 v15.13)。
   * Stack avatar 模式用此 hook point 達成 sibling-level overlap (`-ml-0.5`) + group selector
   * (`group/avatar`)— 既保留 Combobox 必要 measurement wrapper,又讓 dismiss/overlap 視覺生效。
   */
  tagWrapperClassName?: string
  /**
   * Tag area gap in px (2026-05-07 v15.13)。預設 4(pill mode 標準 spacing)。
   * Stack avatar 模式傳 0,讓 `tagWrapperClassName` 的 `-ml-0.5` negative margin 生效
   * (CSS `gap` 套在 flex container 上會強制 sibling spacing,蓋過 negative margin)。
   * **Q2 known tradeoff**:0 後 useOverflowCount 仍按 wrapper.offsetWidth 累加(不含 overlap
   * 補償)→ +N 偏保守。當前接受;若需精準可 future 加 `overlapPx` 補償邏輯。
   */
  tagAreaGapPx?: number
}

const getIconSize = (size: string) => size === 'lg' ? 20 : 16

// ── Shared readonly/disabled/display render ─────────────────────────────────

function ReadonlyMultiSelect({
  mode, variant: variantProp, size, options, value, wrap, className,
}: Pick<ComboboxProps, 'mode' | 'variant' | 'size' | 'options' | 'value' | 'wrap' | 'className'>) {
  const resolvedMode = mode ?? 'readonly'
  const variant = variantProp ?? 'default'
  const sz = size ?? 'md'
  const containerRef = React.useRef<HTMLDivElement>(null)
  const hasTags = (value?.length ?? 0) > 0

  // mode='display'(Phase B2 2026-05-05):純內容輸出 — tag stack 不包 Field wrapper / 不 reserve 高度。
  //   對齊原 ComboboxDisplay sub-component(retired)。
  if (resolvedMode === 'display') {
    if (!hasTags) return <span className={cn('text-fg-muted', className)}>{EMPTY_DISPLAY}</span>
    return (
      <ComboboxTagStack value={value} options={options} tagSize={sz} wrap={wrap} />
    )
  }

  return (
    <div ref={containerRef}
      className={cn(fieldWrapperStyles({ mode: resolvedMode, variant, size: sz }), hasTags && tagPadding[sz],
        wrap ? 'flex-wrap py-1' : 'overflow-visible', className)}
      style={{ gap: GAP, ...(wrap ? { height: 'auto' } : undefined) }} data-field-mode={resolvedMode}>
      {hasTags ? (
        <ComboboxTagStack value={value} options={options} tagSize={sz} wrap={wrap}
          containerRef={containerRef} disabled={resolvedMode === 'disabled'} />
      ) : (
        <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
      )}
    </div>
  )
}

// ── Native Combobox (mobile) ────────────────────────────────────────

function NativeCombobox({
  mode = 'edit', variant: variantProp, error = false, size = 'md', options, value = [], onChange, placeholder,
  className, disabled, wrap = false, clearable = false,
}: ComboboxProps) {
  const fieldCtx = useFieldContext()
  const variant: FieldVariant = variantProp ?? fieldCtx?.variant ?? 'default'
  const resolvedMode = disabled ? 'disabled' : mode
  const iconSize = getIconSize(size)
  const showClear = clearable && value.length > 0 && resolvedMode === 'edit'

  const handleRemove = (v: string) => onChange?.(value.filter(x => x !== v))
  const handleAdd = (v: string) => { if (!value.includes(v)) onChange?.([...value, v]) }

  if (resolvedMode !== 'edit') {
    return <ReadonlyMultiSelect mode={resolvedMode} variant={variant} size={size} options={options} value={value} wrap={wrap} className={className} />
  }

  const items = value.map(v => ({ value: v, label: options.find(o => o.value === v)?.label ?? v }))
  const unselected = options.filter(o => !value.includes(o.value))
  const selectRef = React.useRef<HTMLSelectElement>(null)
  const tagAreaRef = React.useRef<HTMLDivElement>(null)
  const tagHeight = size === 'sm' ? 20 : 24

  const selectDropdown = unselected.length > 0 ? (
    <select ref={selectRef} value="" onChange={(e) => handleAdd(e.target.value)}
      className={cn('bg-transparent outline-none border-none p-0 text-[inherit] font-[inherit] leading-[inherit] text-fg-muted cursor-pointer appearance-none',
        value.length > 0 ? 'absolute inset-0 w-full h-full opacity-0 z-0 cursor-pointer' : 'relative z-10 flex-1 min-w-20')}>
      <option value="" disabled>{placeholder ?? '選擇...'}</option>
      {unselected.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  ) : null

  return (
    <div className={cn(fieldWrapperStyles({ mode: 'edit', variant: variant, size }), value.length > 0 && tagPadding[size], 'relative',
      wrap && 'items-start py-1', error && ['border-error hover:border-error-hover', 'focus-within:border-error focus-within:hover:border-error'], className)}
      style={{ paddingRight: '0.75rem', ...(wrap ? { height: 'auto' } : undefined) }} data-field-mode="edit" data-error={error ? '' : undefined}
      onClick={(e) => { if (e.target === e.currentTarget) { selectRef.current?.showPicker?.(); selectRef.current?.focus() } }}>
      <div ref={tagAreaRef} className={cn('flex-1 min-w-0 flex items-center relative', nakedCellRowModeAlign, wrap ? 'flex-wrap' : 'overflow-visible')} style={{ gap: GAP }}
        onClick={(e) => { if (e.target === e.currentTarget) { selectRef.current?.showPicker?.(); selectRef.current?.focus() } }}>
        <OverflowTagList containerRef={tagAreaRef} items={items} size={size} wrap={wrap}
          renderTag={(item) => (
            <Tag size={size} className="shrink-0 relative z-10" onClick={() => { selectRef.current?.showPicker?.(); selectRef.current?.focus() }}
              onDismiss={() => handleRemove(item.value)}>{item.label}</Tag>
          )} onRemove={handleRemove} trailing={value.length === 0 ? selectDropdown : undefined} />
      </div>
      {value.length > 0 && selectDropdown}
      <ItemSuffix className={cn('relative z-10 pointer-events-none', wrap && 'self-start')}
        style={wrap ? { height: tagHeight } : undefined}>
        {showClear && (
          <span className="pointer-events-auto">
            <ItemInlineAction
              size={size ?? 'md'}
              action={{ icon: X, label: '清除全部', onClick: () => onChange?.([]) }} // i18n-allow: DS default inline-action label
            />
          </span>
        )}
        <ChevronDown size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />
      </ItemSuffix>
    </div>
  )
}

// ── Custom Combobox (desktop — consumes SelectMenu) ───────────────────

function CustomCombobox({
  mode = 'edit', variant: variantProp, error: errorProp = false, size = 'md', options, value = [], onChange, placeholder,
  className, disabled: disabledProp, wrap = false, clearable = false, searchable = false, searchIn = 'menu',
  searchPlaceholder = '搜尋…', // i18n-allow: DS default
  searchAriaLabel = '搜尋選項', // i18n-allow: DS default
  emptyPlaceholder = '選擇…', // i18n-allow: DS default
  defaultOpen = false,
  onOpenChange,
  tagRenderer,
  tagWrapperClassName,
  tagAreaGapPx,
  'aria-label': ariaLabel,
}: ComboboxProps) {
  const tagAreaGap = tagAreaGapPx ?? GAP
  const fieldCtx = useFieldContext()
  const error = errorProp || (fieldCtx?.invalid ?? false)
  const disabled = disabledProp ?? fieldCtx?.disabled
  const resolvedMode = disabled ? 'disabled' : mode
  const variant: FieldVariant = variantProp ?? fieldCtx?.variant ?? 'default'
  const iconSize = getIconSize(size)
  const showClear = clearable && value.length > 0 && resolvedMode === 'edit'
  const [open, setOpen] = React.useState(defaultOpen)
  const [search, setSearch] = React.useState('')
  // a11y: 為 listbox 容器(SelectMenu 內 PopoverContent)建立穩定 id,讓 trigger 的
  // aria-controls 能指向它(WAI-ARIA combobox pattern 要求)。React.useId 在 SSR/CSR 都穩定。
  const listboxId = React.useId()

  React.useEffect(() => { if (!open) setSearch('') }, [open])

  if (resolvedMode !== 'edit') {
    return <ReadonlyMultiSelect mode={resolvedMode} variant={variant} size={size} options={options} value={value} wrap={wrap} className={className} />
  }

  const items = React.useMemo(
    () => value.map(v => ({ value: v, label: options.find(o => o.value === v)?.label ?? v })),
    [value, options]
  )
  const tagAreaRef = React.useRef<HTMLDivElement>(null)
  const tagHeight = size === 'sm' ? 20 : 24

  const handleRemove = (v: string) => onChange?.(value.filter(x => x !== v))

  // searchIn='trigger' 時由 trigger input 過濾，不走 SelectMenu 內建搜尋
  const filteredOptions = React.useMemo(
    () => (searchable && searchIn === 'trigger' && search
      ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
      : options),
    [searchable, searchIn, search, options]
  )

  // 轉換 SelectOption → SelectMenuOption
  const menuOptions: SelectMenuOption[] = React.useMemo(
    () => filteredOptions.map(opt => ({ value: opt.value, label: opt.label })),
    [filteredOptions]
  )

  const chevronEl = <ChevronDown size={iconSize} className={cn('shrink-0 text-fg-muted transition-transform', open && 'rotate-180')} aria-hidden />

  const trigger = (
    <div
      id={fieldCtx?.id}
      role="combobox" aria-expanded={open} aria-controls={listboxId} tabIndex={0}
      aria-label={ariaLabel}
      aria-invalid={error || undefined}
      aria-required={fieldCtx?.required || undefined}
      aria-describedby={fieldCtx?.descriptionId}
      aria-errormessage={error ? fieldCtx?.errorId : undefined}
      className={cn(fieldWrapperStyles({ mode: 'edit', variant: variant, size }), value.length > 0 && tagPadding[size], 'relative cursor-pointer',
        wrap && 'items-start py-1',
        // 2026-05-06 v13.3 SSOT retire:per-control `open && 'border-primary'` 移除。Field default
        // 統一處理 — open=灰深(data-state)/ focus=藍(focus-within !important)。改一處全 control 跟動。
        error && ['border-error hover:border-error-hover', 'focus-within:border-error focus-within:hover:border-error'], className)}
      style={{ paddingRight: '0.75rem', ...(wrap ? { height: 'auto' } : undefined) }}
      data-field-mode="edit" data-error={error ? '' : undefined}>
      <div ref={tagAreaRef} className={cn('flex-1 min-w-0 flex items-center relative', nakedCellRowModeAlign, wrap ? 'flex-wrap' : 'overflow-visible')} style={{ gap: tagAreaGap }}>
        {value.length > 0 ? (
          <OverflowTagList containerRef={tagAreaRef} items={items} size={size} wrap={wrap}
            tagWrapperClassName={tagWrapperClassName}
            gap={tagAreaGap}
            renderTag={(item) => (
              tagRenderer
                ? tagRenderer(item, () => handleRemove(item.value))
                : <Tag size={size} className="shrink-0 relative z-10"
                    onDismiss={() => handleRemove(item.value)}>{item.label}</Tag>
            )}
            onRemove={handleRemove}
            trailing={searchable && searchIn === 'trigger' ? (
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={items.length === 0 ? searchPlaceholder : ''} onClick={(e) => { e.stopPropagation(); setOpen(true) }}
                aria-label={searchAriaLabel}
                className="flex-1 min-w-[60px] bg-transparent outline-none text-body leading-compact relative z-10" />
            ) : undefined} />
        ) : (
          <span className="text-fg-muted">{placeholder ?? emptyPlaceholder}</span>
        )}
      </div>
      <ItemSuffix className={cn('relative z-10 pointer-events-none', wrap && 'self-start')}
        style={wrap ? { height: tagHeight } : undefined}>
        {showClear && (
          <span className="pointer-events-auto">
            <ItemInlineAction
              size={size ?? 'md'}
              action={{
                icon: X,
                label: '清除全部', // i18n-allow: DS default inline-action label
                onClick: (e) => { e?.stopPropagation(); onChange?.([]) },
              }}
            />
          </span>
        )}
        {chevronEl}
      </ItemSuffix>
    </div>
  )

  return (
    <SelectMenu
      options={menuOptions}
      value={value}
      onValueChange={onChange as (value: string | string[]) => void}
      multiple
      searchable={searchable && searchIn === 'menu'}
      size={size}
      open={open}
      onOpenChange={(o) => { setOpen(o); onOpenChange?.(o) }}
      onOpenAutoFocus={searchIn === 'trigger' ? (e) => e.preventDefault() : undefined}
      contentId={listboxId}
    >
      {trigger}
    </SelectMenu>
  )
}

// ── Public component ────────────────────────────────────────────────────────

const Combobox = React.forwardRef<HTMLDivElement, ComboboxProps>(
  (props, _ref) => {
    const isMobile = useIsTouchDevice()
    if (isMobile) return <NativeCombobox {...props} />
    return <CustomCombobox {...props} />
  }
)
Combobox.displayName = 'Combobox'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const comboboxMeta = {
  component: 'Combobox',
  family: 4,
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-disabled', 'bg-transparent'],
    fg: ['text-fg-disabled', 'text-fg-muted'],
    ring: [],
  },
} as const

export { Combobox }

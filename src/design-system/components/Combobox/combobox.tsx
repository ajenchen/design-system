import * as React from 'react'
import { X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'
import { useFieldContext } from '@/design-system/components/Field/field-context'
import { Tag } from '@/design-system/components/Tag/tag'
import { ItemInlineAction } from '@/design-system/patterns/element-anatomy/item-anatomy'
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
      let used = 0, count = 0
      for (let i = 0; i < totalCount; i++) {
        const el = tagEls.current[i]
        if (!el) continue
        const w = el.offsetWidth
        const next = used + (count > 0 ? GAP : 0) + w
        const remaining = totalCount - count - 1
        if (remaining > 0 && next + GAP + overflowW > available && count > 0) break
        if (remaining === 0 && next > available && count > 0) break
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
  }, [containerRef, totalCount, enabled])

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
}

function OverflowTagList({ containerRef, items, size, wrap, renderTag, onRemove, trailing }: OverflowTagListProps) {
  const tagEls = React.useRef<(HTMLDivElement | null)[]>([])
  const overflowEl = React.useRef<HTMLDivElement>(null)
  const { visibleCount, ready } = useOverflowCount(containerRef, tagEls, overflowEl, items.length, !wrap)
  tagEls.current.length = items.length

  if (wrap) return <>{items.map((item, i) => renderTag(item, i))}{trailing}</>

  const overflow = items.length - visibleCount
  const hiddenItems = items.slice(visibleCount)

  return (
    <span className="contents" style={{ opacity: ready ? 1 : 0 }}>
      {items.map((item, i) => (
        <div key={item.value} ref={el => { tagEls.current[i] = el }} className="shrink-0">{renderTag(item, i)}</div>
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

// ── Display (unchanged) ─────────────────────────────────────────────────────

function ComboboxDisplay({
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
  return (
    <div ref={ownRef} className={cn('flex items-center min-w-0', wrap ? 'flex-wrap' : 'overflow-hidden')} style={{ gap: GAP }}>
      {content}
    </div>
  )
}
ComboboxDisplay.displayName = 'ComboboxDisplay'

// ── Types ───────────────────────────────────────────────────────────────────

export interface ComboboxProps {
  mode?: FieldMode
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
}

const getIconSize = (size: string) => size === 'lg' ? 20 : 16

// ── Shared readonly/disabled render ─────────────────────────────────────────

function ReadonlyMultiSelect({
  mode, size, options, value, wrap, className,
}: Pick<ComboboxProps, 'mode' | 'size' | 'options' | 'value' | 'wrap' | 'className'>) {
  const resolvedMode = mode ?? 'readonly'
  const sz = size ?? 'md'
  const containerRef = React.useRef<HTMLDivElement>(null)
  const hasTags = (value?.length ?? 0) > 0

  return (
    <div ref={containerRef}
      className={cn(fieldWrapperStyles({ mode: resolvedMode, size: sz }), hasTags && tagPadding[sz],
        wrap ? 'flex-wrap py-1' : 'overflow-hidden', className)}
      style={{ gap: GAP, ...(wrap ? { height: 'auto' } : undefined) }} data-field-mode={resolvedMode}>
      {hasTags ? (
        <ComboboxDisplay value={value} options={options} tagSize={sz} wrap={wrap}
          containerRef={containerRef} disabled={resolvedMode === 'disabled'} />
      ) : (
        <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
      )}
    </div>
  )
}

// ── Native Combobox (mobile) ────────────────────────────────────────

function NativeCombobox({
  mode = 'edit', error = false, size = 'md', options, value = [], onChange, placeholder,
  className, disabled, wrap = false, clearable = false,
}: ComboboxProps) {
  const resolvedMode = disabled ? 'disabled' : mode
  const iconSize = getIconSize(size)
  const showClear = clearable && value.length > 0 && resolvedMode === 'edit'

  const handleRemove = (v: string) => onChange?.(value.filter(x => x !== v))
  const handleAdd = (v: string) => { if (!value.includes(v)) onChange?.([...value, v]) }

  if (resolvedMode !== 'edit') {
    return <ReadonlyMultiSelect mode={resolvedMode} size={size} options={options} value={value} wrap={wrap} className={className} />
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
    <div className={cn(fieldWrapperStyles({ mode: 'edit', size }), value.length > 0 && tagPadding[size], 'relative',
      wrap && 'items-start py-1', error && ['border-error hover:border-error-hover', 'focus-within:border-error focus-within:hover:border-error'], className)}
      style={{ paddingRight: '0.75rem', ...(wrap ? { height: 'auto' } : undefined) }} data-field-mode="edit" data-error={error ? '' : undefined}
      onClick={(e) => { if (e.target === e.currentTarget) { selectRef.current?.showPicker?.(); selectRef.current?.focus() } }}>
      <div ref={tagAreaRef} className={cn('flex-1 min-w-0 flex items-center relative', wrap ? 'flex-wrap' : 'overflow-hidden')} style={{ gap: GAP }}
        onClick={(e) => { if (e.target === e.currentTarget) { selectRef.current?.showPicker?.(); selectRef.current?.focus() } }}>
        <OverflowTagList containerRef={tagAreaRef} items={items} size={size} wrap={wrap}
          renderTag={(item) => (
            <Tag size={size} className="shrink-0 relative z-10" onClick={() => { selectRef.current?.showPicker?.(); selectRef.current?.focus() }}
              onDismiss={() => handleRemove(item.value)}>{item.label}</Tag>
          )} onRemove={handleRemove} trailing={value.length === 0 ? selectDropdown : undefined} />
      </div>
      {value.length > 0 && selectDropdown}
      <div className={cn('flex items-center gap-2 shrink-0 relative z-10 pointer-events-none', wrap && 'self-start')}
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
      </div>
    </div>
  )
}

// ── Custom Combobox (desktop — consumes SelectMenu) ───────────────────

function CustomCombobox({
  mode = 'edit', error: errorProp = false, size = 'md', options, value = [], onChange, placeholder,
  className, disabled: disabledProp, wrap = false, clearable = false, searchable = false, searchIn = 'menu',
  searchPlaceholder = '搜尋…', // i18n-allow: DS default
  searchAriaLabel = '搜尋選項', // i18n-allow: DS default
  emptyPlaceholder = '選擇…', // i18n-allow: DS default
}: ComboboxProps) {
  const fieldCtx = useFieldContext()
  const error = errorProp || (fieldCtx?.invalid ?? false)
  const disabled = disabledProp ?? fieldCtx?.disabled
  const resolvedMode = disabled ? 'disabled' : mode
  const iconSize = getIconSize(size)
  const showClear = clearable && value.length > 0 && resolvedMode === 'edit'
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  React.useEffect(() => { if (!open) setSearch('') }, [open])

  if (resolvedMode !== 'edit') {
    return <ReadonlyMultiSelect mode={resolvedMode} size={size} options={options} value={value} wrap={wrap} className={className} />
  }

  const items = value.map(v => ({ value: v, label: options.find(o => o.value === v)?.label ?? v }))
  const tagAreaRef = React.useRef<HTMLDivElement>(null)
  const tagHeight = size === 'sm' ? 20 : 24

  const handleRemove = (v: string) => onChange?.(value.filter(x => x !== v))

  // searchIn='trigger' 時由 trigger input 過濾，不走 SelectMenu 內建搜尋
  const filteredOptions = searchable && searchIn === 'trigger' && search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  // 轉換 SelectOption → SelectMenuOption
  const menuOptions: SelectMenuOption[] = React.useMemo(
    () => filteredOptions.map(opt => ({ value: opt.value, label: opt.label })),
    [filteredOptions]
  )

  const chevronEl = <ChevronDown size={iconSize} className={cn('shrink-0 text-fg-muted transition-transform', open && 'rotate-180')} aria-hidden />

  const trigger = (
    <div
      id={fieldCtx?.id}
      role="combobox" aria-expanded={open} tabIndex={0}
      aria-invalid={error || undefined}
      aria-required={fieldCtx?.required || undefined}
      aria-describedby={fieldCtx?.descriptionId}
      aria-errormessage={error ? fieldCtx?.errorId : undefined}
      className={cn(fieldWrapperStyles({ mode: 'edit', size }), value.length > 0 && tagPadding[size], 'relative cursor-pointer',
        wrap && 'items-start py-1',
        open && !error && 'border-primary',
        error && ['border-error hover:border-error-hover', 'focus-within:border-error focus-within:hover:border-error'], className)}
      style={{ paddingRight: '0.75rem', ...(wrap ? { height: 'auto' } : undefined) }}
      data-field-mode="edit" data-error={error ? '' : undefined}>
      <div ref={tagAreaRef} className={cn('flex-1 min-w-0 flex items-center relative', wrap ? 'flex-wrap' : 'overflow-hidden')} style={{ gap: GAP }}>
        {value.length > 0 ? (
          <OverflowTagList containerRef={tagAreaRef} items={items} size={size} wrap={wrap}
            renderTag={(item) => (
              <Tag size={size} className="shrink-0 relative z-10"
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
      <div className={cn('flex items-center gap-2 shrink-0 relative z-10 pointer-events-none', wrap && 'self-start')}
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
      </div>
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
      onOpenChange={setOpen}
      onOpenAutoFocus={searchIn === 'trigger' ? (e) => e.preventDefault() : undefined}
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

export { Combobox, ComboboxDisplay }

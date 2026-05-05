import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'
import { useFieldContext } from '@/design-system/components/Field/field-context'
import { PersonDisplay, MultiPersonDisplay, buildPersonNameCard, resolvePerson, type PersonValue } from './person-display'
import { SelectMenu, type SelectMenuOption } from '@/design-system/components/SelectMenu/select-menu'

// ── Helpers ─────────────────────────────────────────────────────────────────

function personToMenuOption(person: PersonValue): SelectMenuOption {
  const p = resolvePerson(person)
  return {
    value: p.name,
    label: p.name,
    description: p.description,
    // avatar 傳資料,MenuItem 內部用 Avatar 元件渲染。
    // hoverCard 共用 `buildPersonNameCard` helper(避免顯示資訊跟 PersonAvatar 不一致)。
    avatar: {
      src: p.avatarUrl,
      alt: p.name,
      hoverCard: buildPersonNameCard(p),
    },
  }
}

// ── Component ───────────────────────────────────────────────────────────────
// 外觀同 Select，value 前面多 avatar。
// edit mode：Popover + Command 搜尋選人（使用 SelectMenu）。
// readonly / disabled：靜態顯示。

export interface PeoplePickerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /**
   * Field mode(2026-05-05 Phase B3 align):
   *   edit     — Popover + Command 搜尋(預設)
   *   display  — **純展示**:單選 → PersonDisplay(Avatar + NameCard hoverCard);
   *              多選 → MultiPersonDisplay(Avatar stack + OverflowIndicator)。無 input chrome、無互動 Popover。
   *              對齊 Carbon read-only / DataTable person cell read mode。
   *   readonly — input chrome + 鎖互動,Avatar 視覺保留(留 a11y signal「這是 input 但鎖了」)
   *   disabled — input chrome + disabled 降色
   */
  mode?: FieldMode
  /**
   * Visual chrome(2026-05-05 Phase B3)。對齊 FieldContext.variant 透傳。
   * - `'default'` — 完整 Field wrapper chrome(form / Field 內嵌)
   * - `'bare'` — 透明 variant,hover/focus 才現 border(DataTable cell-as-input)
   *
   * mode='display' 時 chrome 無視覺意義(display 完全無 wrapper);chrome 僅作用於 edit / readonly / disabled。
   */
  variant?: FieldVariant
  size?: 'sm' | 'md' | 'lg'
  /** 當前已選的人（單選 PersonValue，多選 PersonValue[]） */
  value?: PersonValue | PersonValue[] | null
  /** 值變更 callback */
  onChange?: (value: PersonValue[]) => void
  /** 可選人員清單（edit mode 下拉顯示） */
  people?: PersonValue[]
  /** 搜尋框 placeholder */
  searchPlaceholder?: string
  /** 空選項提示 */
  emptyText?: string
  className?: string
  disabled?: boolean
  /** Initial open state(uncontrolled)— DataTable cell-as-input 1-step open canonical */
  defaultOpen?: boolean
  /** open state 變更 callback。DataTable cell-as-input 用:open=false → cell exit edit */
  onOpenChange?: (open: boolean) => void
}

const PeoplePicker = React.forwardRef<HTMLDivElement, PeoplePickerProps>(function PeoplePicker({
  mode: modeProp,
  variant: variantProp,
  size = 'md',
  value,
  onChange,
  people = [],
  searchPlaceholder = '搜尋人員…', // i18n-allow: DS default; consumer override via searchPlaceholder prop
  emptyText = '沒有符合的人員', // i18n-allow: DS default; consumer override via emptyText prop
  className,
  disabled,
  defaultOpen = false,
  onOpenChange,
  ...props
}, ref) {
  const fieldCtx = useFieldContext()
  const mode: FieldMode = modeProp ?? fieldCtx?.mode ?? 'edit'
  const resolvedMode: FieldMode = disabled ? 'disabled' : mode
  // chrome resolution:per-prop > context > 'default'
  const resolvedVariant: FieldVariant = variantProp ?? fieldCtx?.variant ?? 'default'
  const isEditable = resolvedMode === 'edit'
  const iconSize = size === 'lg' ? 20 : 16
  const isMulti = Array.isArray(value)
  const isEmpty = !value || (isMulti && value.length === 0)

  // ── mode='display' ──────────────────────────────────────────────────────
  // 純展示:無 fieldWrapperStyles 容器、無 chevron affordance。
  // 直接 reuse 既有 PersonDisplay / MultiPersonDisplay primitive(該 primitive 同時供 NameCard /
  // DataTable / 其他 cross-component 場景使用,不在本 phase retire — 保留 standalone export)。
  if (resolvedMode === 'display') {
    if (isEmpty) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
    return isMulti
      ? <MultiPersonDisplay value={value as PersonValue[]} size={size} />
      : <PersonDisplay value={value as PersonValue} size={size} />
  }

  // ── Readonly / disabled ──
  if (!isEditable) {
    return (
      <div
        ref={ref}
        className={cn(fieldWrapperStyles({ mode: resolvedMode, variant: resolvedVariant, size }), className)}
        data-field-mode={resolvedMode}
        {...props}
      >
        <span className={cn('flex-1 min-w-0 inline-flex items-center', resolvedMode === 'disabled' && 'text-fg-disabled')}>
          {isEmpty
            ? <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
            : isMulti
              ? <MultiPersonDisplay value={value as PersonValue[]} size={size} />
              : <PersonDisplay value={value as PersonValue} size={size} />
          }
        </span>
      </div>
    )
  }

  // ── Build SelectMenu options from people list ──
  const menuOptions: SelectMenuOption[] = React.useMemo(
    () => people.map(personToMenuOption),
    [people]
  )

  // ── Current selected values as string[] ──
  const selectedValues: string[] = React.useMemo(() => {
    if (!value) return []
    if (Array.isArray(value)) return value.map(v => resolvePerson(v).name)
    return [resolvePerson(value).name]
  }, [value])

  const handleValueChange = React.useCallback(
    (newValue: string | string[]) => {
      if (!onChange) return
      const names = Array.isArray(newValue) ? newValue : [newValue]
      // Map back to PersonValue objects from people list
      const result = names.map(name => {
        const found = people.find(p => resolvePerson(p).name === name)
        return found ?? name
      })
      onChange(result)
    },
    [onChange, people]
  )

  // ── Edit mode trigger ──
  // open state:default uncontrolled,但 defaultOpen=true 時取 controlled path 注入 initial true
  // (對齊 Radix Popover defaultOpen canonical;DataTable cell-as-input 1-step open 用)。
  const [open, setOpen] = React.useState(defaultOpen)
  const trigger = (
    <div
      ref={ref}
      role="combobox"
      aria-haspopup="listbox"
      tabIndex={0}
      className={cn(
        fieldWrapperStyles({ mode: 'edit', variant: resolvedVariant, size }),
        // Radix Popover 在 trigger 上寫 data-state="open",用它顯示 focus border
        'cursor-pointer data-[state=open]:border-primary',
        className,
      )}
      data-field-mode="edit"
      {...props}
    >
      <span className="flex-1 min-w-0 inline-flex items-center">
        {isEmpty
          ? <span className="text-fg-muted">選擇...</span>
          : isMulti
            ? <MultiPersonDisplay
                value={value as PersonValue[]}
                size={size}
                onRemove={onChange ? (person) => {
                  const arr = value as PersonValue[]
                  onChange(arr.filter(v => resolvePerson(v).name !== resolvePerson(person).name))
                } : undefined}
              />
            : <PersonDisplay value={value as PersonValue} size={size} />
        }
      </span>
      <ChevronDown
        size={iconSize}
        className="shrink-0 text-fg-muted"
        aria-hidden
      />
    </div>
  )

  return (
    <SelectMenu
      options={menuOptions}
      value={isMulti ? selectedValues : selectedValues[0] ?? null}
      onValueChange={handleValueChange}
      multiple={isMulti}
      searchable
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      size={size}
      open={open}
      onOpenChange={(o) => { setOpen(o); onOpenChange?.(o) }}
    >
      {trigger}
    </SelectMenu>
  )
})
PeoplePicker.displayName = 'PeoplePicker'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const peoplePickerMeta = {
  component: 'PeoplePicker',
  family: 4,
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-fg-disabled', 'text-fg-muted'],
    ring: [],
  },
} as const

export { PeoplePicker }

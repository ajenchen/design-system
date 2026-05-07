import * as React from 'react'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, EMPTY_DISPLAY, nakedCellRowModeAlign } from '@/design-system/components/Field/field-wrapper'
import { useFieldContext } from '@/design-system/components/Field/field-context'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Tag } from '@/design-system/components/Tag/tag'
import { Select, type SelectOption } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'
import { PersonDisplay, MultiPersonDisplay, buildPersonNameCard, resolvePerson, type PersonValue } from './person-display'

// ── PeoplePicker = thin wrapper ─────────────────────────────────────────────
// **2026-05-07 v15.5 SSOT 重構**(Task 2 P2-2):
//   - **single mode** wraps `<Select searchable selectedItemRenderer>`
//   - **multi mode**  wraps `<Combobox searchable tagRenderer>`
// 之前直接 wrap `<SelectMenu>` low-level primitive 跟 Select / Combobox 平行。
// 重構後 PeoplePicker 是 Select/Combobox 的「person-specific」 specialization,
// person-only 邏輯(PersonValue ↔ option mapping、avatar trigger / tag 渲染)集中在
// PeoplePicker,Select/Combobox 的搜尋 / open state / a11y / overflow 全部繼承。

// ── helpers ─────────────────────────────────────────────────────────────────
function personToOption(person: PersonValue): SelectOption {
  const p = resolvePerson(person)
  return { value: p.name, label: p.name }
}
function findPerson(people: PersonValue[], name: string): PersonValue {
  const found = people.find(p => resolvePerson(p).name === name)
  return found ?? name
}
function namesOf(value: PeoplePickerProps['value']): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.map(v => resolvePerson(v).name)
  return [resolvePerson(value).name]
}

// ── Component ───────────────────────────────────────────────────────────────

export interface PeoplePickerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /**
   * Field mode:
   *   edit     — Popover 搜尋(預設)
   *   display  — 純展示(reuse PersonDisplay / MultiPersonDisplay,無 input chrome)
   *   readonly — input chrome + 鎖互動,Avatar 視覺保留
   *   disabled — input chrome + disabled 降色
   */
  mode?: FieldMode
  /** Field chrome variant(對齊 Select / Combobox)*/
  variant?: FieldVariant
  size?: 'sm' | 'md' | 'lg'
  /** 當前已選的人(單選 PersonValue,多選 PersonValue[])*/
  value?: PersonValue | PersonValue[] | null
  /** 值變更 callback(永遠 emit array — single mode 取 [0] 即 single value)*/
  onChange?: (value: PersonValue[]) => void
  /** 可選人員清單(edit mode 下拉顯示)*/
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
  searchPlaceholder = '搜尋人員…', // i18n-allow: DS default
  emptyText = '沒有符合的人員', // i18n-allow: DS default
  className,
  disabled,
  defaultOpen,
  onOpenChange,
  ...props
}, ref) {
  const fieldCtx = useFieldContext()
  const mode: FieldMode = modeProp ?? fieldCtx?.mode ?? 'edit'
  const resolvedMode: FieldMode = disabled ? 'disabled' : mode
  const resolvedVariant: FieldVariant = variantProp ?? fieldCtx?.variant ?? 'default'
  const isMulti = Array.isArray(value)
  const isEmpty = !value || (isMulti && value.length === 0)

  // ── mode='display' ────────────────────────────────────────────────────────
  // 純展示:無 fieldWrapperStyles 容器、無 chevron affordance。
  if (resolvedMode === 'display') {
    if (isEmpty) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
    return isMulti
      ? <MultiPersonDisplay value={value as PersonValue[]} size={size} />
      : <PersonDisplay value={value as PersonValue} size={size} />
  }

  // ── readonly / disabled — 沿用 Field wrapper chrome,但 Avatar 仍渲染 ─────
  if (resolvedMode !== 'edit') {
    return (
      <div
        ref={ref}
        className={cn(fieldWrapperStyles({ mode: resolvedMode, variant: resolvedVariant, size }), className)}
        data-field-mode={resolvedMode}
        {...props}
      >
        <span className={cn('flex-1 min-w-0 inline-flex items-center', nakedCellRowModeAlign, resolvedMode === 'disabled' && 'text-fg-disabled')}>
          {isEmpty
            ? <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
            : isMulti
              ? <MultiPersonDisplay value={value as PersonValue[]} size={size} />
              : <PersonDisplay value={value as PersonValue} size={size} />}
        </span>
      </div>
    )
  }

  // ── edit mode:options + selected mapping(both single + multi 共用)────────
  const options: SelectOption[] = people.map(personToOption)
  const selectedNames = namesOf(value)

  // ── multi mode → wraps Combobox ────────────────────────────────────────────
  if (isMulti) {
    const handleMultiChange = (next: string[]) => {
      onChange?.(next.map(name => findPerson(people, name)))
    }
    return (
      <Combobox
        ref={ref as React.Ref<HTMLDivElement>}
        size={size}
        variant={resolvedVariant}
        options={options}
        value={selectedNames}
        onChange={handleMultiChange}
        searchable
        searchPlaceholder={searchPlaceholder}
        emptyPlaceholder={emptyText}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        className={className}
        aria-label={(props as { 'aria-label'?: string })['aria-label']}
        // 每個 selected pill 換 avatar+name pill(對齊原 PeoplePicker multi visual)
        tagRenderer={(item, onRemove) => {
          const person = findPerson(people, item.value)
          const p = resolvePerson(person)
          return (
            <Tag
              key={item.value}
              size={size}
              className="shrink-0 relative z-10 inline-flex items-center gap-1.5"
              onDismiss={onRemove}
            >
              {/* Avatar size:px,對齊 Tag 內 Avatar 慣用尺寸(sm/md=16, lg=20)*/}
              <Avatar size={size === 'lg' ? 20 : 16} src={p.avatarUrl} alt={p.name} hoverCard={buildPersonNameCard(p)} />
              <span className="truncate">{p.name}</span>
            </Tag>
          )
        }}
      />
    )
  }

  // ── single mode → wraps Select ─────────────────────────────────────────────
  const handleSingleChange = (name: string) => {
    onChange?.([findPerson(people, name)])
  }
  return (
    <Select
      ref={ref as React.Ref<HTMLDivElement>}
      size={size}
      variant={resolvedVariant}
      options={options}
      value={selectedNames[0] ?? null}
      onChange={handleSingleChange}
      searchable
      placeholder={emptyText}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      className={className}
      aria-label={(props as { 'aria-label'?: string })['aria-label']}
      // single trigger 內 selected display 換 PersonDisplay(avatar + name)
      selectedItemRenderer={(selectedOpt) => {
        const person = findPerson(people, selectedOpt.value)
        return <PersonDisplay value={person} size={size} />
      }}
    />
  )
})
PeoplePicker.displayName = 'PeoplePicker'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
export const peoplePickerMeta = {
  component: 'PeoplePicker',
  family: 4,
  variants: {},
  sizes: {},
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-fg-disabled', 'text-fg-muted'],
    ring: [],
  },
} as const

export { PeoplePicker }

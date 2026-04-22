import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'
import { PersonDisplay, MultiPersonDisplay, type PersonValue } from './person-display'
import { SelectMenu, type SelectMenuOption } from '@/design-system/components/SelectMenu/select-menu'
import { NameCard, NameCardDefaultActions } from '@/design-system/components/NameCard/name-card'

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolvePerson(v: PersonValue): { name: string; avatarUrl?: string; description?: string } {
  return typeof v === 'string' ? { name: v } : v
}

function personToMenuOption(person: PersonValue): SelectMenuOption {
  const p = resolvePerson(person)
  return {
    value: p.name,
    label: p.name,
    description: p.description,
    // avatar 傳資料,MenuItem 內部用 Avatar 元件渲染。
    // MenuItem 根據 description 有無自動決定 inline(24) / block(32/40) 尺寸。
    // hoverCard:對齊 `avatar.spec.md`「Menu / Dropdown 的 assignee / owner」canonical —
    // 下拉選單內的 person avatar 也必須 hover → NameCard(含 onViewMore)。
    avatar: {
      src: p.avatarUrl,
      alt: p.name,
      hoverCard: (
        <NameCard
          name={p.name}
          subtitle={p.description}
          avatar={{ src: p.avatarUrl, alt: p.name }}
          actions={<NameCardDefaultActions />}
          onViewMore={() => {}}
        />
      ),
    },
  }
}

// ── Component ───────────────────────────────────────────────────────────────
// 外觀同 Select，value 前面多 avatar。
// edit mode：Popover + Command 搜尋選人（使用 SelectMenu）。
// readonly / disabled：靜態顯示。

export interface PeoplePickerProps {
  mode?: FieldMode
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
}

function PeoplePicker({
  mode = 'edit',
  size = 'md',
  value,
  onChange,
  people = [],
  searchPlaceholder = '搜尋人員…',
  emptyText = '沒有符合的人員',
  className,
  disabled,
}: PeoplePickerProps) {
  const resolvedMode = disabled ? 'disabled' : mode
  const isEditable = resolvedMode === 'edit'
  const iconSize = size === 'lg' ? 20 : 16
  const isMulti = Array.isArray(value)
  const isEmpty = !value || (isMulti && value.length === 0)

  // ── Readonly / disabled ──
  if (!isEditable) {
    return (
      <div
        className={cn(fieldWrapperStyles({ mode: resolvedMode, size }), className)}
        data-field-mode={resolvedMode}
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
  // 不自己管 open state——讓 SelectMenu 內部的 Popover 管理
  // (controlled open 容易跟 Radix Popover 衝突)
  const trigger = (
    <div
      role="combobox"
      aria-haspopup="listbox"
      tabIndex={0}
      className={cn(
        fieldWrapperStyles({ mode: 'edit', size }),
        // Radix Popover 在 trigger 上寫 data-state="open",用它顯示 focus border
        'cursor-pointer data-[state=open]:border-primary',
        className,
      )}
      data-field-mode="edit"
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
    >
      {trigger}
    </SelectMenu>
  )
}
PeoplePicker.displayName = 'PeoplePicker'

export { PeoplePicker }

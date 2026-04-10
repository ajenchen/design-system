import * as React from 'react'
import { Plus, Search, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/design-system/components/Popover/popover'
import { Command, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from '@/design-system/components/Command/command'
import { Command as CommandPrimitive } from 'cmdk'
import { SelectMenuItem, SelectMenuGroup, SelectMenuFooter } from './select-menu-item'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'

/**
 * SelectMenu — Popover + Command 組成的完整下拉選單
 *
 * ── 功能 ──
 *   單選 / 多選、搜尋過濾、分組、可建立新選項（creatable）
 *   多選有 footer「全部」checkbox
 *
 * ── 架構 ──
 *   Popover（浮動容器）
 *     └── Command（cmdk，搜尋 + 鍵盤導覽）
 *           ├── CommandInput（搜尋框）
 *           ├── CommandList（選項列表）
 *           │     └── CommandGroup → SelectMenuItem
 *           └── Footer（多選全選）
 */

// ── Types ──

export interface SelectMenuOption {
  value: string
  label: string
  description?: string
  icon?: LucideIcon
  avatar?: React.ReactNode
  disabled?: boolean
  group?: string
}

export interface SelectMenuGroupConfig {
  key: string
  label: string
}

type SizeKey = 'sm' | 'md' | 'lg'

// ── Shared sizes ──
const CHECKBOX_SIZE: Record<SizeKey, 'sm' | 'md' | 'lg'> = { sm: 'sm', md: 'md', lg: 'lg' }

// ── Component ──

export interface SelectMenuProps {
  /** 選項列表 */
  options: SelectMenuOption[]
  /** 群組定義（key 對應 option.group） */
  groups?: SelectMenuGroupConfig[]

  /** 當前值（單選 string，多選 string[]） */
  value?: string | string[] | null
  /** 值變更 callback */
  onValueChange?: (value: string | string[]) => void

  /** 多選模式 */
  multiple?: boolean
  /** 顯示搜尋框 */
  searchable?: boolean
  /** 可建立新選項 */
  creatable?: boolean
  /** 建立新選項 callback */
  onCreate?: (value: string) => void
  /** creatable 的 label 格式，預設 '直接使用「{query}」' */
  createLabel?: (query: string) => string

  /** 觸發元件（asChild） */
  children: React.ReactNode
  /** 搜尋框 placeholder */
  searchPlaceholder?: string
  /** 空選項提示 */
  emptyText?: string

  /** 尺寸 */
  size?: SizeKey
  /** 對齊方式 */
  align?: 'start' | 'end'
  /** 最小寬度（px），預設跟隨觸發元件 */
  minWidth?: number

  /** 受控 open 狀態 */
  open?: boolean
  /** open 狀態變更 callback */
  onOpenChange?: (open: boolean) => void

  className?: string
}

export function SelectMenu({
  options,
  groups,
  value,
  onValueChange,
  multiple = false,
  searchable = false,
  creatable = false,
  onCreate,
  createLabel = (q) => `直接使用「${q}」`,
  children,
  searchPlaceholder = '搜尋…',
  emptyText = '沒有符合的選項',
  size = 'md',
  align = 'start',
  minWidth,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  className,
}: SelectMenuProps) {
  // ── State ──
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen
  const [search, setSearch] = React.useState('')

  // ── Value helpers ──
  const selectedValues = React.useMemo<string[]>(() => {
    if (value == null) return []
    return Array.isArray(value) ? value : [value]
  }, [value])

  const isSelected = React.useCallback(
    (v: string) => selectedValues.includes(v),
    [selectedValues]
  )

  const handleSelect = React.useCallback(
    (optionValue: string) => {
      if (multiple) {
        const next = isSelected(optionValue)
          ? selectedValues.filter((v) => v !== optionValue)
          : [...selectedValues, optionValue]
        onValueChange?.(next)
      } else {
        onValueChange?.(optionValue)
        setOpen(false)
      }
    },
    [multiple, selectedValues, isSelected, onValueChange, setOpen]
  )

  // ── Multi-select: select all ──
  const selectableOptions = React.useMemo(
    () => options.filter((o) => !o.disabled),
    [options]
  )

  const allState: boolean | 'indeterminate' = React.useMemo(() => {
    if (!multiple) return false
    const count = selectableOptions.filter((o) => isSelected(o.value)).length
    if (count === 0) return false
    if (count === selectableOptions.length) return true
    return 'indeterminate'
  }, [multiple, selectableOptions, isSelected])

  const handleSelectAll = React.useCallback(() => {
    if (!multiple) return
    if (allState === true) {
      onValueChange?.([])
    } else {
      onValueChange?.(selectableOptions.map((o) => o.value))
    }
  }, [multiple, allState, selectableOptions, onValueChange])

  // ── Creatable ──
  const showCreate = React.useMemo(() => {
    if (!creatable || !search.trim()) return false
    return !options.some(
      (o) => o.label.toLowerCase() === search.trim().toLowerCase()
    )
  }, [creatable, search, options])

  // ── Grouping ──
  const groupedOptions = React.useMemo(() => {
    if (!groups?.length) return [{ key: '__default', label: '', options }]
    const grouped = groups.map((g) => ({
      ...g,
      options: options.filter((o) => o.group === g.key),
    }))
    const ungrouped = options.filter((o) => !o.group)
    if (ungrouped.length) {
      grouped.unshift({ key: '__default', label: '', options: ungrouped })
    }
    return grouped
  }, [groups, options])

  // ── Reset search on close ──
  React.useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className={cn(
          'p-0 rounded-lg border border-border bg-surface-raised overflow-hidden',
          className
        )}
        style={{
          boxShadow: 'var(--elevation-200)',
          minWidth: minWidth ?? 'var(--radix-popover-trigger-width)',
        }}
        align={align}
        sideOffset={8}
      >
        <Command shouldFilter={searchable} className="bg-transparent">
          {searchable && (
            <div className={cn(
              'flex items-center gap-2 px-3 py-1 border-b border-divider',
              size === 'lg' ? 'min-h-[calc(var(--field-height-lg)+8px)]'
                : size === 'sm' ? 'min-h-[calc(var(--field-height-sm)+8px)]'
                : 'min-h-[calc(var(--field-height-md)+8px)]',
            )}>
              <Search size={size === 'lg' ? 20 : 16} className="shrink-0 text-fg-muted" aria-hidden />
              <CommandPrimitive.Input
                placeholder={searchPlaceholder}
                value={search}
                onValueChange={setSearch}
                className={cn(
                  'flex w-full bg-transparent outline-none placeholder:text-fg-muted',
                  size === 'lg' ? 'text-body-lg leading-compact' : 'text-body leading-compact',
                )}
              />
            </div>
          )}
          {/* min-height = 3 個 item 高度,確保空狀態跟有選項時視覺一致 */}
          <CommandList className={cn(
            'relative',
            size === 'sm' && 'min-h-[calc(var(--field-height-sm)*3+16px)]',
            size === 'lg' && 'min-h-[calc(var(--field-height-lg)*3+16px)]',
            (!size || size === 'md') && 'min-h-[calc(var(--field-height-md)*3+16px)]',
          )}>
            {/* 空狀態:absolute 填滿 CommandList,文案垂直 + 水平居中 */}
            <CommandEmpty className={cn(
              'absolute inset-0 flex items-center justify-center leading-compact text-fg-muted',
              size === 'lg' ? 'text-body-lg' : 'text-body',
            )}>
              {emptyText}
            </CommandEmpty>

            {groupedOptions.map((group, gi) => (
              <React.Fragment key={group.key}>
                {gi > 0 && <CommandSeparator />}
                <CommandGroup className="p-0 py-2">
                  {group.label && (
                    <SelectMenuItem size={size} header>{group.label}</SelectMenuItem>
                  )}
                  {group.options.map((opt) => (
                    <CommandItem
                      key={opt.value}
                      value={opt.label}
                      keywords={opt.description ? [opt.description] : undefined}
                      disabled={opt.disabled}
                      onSelect={() => handleSelect(opt.value)}
                      className="p-0 rounded-none data-[selected=true]:bg-transparent"
                    >
                      <SelectMenuItem
                        size={size}
                        startIcon={opt.icon}
                        avatar={opt.avatar}
                        description={opt.description}
                        checkbox={multiple}
                        checked={isSelected(opt.value)}
                        selected={!multiple && isSelected(opt.value)}
                        disabled={opt.disabled}
                      >
                        {opt.label}
                      </SelectMenuItem>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </React.Fragment>
            ))}

            {/* Creatable item */}
            {showCreate && (
              <>
                <CommandSeparator />
                <CommandGroup className="p-0 py-2">
                  <CommandItem
                    value={search}
                    onSelect={() => {
                      onCreate?.(search.trim())
                      setSearch('')
                    }}
                    className="p-0 rounded-none data-[selected=true]:bg-transparent"
                  >
                    <SelectMenuItem size={size} startIcon={Plus}>
                      {createLabel(search.trim())}
                    </SelectMenuItem>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>

          {/* Multi-select footer: Select All
              - 沒有選項時不顯示(selectableOptions.length === 0)
              - 搜尋有文字時不顯示(search 非空 = 使用者在找特定項目,「全選」沒意義) */}
          {multiple && selectableOptions.length > 0 && !search && (
            <SelectMenuFooter>
              <SelectMenuItem
                size={size}
                checkbox
                checked={allState}
                onClick={handleSelectAll}
              >
                全部
              </SelectMenuItem>
            </SelectMenuFooter>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}

SelectMenu.displayName = 'SelectMenu'

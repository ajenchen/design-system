import * as React from 'react'
import { Plus, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AvatarData } from '@/design-system/components/Avatar/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/design-system/components/Popover/popover'
import { Command, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from '@/design-system/components/Command/command'
import { Command as CommandPrimitive } from 'cmdk'
import { MenuItem, MenuFooter } from '@/design-system/components/Menu/menu-item'
import { Empty } from '@/design-system/components/Empty/empty'
import { OVERLAY_SIDE_OFFSET } from '@/design-system/tokens/elevation/overlay-geometry'
import { getMenuListMinHeight } from '@/design-system/components/Field/field-types'
import { RowSizeProvider } from '@/design-system/patterns/element-anatomy/item-anatomy'

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
 *           │     └── CommandGroup → MenuItem
 *           └── Footer（多選全選）
 */

// ── Types ──

export interface SelectMenuOption {
  value: string
  label: string
  description?: string
  icon?: LucideIcon
  avatar?: AvatarData
  disabled?: boolean
  group?: string
}

export interface SelectMenuGroupConfig {
  key: string
  label: string
}

type SizeKey = 'sm' | 'md' | 'lg'

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
  /** 列表最少顯示幾行選項高度（預設 3），影響空狀態最小高度 */
  minRows?: number
  /** 最小寬度（px），預設跟隨觸發元件 */
  minWidth?: number

  /** 受控 open 狀態 */
  open?: boolean
  /** open 狀態變更 callback */
  onOpenChange?: (open: boolean) => void

  /** 自訂選項 label 渲染（預設渲染 option.label 純文字） */
  renderLabel?: (option: SelectMenuOption) => React.ReactNode
  /** 攔截 PopoverContent 的 onOpenAutoFocus（如 Select searchable 需阻止 focus 搶走） */
  onOpenAutoFocus?: (e: Event) => void

  /**
   * Popover 內容容器的 DOM id。Combobox / 自定 trigger 用 `aria-controls` 指向此 id 時,
   * 需傳入相同 id 讓 AT 能找到對應的 listbox。
   */
  contentId?: string

  className?: string
}

// shadcn canonical:forwardRef + displayName 統一。SelectMenu 是 Popover + Command
// composite,自身無 DOM host(trigger 由 consumer 以 asChild children 提供),ref 簽名
// 保留但不附著(consumer 想取 trigger DOM 直接在 children 上自己 ref)。className 合併到
// PopoverContent(contextually 最接近 user-facing surface)。
const SelectMenu = React.forwardRef<HTMLElement, SelectMenuProps>(function SelectMenu({
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
  searchPlaceholder = '搜尋…', // i18n-allow: DS default; consumer override via searchPlaceholder prop
  emptyText = '沒有符合的選項', // i18n-allow: DS default; consumer override via emptyText prop
  size = 'md',
  align = 'start',
  minRows = 3,
  minWidth,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  renderLabel,
  onOpenAutoFocus,
  contentId,
  className,
}, _ref) {
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

  // RowSizeProvider 讓 PopoverContent 子樹內任何 <ItemIcon> / <ItemAvatar> /
  // <ItemInlineAction> 都自動讀到對的 size,跟 SidebarProvider / TreeView 同一條規則。
  // (注:Popover 透過 Portal 渲染,context 仍然會跨 portal 傳遞——React context 是 tree-based
  // 不是 DOM-based,Portal 不影響 context propagation)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <RowSizeProvider value={size}>
      <PopoverContent
        id={contentId}
        // w-auto override PopoverContent default w-72(rich-popover canonical)— SelectMenu 走「跟 trigger 同寬」
        // canonical(spec L72)。minWidth = max(trigger-width, 240px sensible-min)— 對齊 shadcn / Material / Ant
        // select dropdown 共識(2026-05-04 D1 verify SelectMenu spec implementation)。
        className={cn(
          'p-0 w-auto rounded-lg border border-border bg-surface-raised overflow-hidden',
          className
        )}
        style={{
          boxShadow: 'var(--elevation-200)',
          minWidth: minWidth ?? 'max(var(--radix-popover-trigger-width), 15rem)',
        }}
        align={align}
        sideOffset={OVERLAY_SIDE_OFFSET}
        onOpenAutoFocus={onOpenAutoFocus}
        // **2026-05-07 v15.16 nested portal fix**:Tag dismiss inside trigger
        // 區的 OverflowIndicator HoverCard popup(獨立 Radix portal,DOM 不在
        // PopoverContent 內)— Radix DismissableLayer document-level outside
        // detection 跨 portal 視為「outside」→ SelectMenu 被誤關閉。
        // 攔 `onPointerDownOutside`,檢查 click target 是否在另一個 Radix portal
        // 內,是 → preventDefault 取消 close。對齊 Ant Design Select multiSelect
        // tagRender 行為(連續移除不關 dropdown)。
        // SSOT propagation:fix 在 SelectMenu level → Combobox / 其他 SelectMenu
        // consumer 自動受益。
        // **2026-05-07 v15.16 nested portal fix**:Tag dismiss inside trigger 區的
        // OverflowIndicator HoverCard popup(獨立 Radix portal,DOM 不在 SelectMenu
        // PopoverContent 內)— Radix DismissableLayer document-level pointerdown +
        // focusin 偵測「outside」→ SelectMenu 被誤關閉。
        // 攔 `onInteractOutside`(統一 pointerdown + focusin),檢查 click target 是否
        // 在另一個 Radix portal wrapper(`[data-radix-popper-content-wrapper]`),
        // 是 → preventDefault 取消 close。對齊 Ant Design Select multiSelect tagRender
        // 行為(連續移除不關 dropdown)。
        // SSOT propagation:fix 在 SelectMenu level → Combobox / 所有 SelectMenu
        // consumer 自動受益。
        onInteractOutside={(e) => {
          const target = e.detail.originalEvent.target as HTMLElement | null
          if (target?.closest('[data-radix-popper-content-wrapper]')) {
            e.preventDefault()
          }
        }}
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
                  // M24 disabled state precedence:disabled 時 placeholder 切 fg-disabled(audit dim 34)
                  'disabled:placeholder:text-fg-disabled disabled:text-fg-disabled disabled:cursor-not-allowed',
                  size === 'lg' ? 'text-body-lg leading-compact' : 'text-body leading-compact',
                )}
              />
            </div>
          )}
          {/* **2026-05-07 v15.13 R2 fix**:minHeight 從 CommandList 搬到 CommandEmpty。
              原本 CommandList 永遠套 `minHeight = field-height × minRows + 16px`,結果
              user 過濾出 < minRows 個 match 時 list 底下空一片(eg. 打 'c' 出 2 個 match
              卻撐高到 3 row 容量,1 row 留白)。 Fix:只有 empty state 才需要 minHeight 撐
              起 placeholder 視覺;有 results 時 CommandList 自然 fit content。 */}
          <CommandList className="relative">
            <CommandEmpty
              className="flex items-center justify-center"
              style={{ minHeight: getMenuListMinHeight(size, minRows) }}
            >
              <Empty description={emptyText} className="py-6" />
            </CommandEmpty>

            {groupedOptions.map((group, gi) => (
              <React.Fragment key={group.key}>
                {gi > 0 && <CommandSeparator />}
                <CommandGroup className="p-0 py-2">
                  {group.label && (
                    <MenuItem size={size} header>{group.label}</MenuItem>
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
                      <MenuItem
                        size={size}
                        startIcon={opt.icon}
                        avatar={opt.avatar}
                        description={opt.description}
                        checkbox={multiple}
                        checked={isSelected(opt.value)}
                        selected={!multiple && isSelected(opt.value)}
                        disabled={opt.disabled}
                      >
                        {renderLabel ? renderLabel(opt) : opt.label}
                      </MenuItem>
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
                    <MenuItem size={size} startIcon={Plus}>
                      {createLabel(search.trim())}
                    </MenuItem>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>

          {/* Multi-select footer: Select All
              - 沒有選項時不顯示(selectableOptions.length === 0)
              - 搜尋有文字時不顯示(search 非空 = 使用者在找特定項目,「全選」沒意義) */}
          {multiple && selectableOptions.length > 0 && !search && (
            <MenuFooter>
              <MenuItem
                size={size}
                checkbox
                checked={allState}
                onClick={handleSelectAll}
              >
                全部
              </MenuItem>
            </MenuFooter>
          )}
        </Command>
      </PopoverContent>
      </RowSizeProvider>
    </Popover>
  )
})

SelectMenu.displayName = 'SelectMenu'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const selectMenuMeta = {
  component: 'SelectMenu',
  family: 4,
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-surface-raised', 'bg-transparent'],
    fg: ['text-fg-muted'],
    ring: [],
  },
} as const

export { SelectMenu }

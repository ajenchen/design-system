import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { ChevronRight, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { SelectMenuItem } from "@/design-system/components/SelectMenu/select-menu-item"

/**
 * DropdownMenu — Radix DropdownMenu + SelectMenuItem visual layer
 *
 * 架構分工：
 * - Radix primitives：behavior（keyboard nav, focus management, aria roles）
 * - SelectMenuItem：visual（layout, padding, icon alignment, typography）
 *
 * Radix primitive 是外層容器，控制 focus:bg-neutral-hover。
 * SelectMenuItem 內層只負責佈局，不加互動樣式。
 */

// ── Floating layer 共用樣式 ──
const floatingLayerClass = [
  'z-50 overflow-hidden rounded-lg border border-border bg-surface-raised',
  'data-[state=open]:animate-in data-[state=closed]:animate-out',
  'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
  'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
  'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
  'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
  'origin-[--radix-dropdown-menu-content-transform-origin]',
].join(' ')

// ── Size context ──
type SizeKey = 'sm' | 'md' | 'lg'
const SizeContext = React.createContext<SizeKey>('md')
const ICON_SIZE: Record<SizeKey, number> = { sm: 16, md: 16, lg: 20 }

// ── Shared item classes on Radix primitive ──
const radixItemClass = [
  'relative cursor-pointer select-none outline-none',
  'transition-colors duration-150',
  'focus:bg-neutral-hover',
  'data-[disabled]:pointer-events-none data-[disabled]:text-fg-disabled data-[disabled]:cursor-default',
].join(' ')

// ── Root ──
const DropdownMenu = DropdownMenuPrimitive.Root
const DropdownMenuTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Trigger
    ref={ref}
    className={cn('outline-none', className)}
    {...props}
  />
))
DropdownMenuTrigger.displayName = DropdownMenuPrimitive.Trigger.displayName
const DropdownMenuGroup = DropdownMenuPrimitive.Group
const DropdownMenuPortal = DropdownMenuPrimitive.Portal
const DropdownMenuSub = DropdownMenuPrimitive.Sub
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

// ── Content ──
interface DropdownMenuContentProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> {
  size?: SizeKey
  /** 最小寬度（px），預設跟隨觸發元件寬度 */
  minWidth?: number
  /** 最大高度（px），超過時捲動 */
  maxHeight?: number
}

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  DropdownMenuContentProps
>(({ className, size = 'md', sideOffset = 8, align = 'start', minWidth, maxHeight, children, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      onCloseAutoFocus={(e) => e.preventDefault()}
      className={cn(floatingLayerClass, 'py-2', maxHeight && 'overflow-y-auto', className)}
      style={{
        boxShadow: 'var(--elevation-200)',
        minWidth: minWidth ?? 'max(180px, var(--radix-dropdown-menu-trigger-width))',
        maxHeight,
      }}
      {...props}
    >
      <SizeContext.Provider value={size}>
        {children}
      </SizeContext.Provider>
    </DropdownMenuPrimitive.Content>
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

// ── SubContent ──
const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, children, ...props }, ref) => {
  const size = React.useContext(SizeContext)
  return (
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      sideOffset={8}
      className={cn(floatingLayerClass, 'py-2', className)}
      style={{ boxShadow: 'var(--elevation-200)', minWidth: 180 }}
      {...props}
    >
      <SizeContext.Provider value={size}>
        {children}
      </SizeContext.Provider>
    </DropdownMenuPrimitive.SubContent>
  )
})
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName

// ── Helper: build endContent from badge + endIcon + shortcut ──
function buildEndContent(
  size: SizeKey,
  badge?: React.ReactNode,
  endIcon?: LucideIcon,
  shortcut?: string,
): React.ReactNode | undefined {
  const EndIcon = endIcon
  if (!badge && !EndIcon && !shortcut) return undefined
  const iconPx = ICON_SIZE[size]
  return (
    <>
      {badge}
      {EndIcon && <EndIcon size={iconPx} className="text-fg-muted" aria-hidden />}
      {shortcut && <span className="text-caption text-fg-muted">{shortcut}</span>}
    </>
  )
}

// ── Item ──
interface DropdownMenuItemProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>, 'children'> {
  children: React.ReactNode
  /** 左側 icon */
  startIcon?: LucideIcon
  /** 左側頭像/視覺元素（ReactNode），與 startIcon 互斥 */
  avatar?: React.ReactNode
  /** 次要說明文字 */
  description?: React.ReactNode
  /** 後綴 Tag（ReactNode） */
  tag?: React.ReactNode
  /** 後綴 Badge（ReactNode） */
  badge?: React.ReactNode
  /** 後綴指示型 icon（LucideIcon），fg-muted */
  endIcon?: LucideIcon
  /** 鍵盤快捷鍵 */
  shortcut?: string
  /** 單選選中（bg-neutral-active） */
  selected?: boolean
}

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  DropdownMenuItemProps
>(({ className, children, startIcon, avatar, description, tag, badge, endIcon, shortcut, selected, disabled, ...props }, ref) => {
  const size = React.useContext(SizeContext)
  const endContent = buildEndContent(size, badge, endIcon, shortcut)

  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      disabled={disabled}
      className={cn(
        radixItemClass,
        selected && 'bg-neutral-active',
        className,
      )}
      {...props}
    >
      <SelectMenuItem
        size={size}
        startIcon={startIcon}
        avatar={avatar}
        description={description}
        tag={tag}
        endContent={endContent}
        disabled={disabled}
        // Pure visual — Radix parent handles role/aria/interaction
        role="presentation"
        className="!bg-transparent hover:!bg-transparent pointer-events-none"
      >
        {children}
      </SelectMenuItem>
    </DropdownMenuPrimitive.Item>
  )
})
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

// ── SubTrigger（子選單觸發器，自動附加 ChevronRight）──
interface DropdownMenuSubTriggerProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>, 'children'> {
  children: React.ReactNode
  /** 左側 icon */
  startIcon?: LucideIcon
  /** 子選單目前狀態值文字（如 "深色"） */
  value?: string
  /** 子選單狀態 badge */
  badge?: React.ReactNode
}

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  DropdownMenuSubTriggerProps
>(({ className, children, startIcon, value, badge, ...props }, ref) => {
  const size = React.useContext(SizeContext)
  const iconPx = ICON_SIZE[size]

  // SubTrigger suffix: [value?] [badge?] [ChevronRight] with gap-1
  const endContent = (
    <div className="flex items-center gap-1">
      {value && <span className="text-fg-muted">{value}</span>}
      {badge}
      <ChevronRight size={iconPx} className="text-fg-muted" />
    </div>
  )

  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(
        radixItemClass,
        'data-[state=open]:bg-neutral-hover',
        className,
      )}
      {...props}
    >
      <SelectMenuItem
        size={size}
        startIcon={startIcon}
        endContent={endContent}
        role="presentation"
        className="!bg-transparent hover:!bg-transparent pointer-events-none"
      >
        {children}
      </SelectMenuItem>
    </DropdownMenuPrimitive.SubTrigger>
  )
})
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName

// ── CheckboxItem ──
interface DropdownMenuCheckboxItemProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>, 'children'> {
  children: React.ReactNode
  /** 左側 icon */
  startIcon?: LucideIcon
  /** 次要說明文字 */
  description?: React.ReactNode
}

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  DropdownMenuCheckboxItemProps
>(({ className, children, startIcon, description, checked, disabled, ...props }, ref) => {
  const size = React.useContext(SizeContext)

  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      checked={checked}
      disabled={disabled}
      onSelect={(e) => e.preventDefault()}
      className={cn(radixItemClass, className)}
      {...props}
    >
      <SelectMenuItem
        size={size}
        checkbox
        checked={!!checked}
        startIcon={startIcon}
        description={description}
        disabled={disabled}
        role="presentation"
        className="!bg-transparent hover:!bg-transparent pointer-events-none"
      >
        {children}
      </SelectMenuItem>
    </DropdownMenuPrimitive.CheckboxItem>
  )
})
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName

// ── Label（群組標題）──
const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, children, ...props }, ref) => {
  const size = React.useContext(SizeContext)
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn('outline-none', className)}
      {...props}
    >
      <SelectMenuItem
        size={size}
        header
        role="presentation"
        className="pointer-events-none"
      >
        {children}
      </SelectMenuItem>
    </DropdownMenuPrimitive.Label>
  )
})
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

// ── Separator ──
const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("my-2 h-px bg-divider", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
  floatingLayerClass,
  SizeContext,
}
export type { SizeKey, DropdownMenuItemProps }

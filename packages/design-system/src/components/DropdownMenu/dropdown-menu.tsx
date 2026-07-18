import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { ChevronRight, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { AvatarData } from "@/design-system/components/Avatar/avatar"
import { MenuItem } from "@/design-system/components/Menu/menu-item"
import { ScrollArea } from "@/design-system/components/ScrollArea/scroll-area"
import { OVERLAY_SIDE_OFFSET, OVERLAY_COLLISION_PADDING } from "@/design-system/tokens/elevation/overlay-geometry"
import {
  RowSizeProvider,
  useRowSize,
  ICON_SIZE as ROW_ICON_SIZE,
  type RowSize,
} from "@/design-system/patterns/element-anatomy/item-anatomy"
import { overlayMotion } from "@/design-system/tokens/motion/overlay-motion"

/**
 * DropdownMenu — Radix DropdownMenu + MenuItem visual layer
 *
 * 架構分工：
 * - Radix primitives：behavior（keyboard nav, focus management, aria roles）
 * - MenuItem：visual（layout, padding, icon alignment, typography）
 *
 * Radix primitive 是外層容器,控制 `data-[highlighted]:bg-neutral-hover`。
 * MenuItem 內層只負責佈局,不加互動樣式。
 *
 * ── Hover / highlight canonical(2026-04-22 修正)──
 * 用 Radix 官方的 `data-[highlighted]` attribute,**不用 `:focus-visible` / `:hover` /
 * `:focus`**:
 *   - Radix 在 **mouse hover、keyboard arrow nav、focus move in** 時自動 set `data-highlighted`
 *   - mouse leave / focus move out / menu close 時自動清掉
 *   - 不會在 click 後留殘影(Radix 內部已處理)
 *   - 跨瀏覽器一致(不依賴 `:focus-visible` 的 heuristic)
 *
 * 曾經用過 `focus-visible:bg-neutral-hover` 的理由:避免 click 後殘影。但實測:mouse hover
 * 觸發 Radix 程式化 `.focus()`,Chromium / Safari / Firefox 對 programmatic focus 是否 fire
 * `:focus-visible` 行為不一致,導致 mouse hover 有時無 bg。改用 `data-[highlighted]:` 後行為
 * 一致 —— 世界級 canonical(shadcn / Radix docs / Ariakit 皆此)。
 */

// ── Floating layer 共用樣式 ──
/** @internal — menu 形浮層共用 class(DropdownMenu/SelectMenu/Command 內部);consumer 不 hand-craft menu surface,用元件本身。root barrel 排除(subpath 仍可 wrap 後用)。 */
const floatingLayerClass = [
  'z-50 overflow-hidden rounded-lg border border-border bg-surface-raised',
  overlayMotion,
  'data-[state=open]:animate-in data-[state=closed]:animate-out',
  'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
  'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
  'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
  'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
  'origin-[var(--radix-dropdown-menu-content-transform-origin)]',
].join(' ')

// ── Size:統一用 RowSizeContext(item-layout module),消除本地 SizeContext 漂移 ──
type SizeKey = RowSize
// Re-export for backward compat(內部命名)
const ICON_SIZE = ROW_ICON_SIZE

// ── Shared item classes on Radix primitive ──
// Highlight(hover + keyboard nav): 用 Radix `data-[highlighted]` canonical(見 docblock)
const radixItemClass = [
  'relative cursor-pointer select-none outline-none',
  'transition-colors duration-150',
  'data-[highlighted]:bg-neutral-hover',
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
    // 2026-07-05:非 asChild 裸用需可見 focus 指示(WCAG 2.4.7)——原 `outline-none` 讓裸 Trigger
    // 完全無 focus ring。消費 Button focus canonical(button.tsx buttonVariants base)。
    // asChild+Button 場景同名 class 重複,無影響。
    className={cn(
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      className,
    )}
    {...props}
  />
))
DropdownMenuTrigger.displayName = DropdownMenuPrimitive.Trigger.displayName
// DropdownMenuGroup — 對齊 MenuGroup 的 group separation 設計語言
//
// 設計語言(跨 Menu-like 元件統一,SSOT 見 item-anatomy.spec.md
// 「Group auto-separation」):
//   每個 group 上下各 8px padding,相鄰 group 之間用 border-divider 分隔
//   兩個 group 之間視覺 gap = 8px(上一個 bottom)+ 8px(下一個 top)= 16px + border
//
// MenuGroup(menu-item.tsx)實作:`py-2 [&+&]:border-t [&+&]:border-divider`
//   (在 Command.List 下提供 Content 邊界 8px + group 間 16px gap)
//
// DropdownMenuGroup(本元件)實作:`[&+&]:mt-2 [&+&]:pt-2 [&+&]:border-t
// [&+&]:border-divider`(因為 DropdownMenuContent 已有 py-2 提供 Content 邊界
// 的 8px,只需在第二個起的 group 加 8+8 = 16px gap + border)
//
// **視覺結果等同**:兩種實作的 visual output 一致,只是「padding 住在哪層」
// 不同。不強制統一 CSS 表達式——DropdownMenuContent 的 py-2 是純視覺 Content
// 邊界 padding(Radix roving focus 依 collection refs + element.focus(),不讀
// CSS padding;對齊 spec.md「為什麼不直接套 py-2」段)。Group 若再套 py-2 會
// double padding,故 Group 用 mt-2/pt-2 只加在第二個起。
const DropdownMenuGroup = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Group>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Group
    ref={ref}
    className={cn('[&+&]:border-t [&+&]:border-divider [&+&]:mt-2 [&+&]:pt-2', className)}
    {...props}
  />
))
DropdownMenuGroup.displayName = 'DropdownMenuGroup'

const DropdownMenuPortal = DropdownMenuPrimitive.Portal
const DropdownMenuSub = DropdownMenuPrimitive.Sub
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

// ── Content ──
interface DropdownMenuContentProps
  // asChild Omit(2026-07-18 決策2):Content 恆注入固定 <RowSizeProvider> + <ScrollArea>
  // wrapper 於 Portal 內 → <Content asChild> 會把 Content props slot-merge 到非-DOM Provider 上而壞。
  // children 保留(合法渲染於固定 wrapper 內)。
  extends Omit<React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>, 'asChild'> {
  size?: SizeKey
  /** 最小寬度（px），預設 `max(180px, 觸發元件寬度)`——窄 trigger 時吃 180px 地板 */
  minWidth?: number
  /**
   * 最大高度（px）——**可選更低上限**。預設已 viewport-adaptive(夾到 trigger→視窗碰撞邊界的剩餘高度、
   * 離窗 ≥8px、超過即捲動);傳 `maxHeight` 只在「想比視窗剩餘更矮」時用(取 `min(視窗剩餘, maxHeight)`)。
   */
  maxHeight?: number
}

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  DropdownMenuContentProps
>(({ className, size = 'md', sideOffset = OVERLAY_SIDE_OFFSET, collisionPadding = OVERLAY_COLLISION_PADDING, align = 'start', minWidth, maxHeight, children, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      align={align}
      // Density:繼承 page density(2026-06-15 canonical)。menu item 高度 = field-height-{size},而
      // field-height 隨 density 變(md 28/32/36 → lg 32/36/40)→ 鎖 data-density="md" 會把選單釘在 md-scale,
      // lg page 上對不上 lg 觸發點。原 data-density 是 409b91da a11y 批次順手加(對齊 Popover),非設計
      // 決策 → 移除,item 隨 page density 與觸發點一致(tier 仍由 size prop 決定)。
      // Focus return on close:不 override `onCloseAutoFocus` — 用 Radix 內建 default
      // (close 時 focus 還 trigger;outside-interaction 例外由 Radix `hasInteractedOutsideRef` 自管)。
      // W3C APG menubar「Escape: …return focus to the element…from which the menu was opened」
      // (w3.org/WAI/ARIA/apg/patterns/menubar/);shadcn dropdown-menu 同樣不 override。
      // 2026-06-11 移除 2026-04-08 的 `(e) => e.preventDefault()` hardcode:它跑在 Radix
      // composeEventHandlers 內建 handler 之前,defaultPrevented → trigger focus 被 skip →
      // Esc 關閉後 focus 掉到 body(APG violation)。原動機「mouse close 後 trigger 殘留
      // focus ring」不構成 override 理由:實測(2026-06-12 playwright)pointer item-click
      // close 後 programmatic refocus 在 Chromium 仍可 match `:focus-visible`(UA heuristic),
      // 但與 shadcn 官方 live demo 同流程 DOM 比對 IDENTICAL — Radix 生態一致接受此
      // tradeoff:APG keyboard focus-return 優先於 cosmetic ring。
      className={cn(floatingLayerClass, 'flex flex-col min-h-0', className)}
      style={{
        boxShadow: 'var(--elevation-200)',
        minWidth: minWidth ?? 'max(180px, var(--radix-dropdown-menu-trigger-width))',
        // 2026-07-18 viewport-adaptive max-h(對齊 HoverCard/Popover 既有 canonical):夾到「trigger 到
        //   碰撞邊界(已內縮 collisionPadding=8px)的剩餘高度」→ 高選單不溢出視窗、離視窗邊 ≥8px、
        //   短選單仍貼內容;consumer `maxHeight` 為**可選更低上限**(min 取小者)。inline style 非 class,
        //   故動態 maxHeight 不觸 Tailwind 掃描陷阱。
        maxHeight: maxHeight
          ? `min(var(--radix-dropdown-menu-content-available-height, 100vh), ${maxHeight}px)`
          : 'var(--radix-dropdown-menu-content-available-height, 100vh)',
      }}
      {...props}
    >
      <RowSizeProvider value={size}>
        {/* body 恆在 flex-1 ScrollArea 內:超過 clamped 高度即跨-OS 一致捲動(不吃寬度);
            短選單 flex-1 貼內容不塌(同 HoverCard/Popover/DataTable panel 已驗)。py-2 在內層,整 padded 區可捲。 */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="py-2">{children}</div>
        </ScrollArea>
      </RowSizeProvider>
    </DropdownMenuPrimitive.Content>
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

// ── SubContent ──
const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, children, ...props }, ref) => {
  const size = useRowSize()
  return (
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      sideOffset={OVERLAY_SIDE_OFFSET}
      className={cn(floatingLayerClass, 'py-2', className)}
      style={{ boxShadow: 'var(--elevation-200)', minWidth: 180 }}
      {...props}
    >
      <RowSizeProvider value={size}>
        {children}
      </RowSizeProvider>
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
      {shortcut && <span className="text-caption text-fg-muted tracking-shortcut">{shortcut}</span>}
    </>
  )
}

// ── Item ──
interface DropdownMenuItemProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>, 'children'> {
  children: React.ReactNode
  /** 左側 icon */
  startIcon?: LucideIcon
  /** 左側頭像資料（AvatarData），與 startIcon 互斥 */
  avatar?: AvatarData
  /** 次要說明文字 */
  description?: React.ReactNode
  /** 後綴 Tag（ReactNode） */
  tag?: React.ReactNode
  /** 後綴 Badge（ReactNode） */
  badge?: React.ReactNode
  /** 後綴指示型 icon（LucideIcon），fg-muted */
  endIcon?: LucideIcon
  /** 鍵盤快捷鍵提示(canonical)——渲染進 MenuItem `endContent` 正規後綴 slot。
   *  替代方案是 `<DropdownMenuShortcut>` child(composition escape-hatch);**同 item 勿混用**。 */
  shortcut?: string
  /** 單選選中（bg-neutral-selected，持續選中狀態）*/
  selected?: boolean
}

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  DropdownMenuItemProps
>(({ className, children, startIcon, avatar, description, tag, badge, endIcon, shortcut, selected, disabled, ...props }, ref) => {
  const size = useRowSize()
  const endContent = buildEndContent(size, badge, endIcon, shortcut)

  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      disabled={disabled}
      // 2026-07-05:typeahead 只比對 label——children 為字串時 auto-forward textValue,避免 Radix
      // fallback 拿整段 textContent(label+description+badge+shortcut 串接)比對。consumer 顯式
      // textValue 在 {...props} 較後 spread,仍優先。
      textValue={typeof children === 'string' ? children : undefined}
      className={cn(
        radixItemClass,
        // 2026-07-04 Q2 拍板:selected bg 勝 hover/highlighted(bg 是唯一選中指示器,被 hover 洗掉
        // = 選中資訊消失)。對齊 MenuItem(menu-item.tsx selected 時關 hover bg)+ Ant Menu
        // `:not(-item-selected)` + VS Code list `:hover:not(.selected)`;Radix highlighted 同時是
        // keyboard cursor,selected 項停留時維持 selected bg(DS bg 通道單一職責)。
        // 2026-07-05 D4 補完 Q2 附帶條件:selected×highlighted(鍵盤 cursor 停留)用加深一階
        // bg-neutral-selected-active(neutral-3;M23 nearest canonical = Button toggle active 同
        // family)— 深化而非洗掉 selection,cursor 可感知(WCAG 2.4.7),對齊 MUI selectedOpacity+hover idiom。
        selected && 'bg-neutral-selected data-[highlighted]:bg-neutral-selected-active',
        className,
      )}
      {...props}
    >
      <MenuItem
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
      </MenuItem>
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
  const size = useRowSize()
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
      // 2026-07-05:同 DropdownMenuItem——typeahead 只比對 label(endContent 的 value/badge 不進比對)。
      textValue={typeof children === 'string' ? children : undefined}
      className={cn(
        radixItemClass,
        'data-[state=open]:bg-neutral-hover',
        className,
      )}
      {...props}
    >
      <MenuItem
        size={size}
        startIcon={startIcon}
        endContent={endContent}
        role="presentation"
        className="!bg-transparent hover:!bg-transparent pointer-events-none"
      >
        {children}
      </MenuItem>
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
  const size = useRowSize()

  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      checked={checked}
      disabled={disabled}
      // 2026-07-05:同 DropdownMenuItem——typeahead 只比對 label(M10 同 pattern:帶 description)。
      textValue={typeof children === 'string' ? children : undefined}
      onSelect={(e) => e.preventDefault()}
      className={cn(radixItemClass, className)}
      {...props}
    >
      <MenuItem
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
      </MenuItem>
    </DropdownMenuPrimitive.CheckboxItem>
  )
})
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName

// ── Label（群組標題）──
const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, children, ...props }, ref) => {
  const size = useRowSize()
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn('outline-none', className)}
      {...props}
    >
      <MenuItem
        size={size}
        header
        role="presentation"
        className="pointer-events-none"
      >
        {children}
      </MenuItem>
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

// ── RadioItem（單選，排序方式等）──
// Radix handles checked state;checked 底色套在外層 Radix RadioItem 本身(parent-bg
// pattern,詳下方 2026-05-31 #10 註解),內層 MenuItem 恆 !bg-transparent 讓它透出。
interface DropdownMenuRadioItemProps
  // children Omit + redeclare required(2026-07-18 決策2 一致性):對齊 sibling Item/SubTrigger/
  // CheckboxItem — menu item 必有 label,children 為 required 非 Radix optional。RadioItem 恆渲染
  // 固定 <MenuItem>{children}</MenuItem>,children 是合法 label(非 lie),此為 required 化一致性修。
  extends Omit<React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>, 'children'> {
  children: React.ReactNode
  /** Prefix icon(LucideIcon) */
  startIcon?: LucideIcon
  /** 次要說明文字 */
  description?: React.ReactNode
}

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  DropdownMenuRadioItemProps
>(({ className, children, startIcon, description, disabled, ...props }, ref) => {
  const size = useRowSize()

  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      disabled={disabled}
      // 2026-07-05:同 DropdownMenuItem——typeahead 只比對 label(M10 同 pattern:帶 description)。
      textValue={typeof children === 'string' ? children : undefined}
      onSelect={(e) => e.preventDefault()}
      // 2026-05-31 #10:selected 底色套在外層 Radix RadioItem 本身(非 `[&>*]` 子 MenuItem),
      // 因內層 MenuItem 自帶 `!bg-transparent` 會蓋掉子層 bg → 選中底色從不顯示。
      // 改 parent-bg pattern(對齊 DropdownMenuItem selected):RadioItem 上底色,MenuItem 透明讓它透出。
      // 2026-07-04 Q2:checked 亦勝 highlighted(同 DropdownMenuItem selected 規則)
      className={cn(radixItemClass, 'data-[state=checked]:bg-neutral-selected data-[state=checked]:data-[highlighted]:bg-neutral-selected-active', className)}
      {...props}
    >
      <MenuItem
        size={size}
        startIcon={startIcon}
        description={description}
        disabled={disabled}
        role="presentation"
        className="!bg-transparent hover:!bg-transparent pointer-events-none"
      >
        {children}
      </MenuItem>
    </DropdownMenuPrimitive.RadioItem>
  )
})
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

// ── Shortcut（鍵盤快捷鍵提示 child;escape-hatch,不靠右）──
// **Canonical 是 `<DropdownMenuItem shortcut="⌘C">`** prop —— 走 MenuItem `endContent` 正規後綴 slot
// (跟 badge / endIcon 同槽、gap/對齊一致,真正靠右對齊列尾)。本 child 是 **composition
// escape-hatch**(相容 shadcn DropdownMenuShortcut idiom = `ml-auto` span,source:
// https://ui.shadcn.com/docs/components/dropdown-menu;npm published API 不砍)。⚠️ 在
// DropdownMenuItem 內 children 會進 MenuItem ItemContent 的 label `<span>`(inline context,
// 非 flex row),故 `ml-auto` **不生效、不會靠右**——只會 inline 附加在 label 文字尾;`ml-auto`
// 僅在 consumer 自組 flex row 時生效。要靠右一律用 canonical `shortcut` prop。**同一 item
// 只用一種,勿混用**(見 spec.md「快捷鍵提示 API」+ 禁止事項)。
// 字體樣式統一:text-caption + tracking-shortcut + fg-muted(對齊 prop 後綴 + CommandShortcut);位置不等價。
const DropdownMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn('ml-auto text-caption text-fg-muted tracking-shortcut', className)}
    {...props}
  />
)
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const dropdownMenuMeta = {
  component: 'DropdownMenu',
  family: 1, // 對齊 dropdown-menu.spec.md frontmatter L3(Family 1 消費者;DS 慣例 = meta 對齊 spec frontmatter,原 null 是 Phase 1 boilerplate 殘留)
  variants: {

  },
  sizes: {

  },
  // 'selected' = 單選/checked item 持續選中(bg-neutral-selected);'active' 保留 — highlight-on-selected
  // 走 bg-neutral-selected-active(active 階 token,M23 nearest canonical;2026-07-07 詞彙統一補修)。
  states: ['default', 'hover', 'active', 'selected', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-neutral-hover', 'bg-neutral-selected', 'bg-neutral-selected-active', 'bg-surface-raised', 'bg-transparent'],
    fg: ['text-fg-disabled', 'text-fg-muted'],
    ring: ['ring-ring'], // 2026-07-05:Trigger focus canonical ring(對齊 Checkbox/Tabs 等 meta 慣例)
  },
} as const

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
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  floatingLayerClass,
}
export type { SizeKey, DropdownMenuItemProps }

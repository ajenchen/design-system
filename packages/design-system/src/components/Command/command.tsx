"use client"
/**
 * @internal — DS-internal 單元(per `packages/design-system/ds-canonical/rules/ui-development.md` Public vs Internal canonical;spec frontmatter `isInternal`)。
 * 不進 root barrel front-door;由 SelectMenu(搜尋式選單引擎)等 DS 元件 wrap 消費,end-user app 請用 wrapper 元件。
 */

import * as React from "react"
import { type DialogProps } from "@radix-ui/react-dialog"
import { Command as CommandPrimitive } from "cmdk"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Dialog, DialogContent } from "@/design-system/components/Dialog/dialog"
import { MenuItem } from "@/design-system/components/Menu/menu-item"
import { ScrollArea } from "@/design-system/components/ScrollArea/scroll-area"

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-md bg-surface-raised text-foreground",
      className
    )}
    {...props}
  />
))
Command.displayName = CommandPrimitive.displayName

const CommandDialog = ({ children, ...props }: DialogProps) => {
  // M2 verified 2026-04-25 / 2026-06-11 更正歸因(cmdk/dist source):cmdk 於 DOM 上 emit
  // `cmdk-group-heading=""` / `cmdk-group=""` / `cmdk-input=""` / `cmdk-item=""` attributes;
  // `cmdk-input-wrapper=""` 非 cmdk emit — 是本檔 CommandInput 自設的 wrapper div attribute(shadcn 慣例)。
  // 下列 `[&_[cmdk-*]]:` attribute selectors 皆有對應真實 DOM。
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0 shadow-[var(--elevation-200)]">
        {/* 2026-09-07:刪掉這裡對 `cmdk-group-heading` 的三條覆寫(px-3 / font-medium / text-fg-muted)——
            分組標題的樣式已由 CommandGroup 消費 `MenuItem header`(SSOT:item-anatomy.spec.md:188)。
            留著等於在第二個地方又寫一次同一件事,而且值不一定跟著改(這正是 user 抓到「漂移」的形狀)。 */}
        <Command className="[&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-3 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex shrink-0 items-center border-b border-divider px-3" cmdk-input-wrapper="">
    <Search className="mr-2 h-4 w-4 shrink-0 text-fg-muted" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        // @focus-suppress B — B Field 家族輸入控件;承擔者:指示器是 Command 殼
        "flex h-11 w-full rounded-md bg-transparent py-3 text-body outline-none placeholder:text-fg-muted disabled:cursor-not-allowed disabled:text-fg-disabled disabled:placeholder:text-fg-disabled",
        className
      )}
      {...props}
    />
  </div>
))

CommandInput.displayName = CommandPrimitive.Input.displayName

/**
 * CommandList — cmdk primitive 外包 ScrollArea 跨 OS scrollbar 一致。
 *
 * Verified against cmdk/dist/index.js(2026-04-25):cmdk selected-item auto-scroll
 * 用標準 `Element.scrollIntoView({block:"nearest"})`,browser 向上找 nearest
 * scrollable ancestor → 命中 ScrollArea.Viewport(`overflow:hidden scroll`)→ 自動
 * 捲入 selected ✓。不需 MutationObserver sync。
 *
 * `cmdk-list-sizer` ResizeObserver 只量 offsetHeight 設 CSS var `--cmdk-list-height`
 * (純測量,非 scroll logic),wrap 不影響。
 *
 * 跨 DS 一致:DataTable / Sheet / Sidebar / DropdownMenu / Command 皆走 ScrollArea。
 */
const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  /* @story-baseline: overlay-surface.spec.md#Viewport-aware-scroll-chain-invariant(M25 SSOT owner)
      owner spec: overlay-surface.spec.md:34/53/347-362 —— 「浮層 body 永遠 flex-1 min-h-0 overflow-y-auto;
        中間 wrapper 都必 flex flex-col h-full min-h-0;viewport 太小 body 內壓縮捲動」。
      conflicting code(修前): 本 ScrollArea 固定 max-h-300 無 flex-1 → 在夾住的 SelectMenu PopoverContent
        (max-h=available-height)內撐破外殼、底部選項被裁(320px viewport 實測 bottom 425 > 320 溢出)。
      修: 加 flex-1 min-h-0(對齊 M25 canonical + HoverCard/Popover),max-h-300 降為上限。Command root 已
        `flex h-full flex-col`(command.tsx:23)= chain 完整;非 flex 容器內 flex-1 為 no-op(spec:34 backward compat)。 */
  <ScrollArea className="flex-1 min-h-0 max-h-[var(--menu-max-height,300px)]">
    <CommandPrimitive.List ref={ref} className={cn("overflow-x-hidden", className)} {...props} />
  </ScrollArea>
))

CommandList.displayName = CommandPrimitive.List.displayName

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className={className}
    {...props}
  />
))

CommandEmpty.displayName = CommandPrimitive.Empty.displayName

/**
 * 分組標題**消費 `MenuItem header`,不自己寫樣式**。
 *
 * 2026-09-07 修(user 抓「Command 群組標題漂移了,照理說應該跟 SelectMenu 同一種設計語言」):
 * 這裡原本手寫 `px-3 py-1.5 text-caption font-medium text-fg-muted` ——
 * 而 SSOT(`patterns/element-anatomy/item-anatomy.spec.md:188`「Row header(分組標題)」)寫的是
 * 「用 `MenuItem header={true}` 模式,`font-medium text-fg-muted` + 與 items **完全相同**的
 * row geometry(同 px / 同 py / **同 text size**)」。
 * 差在字級:手寫的是 `text-caption`(12px),canonical 要求與項目同級(14px)。
 *
 * SelectMenu(`select-menu.tsx:465`)一直是照 SSOT 做的 —— 它傳
 * `heading={<MenuItem size={size} header>…}` 並用 `[&_[cmdk-group-heading]]:p-0` 中和 cmdk 的內距。
 * 所以這不是「兩種設計語言」,是 Command **沒有消費 SSOT**、自己抄了一份走樣的值。
 *
 * 現在改成:consumer 傳字串時由本元件包成 `<MenuItem header>`,樣式完全由 SSOT 決定;
 * consumer 自己傳 element(SelectMenu 那種)則原樣尊重。兩條路徑都不再有手寫值。
 */
const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, heading, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    // `p-0` 中和 cmdk 對 heading 容器的預設內距 —— 內距由 MenuItem 的 row geometry 提供
    className={cn("overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:p-0", className)}
    heading={typeof heading === 'string' || typeof heading === 'number'
      ? <MenuItem header>{heading}</MenuItem>
      : heading}
    {...props}
  />
))

CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn("h-px bg-divider", className)}
    {...props}
    asChild
  >
    <div role="presentation" />
  </CommandPrimitive.Separator>
))
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      // @focus-suppress D — D 選單未選中項;承擔者:data-[selected=true] 的 hover 同色底
      "relative flex cursor-default gap-2 select-none items-center rounded-md px-3 py-1.5 text-body outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-neutral-hover data-[selected=true]:text-foreground data-[disabled=true]:text-fg-disabled [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      className
    )}
    {...props}
  />
))

CommandItem.displayName = CommandPrimitive.Item.displayName

const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "ml-auto text-caption tracking-shortcut text-fg-muted",
        className
      )}
      {...props}
    />
  )
}
CommandShortcut.displayName = "CommandShortcut"

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const commandMeta = {
  component: 'Command',
  family: 'composite', // 對齊 command.spec.md frontmatter family: composite(SSOT)
  variants: {

  },
  sizes: {

  },
  // 'active' 移除 — cmdk row 僅 data-[selected] highlight,無按壓視覺(2026-07-07 詞彙統一 DS-wide 按壓訊號盤點:檔內 0 active: utility / 0 *-active token)。
  states: ['default', 'hover', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-divider', 'bg-neutral-hover', 'bg-surface-raised', 'bg-transparent'], // 2026-07-04 補:CommandSeparator h-px bg-divider 實際消費
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-foreground'],
    ring: [],
  },
} as const

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}

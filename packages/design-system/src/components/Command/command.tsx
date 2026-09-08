"use client"
/**
 * @internal — DS-internal 單元(per `packages/design-system/ds-canonical/rules/ui-development.md` Public vs Internal canonical;spec frontmatter `isInternal`)。
 * 不進 root barrel front-door;由 SelectMenu(搜尋式選單引擎)等 DS 元件 wrap 消費,end-user app 請用 wrapper 元件。
 */

import * as React from "react"
import { type DialogProps } from "@radix-ui/react-dialog"
import { Command as CommandPrimitive, useCommandState } from "cmdk"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogTitle } from "@/design-system/components/Dialog/dialog"
import { MenuItem, type MenuItemProps } from "@/design-system/components/Menu/menu-item"
import { ICON_SIZE } from "@/design-system/tokens/uiSize/icon-size"
import { ScrollArea } from "@/design-system/components/ScrollArea/scroll-area"
import { Empty } from "@/design-system/components/Empty/empty"
import { CircularProgress } from "@/design-system/components/CircularProgress/circular-progress"
import { getMenuListMinHeight } from "@/design-system/components/Field/field-types"
import { RowSizeProvider, useRowSize } from "@/design-system/patterns/element-anatomy/item-anatomy"
import { useInputModality } from "@/design-system/hooks/use-input-modality"

type CommandSize = 'sm' | 'md' | 'lg'

/**
 * Command root —— 尺寸(sm / md / lg)在這裡進入 RowSizeProvider,搜尋列 / 項目 / 群組標題 / 空狀態全部從
 * context 取得同一個 size(2026-09-08 之前 CommandGroup 的字串 heading 永遠是 md 列高)。
 * 不自帶 surface / radius:殼(PopoverContent / DialogContent / inline 的邊框容器)才是 surface 的 owner。
 */
const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive> & { size?: CommandSize }
>(({ className, size, ...props }, ref) => {
  const inherited = useRowSize('md')
  return (
    <RowSizeProvider value={size ?? inherited}>
      <CommandPrimitive
        ref={ref}
        className={cn("flex h-full w-full flex-col overflow-hidden text-foreground", className)}
        {...props}
      />
    </RowSizeProvider>
  )
})
Command.displayName = CommandPrimitive.displayName

/**
 * CommandDialog —— Cmd+K 指令面板。內容**就是** SelectMenu 那一套(同一個 CommandInput 搜尋列、
 * 同一個 MenuItem 項目、同一個 MenuItem header 分組),殼是 DS Dialog。
 * 2026-09-08 刪掉這裡對 cmdk 的 8 條 `[&_[cmdk-…]]` 尺寸覆寫(input h-12 / item py-3 / svg h-5 …)——
 * 它們就是 user 抓到的「Command 每一支 story 都跟 SelectMenu 不同一套」的來源:同一個 primitive
 * 在面板裡被第二份樣式改寫。世界級的指令面板(Linear / Raycast / VS Code)也都是「同一份清單樣式 + 對話框殼」。
 * 指令面板依世界級慣例不畫可見標題;`title` 只給讀屏器(Radix 要求 DialogContent 有 Title)。
 */
const CommandDialog = ({ children, title = '指令面板', label = '搜尋指令', ...props }: DialogProps & { title?: string; label?: string }) => { // i18n-allow: DS 預設文案,可覆寫
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0 shadow-[var(--elevation-200)]" autoHeight>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <Command label={label}>
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

/**
 * CommandInput —— 浮層/面板內的搜尋列。**唯一實作**:SelectMenu(Select / Combobox / PeoplePicker 的 searchable
 * 模式)、CommandDialog、inline Command 三種形態都用它(2026-09-08 之前 SelectMenu 自己另寫一份 raw cmdk input,
 * 這裡又一份 h-11 的,兩份漂移 —— user:「搜尋框為何不是我們的 input 的樣式?儘管是不同元件也要是相同樣式的 SSOT」)。
 * 尺寸/字級/placeholder/disabled 全部吃 Field 輸入控件的 token(`--field-height-*` + 8px 內距、text-body(-lg)、
 * placeholder:text-fg-muted、disabled 依 M24 切 fg-disabled);**沒有外框**(它是浮層內的一列,底部用分隔線收邊),
 * 這是跟 `Input` 唯一的差別 —— 對齊 Linear / Raycast / Spotlight 的指令面板搜尋列。
 */
const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  Omit<React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>, 'size'> & { size?: CommandSize }
>(({ className, size: sizeProp, ...props }, ref) => {
  const size = sizeProp ?? useRowSize('md')
  return (
  <div
    className={cn(
      'flex shrink-0 items-center gap-2 px-3 py-1 border-b border-divider',
      size === 'lg' ? 'min-h-[calc(var(--field-height-lg)+8px)]'
        : size === 'sm' ? 'min-h-[calc(var(--field-height-sm)+8px)]'
        : 'min-h-[calc(var(--field-height-md)+8px)]',
    )}
    cmdk-input-wrapper=""
  >
    <Search size={ICON_SIZE[size]} className="shrink-0 text-fg-muted" aria-hidden />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        // @focus-suppress B — B Field 家族輸入控件;承擔者:插入點(caret)本身;列底的分隔線不是焦點指示
        'flex w-full bg-transparent outline-none placeholder:text-fg-muted',
        // M24 disabled state precedence:disabled 時 placeholder 切 fg-disabled(audit dim 34)
        'disabled:placeholder:text-fg-disabled disabled:text-fg-disabled disabled:cursor-not-allowed',
        size === 'lg' ? 'text-body-lg leading-compact' : 'text-body leading-compact',
        className,
      )}
      {...props}
    />
  </div>
)
})

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
>(({ className, label = '選項', ...props }, ref) => ( // i18n-allow: DS 預設 listbox 名稱(cmdk 預設是英文 Suggestions)
  /* @story-baseline: overlay-surface.spec.md#Viewport-aware-scroll-chain-invariant(M25 SSOT owner)
      owner spec: overlay-surface.spec.md:34/53/347-362 —— 「浮層 body 永遠 flex-1 min-h-0 overflow-y-auto;
        中間 wrapper 都必 flex flex-col h-full min-h-0;viewport 太小 body 內壓縮捲動」。
      conflicting code(修前): 本 ScrollArea 固定 max-h-300 無 flex-1 → 在夾住的 SelectMenu PopoverContent
        (max-h=available-height)內撐破外殼、底部選項被裁(320px viewport 實測 bottom 425 > 320 溢出)。
      修: 加 flex-1 min-h-0(對齊 M25 canonical + HoverCard/Popover),max-h-300 降為上限。Command root 已
        `flex h-full flex-col`(command.tsx:23)= chain 完整;非 flex 容器內 flex-1 為 no-op(spec:34 backward compat)。 */
  <ScrollArea className="flex-1 min-h-0 max-h-[var(--menu-max-height)]">
    <CommandPrimitive.List ref={ref} label={label} className={cn("overflow-x-hidden", className)} {...props} />
  </ScrollArea>
))

CommandList.displayName = CommandPrimitive.List.displayName

/**
 * CommandEmpty —— **own 空狀態**(2026-09-08 之前是純 passthrough,SelectMenu / AgentPanel 各自手刻
 * 「flex 置中 + Empty + 最小高度」,Command 自家 story 是裸文字貼左上 —— 三種長相)。
 * 字串 children 自動包 `<Empty description>`;最小高度 = `getMenuListMinHeight(size, minRows)`
 * (owner:select-menu.spec.md「Empty state」;= 同一 group 內 minRows 列單行項目的幾何,0 筆與 minRows 筆結果浮層等高)。
 * loading 時把 `<CommandLoading>` 當 children 放進來。
 */
const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty> & { size?: CommandSize; minRows?: number }
>(({ className, style, children, size: sizeProp, minRows = 3, ...props }, ref) => {
  const size = sizeProp ?? useRowSize('md')
  return (
    <CommandPrimitive.Empty
      ref={ref}
      className={cn('flex items-center justify-center', className)}
      style={{ minHeight: getMenuListMinHeight(size, minRows), ...style }}
      {...props}
    >
      {typeof children === 'string' || typeof children === 'number'
        ? <Empty description={String(children)} className="py-6" />
        : children}
    </CommandPrimitive.Empty>
  )
})

CommandEmpty.displayName = CommandPrimitive.Empty.displayName

/** 載入區塊:具 accessible name 的 `role="status"` + 48px 進度圈(owner:select-menu.spec.md「Loading」;不經 Empty)。放進 CommandEmpty 當 children。 */
function CommandLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex items-center justify-center py-6">
      <CircularProgress size={48} />
    </div>
  )
}

// ── SR live status(2026-07-05 D4 於 SelectMenu 落地;2026-09-08 搬進 Command,CommandDialog / inline 也受益)──
// cmdk CommandEmpty 渲染為 role="presentation" div、cmdk 全鏈無 aria-live,且 DOM focus 停在
// combobox input(aria-activedescendant 虛擬焦點)→ SR 使用者搜尋到 0 結果或 loading 佔位時
// 聽不到任何播報。補 visually-hidden polite live region,鏡射 CommandEmpty 的無結果文字;
// loading 由可見的 CommandLoading `role="status"` + `aria-label` 直接宣告,避免同一狀態重複播報。
// 對齊 react-select A11yText / APG combobox no-results 播報 + empty.spec.md「動態 filter no-results 容器需 aria-live="polite"」。
export function CommandEmptyStatus({ loading = false, text }: { loading?: boolean; text: string }) {
  const filteredCount = useCommandState((state) => state.filtered.count)
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {filteredCount === 0 ? (loading ? null : text) : null}
    </div>
  )
}


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
>(({ className, heading, ...props }, ref) => {
  const rowSize = useRowSize('md')
  return (
  <CommandPrimitive.Group
    ref={ref}
    // `p-0` 中和 cmdk 對 heading 容器的預設內距 —— 內距由 MenuItem 的 row geometry 提供
    className={cn("overflow-hidden p-0 py-2 text-foreground [&_[cmdk-group-heading]]:p-0", className)}
    heading={typeof heading === 'string' || typeof heading === 'number'
      ? <MenuItem size={rowSize} header>{heading}</MenuItem>
      : heading}
    {...props}
  />
)
})

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

type CommandItemMenuProps = Pick<MenuItemProps,
  'size' | 'startIcon' | 'startIconClassName' | 'avatar' | 'startContent' | 'description' | 'tag' | 'endContent' | 'selected' | 'checkbox' | 'checked'>
export type CommandItemProps = React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item> & CommandItemMenuProps & {
  /** 尾端快捷鍵提示(`⌘K`);跟 DropdownMenuItem 的 `shortcut` 同名同樣式(text-caption + tracking-shortcut + fg-muted)。 */
  shortcut?: React.ReactNode
}

/**
 * CommandItem —— 外層 cmdk Item 只負責 cmdk 的反白/停用訊號,**視覺 anatomy 一律由內層 `MenuItem` 承擔**
 * (icon 槽 / label / description / 尾端 tag、endContent、shortcut;owner = item-anatomy.spec.md + menu-item.spec.md)。
 * 這跟 SelectMenu 包 option 的結構完全相同(select-menu.tsx「CommandItem > MenuItem role=presentation」),
 * 所以指令面板、inline 清單、下拉選單三種形態的每一列都長一樣。
 * 相容:SelectMenu 自己傳 `<MenuItem>` 當 children(它要管 checkbox/selected/renderLabel),這時不再包第二層。
 */
const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  CommandItemProps
>(({ className, children, size: sizeProp, startIcon, startIconClassName, avatar, startContent, description, tag, endContent, shortcut, selected, checkbox, checked, disabled, ...props }, ref) => {
  const size = sizeProp ?? useRowSize('md')
  const keyboardModality = useInputModality() === 'keyboard'
  const childIsMenuItem = React.isValidElement(children) && children.type === MenuItem
  const end = shortcut != null ? <CommandShortcut>{shortcut}</CommandShortcut> : endContent
  return (
    <CommandPrimitive.Item
      ref={ref}
      disabled={disabled}
      className={cn(
        // @focus-suppress D — D 選單未選中項;承擔者:data-[selected=true] 的 hover 同色底
        "relative flex cursor-default select-none items-center outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-neutral-hover data-[selected=true]:text-foreground data-[disabled=true]:text-fg-disabled",
        // 內層 MenuItem 自帶內距與圓角;外層歸零
        "p-0 rounded-none",
        // 選中 × 互動疊加(owner:item-anatomy.spec.md「選中 × 互動疊加」,2026-08-11 user 拍板):
        // 滑鼠停在選中項 → 釘住 bg-neutral-selected;鍵盤反白 → 畫框(2026-09-07 A5),且只在鍵盤模態(2026-09-08)。
        // 2026-09-08 之前這段只在 SelectMenu / AgentPanel 各手刻一份,CommandItem 自己的 `selected` 是死的。
        selected && 'bg-neutral-selected data-[selected=true]:bg-neutral-selected',
        selected && keyboardModality && 'data-[selected=true]:not-hover:focus-ring-inset',
        className
      )}
      {...props}
    >
      {childIsMenuItem ? children : (
        <MenuItem
          role="presentation"
          size={size}
          startIcon={startIcon}
          startIconClassName={startIconClassName}
          avatar={avatar}
          startContent={startContent}
          description={description}
          tag={tag}
          endContent={end}
          selected={selected}
          checkbox={checkbox}
          checked={checked}
          disabled={disabled}
          className="w-full !bg-transparent hover:!bg-transparent"
        >
          {children}
        </MenuItem>
      )}
    </CommandPrimitive.Item>
  )
})

CommandItem.displayName = CommandPrimitive.Item.displayName

const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "text-caption tracking-shortcut text-fg-muted",
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
  CommandLoading,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}

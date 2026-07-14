// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — foundational composite(Tabs + overflow scroll mode + dropdown switcher + inline action slot)在單一 wrapper SSOT 內,拆分會破壞 a11y / focus management chain。當前 515 < cap 800。
import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cva } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/design-system/components/DropdownMenu/dropdown-menu'
import {
  useScrollEdges,
  useScrollByPage,
  buildFadeMask,
  ARROW_BUTTON_WIDTH,
  OverflowScrollArrow,
  OverflowMenuTriggerButton,
} from '@/design-system/patterns/horizontal-overflow/horizontal-overflow'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'

/**
 * Tabs — 基於 Radix Tabs，橋接設計系統 token
 *
 * ── 定位 ──
 *   同一上下文底下切換平行的 view。切 view（不是切 value）。
 *   切 value 用 SegmentedControl；切路由用 navigation。
 *
 * ── Size ──
 *   sm   h-tab-sm（32/40），★ 預設(2026-05-17 從 md 改),overlay / chrome / dense
 *   md   h-tab-md（40/48），future tier 無 recommended use case
 *   lg   h-tab-lg（48/56），page-level hero / 獨立 tabs 取代 chrome header
 *
 * ── 寬度行為 ──
 *   Trigger 寬度永遠由內容決定（hug content）。
 *   Triggers 之間 gap 為 --layout-space-loose（16px / 24px lg density）。
 *
 * ── Trigger 結構 ──
 *   [startIcon?] [label] [suffix: badge? + endIcon?]
 *   slot 間 gap-2，suffix 內 gap-1
 *
 * ── Selected underline ──
 *   使用 ::after 絕對定位在 bottom: -1px，2px primary（2026-07-06 拍板:持續選中站 base），
 *   蓋住 TabsList 的 1px gray border（單一視覺線條，不雙線）。
 */

// ── Size context ──
type TabsSize = 'sm' | 'md' | 'lg'
type TabsOverflow = 'none' | 'scroll' | 'menu'

interface TabsContextValue {
  size: TabsSize
}
const TabsContext = React.createContext<TabsContextValue>({ size: 'md' })

// ── Root ──
// Wrap Radix Tabs 以支援 value/onValueChange 的 context pass-through
// （menu 模式的 overflow items 需要能 proxy click 觸發同一個 onValueChange）
interface TabsProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {}

const TabsValueContext = React.createContext<{
  value?: string
  onValueChange?: (value: string) => void
}>({})


// ── getElementRef(Radix Slot idiom;鏡射 chip.tsx 同名 helper — 2026-07-05 M10 同型修)──
// 讀 child 既有 ref 而不觸發 React 18/19 dev deprecation warning。
function getElementRef(element: React.ReactElement): React.Ref<HTMLElement> | undefined {
  let getter = Object.getOwnPropertyDescriptor(element.props, 'ref')?.get
  let mayWarn = getter && 'isReactWarning' in getter && getter.isReactWarning
  if (mayWarn) return (element as unknown as { ref?: React.Ref<HTMLElement> }).ref
  getter = Object.getOwnPropertyDescriptor(element, 'ref')?.get
  mayWarn = getter && 'isReactWarning' in getter && getter.isReactWarning
  if (mayWarn) return (element.props as { ref?: React.Ref<HTMLElement> }).ref
  return (
    (element.props as { ref?: React.Ref<HTMLElement> }).ref ??
    (element as unknown as { ref?: React.Ref<HTMLElement> }).ref ??
    undefined
  )
}

// 遞迴攤平 Fragment：React.Children.toArray 不展開 <>…</>(把 Fragment 當單一 element),
// 導致 menu 模式 dropdown 漏掉被 Fragment 包起來的 trigger（如條件渲染的溢出 tabs）+ cloneElement
// 對 Fragment 傳 ref 會噴 React warning。攤平後每個 keyless child 補 path-index key,對齊
// React.Children.toArray 的自動 key 行為,避免 list key warning。
function flattenTabTriggers(children: React.ReactNode, prefix = ''): React.ReactElement[] {
  const out: React.ReactElement[] = []
  React.Children.forEach(children, (child, i) => {
    if (!React.isValidElement(child)) return
    if (child.type === React.Fragment) {
      out.push(
        ...flattenTabTriggers((child.props as { children?: React.ReactNode }).children, `${prefix}${i}.`),
      )
    } else {
      out.push(child.key != null ? child : React.cloneElement(child, { key: `tab-${prefix}${i}` }))
    }
  })
  return out
}

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  TabsProps
>(({ value, onValueChange, defaultValue, children, ...props }, ref) => {
  // 內部維護一份 uncontrolled state，讓 overflow menu 的 proxy 有 onValueChange 可呼叫
  const [internalValue, setInternalValue] = React.useState<string | undefined>(defaultValue)
  const isControlled = value !== undefined
  const currentValue = isControlled ? value : internalValue

  const handleValueChange = React.useCallback(
    (next: string) => {
      if (!isControlled) setInternalValue(next)
      onValueChange?.(next)
    },
    [isControlled, onValueChange]
  )

  const valueContext = React.useMemo(
    () => ({ value: currentValue, onValueChange: handleValueChange }),
    [currentValue, handleValueChange]
  )

  return (
    <TabsValueContext.Provider value={valueContext}>
      <TabsPrimitive.Root
        ref={ref}
        value={currentValue}
        onValueChange={handleValueChange}
        {...props}
      >
        {children}
      </TabsPrimitive.Root>
    </TabsValueContext.Provider>
  )
})
Tabs.displayName = 'Tabs'

// ── List ──
// TabsList 基礎 class — inline-flex 單列 + gap-loose + 底部 border-divider
// 2026-05-18 改 border-border → border-divider(per user verbatim「我認為應該把 tabs 的
// 下底線統一改成是 divider 色吧?」+「做」approval):
// - 跟 Dialog / Sheet / Popover / Sidebar header `border-b border-divider`(neutral-4)同色
// - withTabs scenario 下 tabs underline = chrome separator,跟 dialog 其他 separator 視覺一致
// - Selected trigger 2px primary 仍 overlay underlying divider(對比 primary >> divider 不弱)
// - 對齊 `color.spec.md`「T-junction connectivity 原則」段 outer-vs-divider 判準(Dialog 結構,T-junction 思路適用)
const TABS_LIST_BASE = [
  'inline-flex items-stretch',
  'gap-[var(--layout-space-loose)]',
  'border-b border-divider',
].join(' ')

interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  size?: TabsSize
  /**
   * Overflow 處理模式。詳見 tabs.spec.md 的 overflow 段。
   *   'none'   ★ 預設，不處理，triggers 溢出父容器（適用 tabs 數量可控的情境）
   *   'scroll' 單行橫向滾動 + 邊緣 fade mask（Material / Polaris / iOS 作法）
   *   'menu'   show-all navigator——全部 triggers 一直顯示在底層 overflow-x-auto 捲動容器內,
   *            （Ant Design / Atlassian 作法）
   */
  overflow?: TabsOverflow
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, size = 'sm', overflow = 'none', children, ...props }, ref) => {
  const tabsSizeContext = React.useMemo(() => ({ size }), [size])
  if (overflow === 'scroll') {
    return (
      <TabsContext.Provider value={tabsSizeContext}>
        <ScrollTabsList ref={ref} className={className} {...props}>
          {children}
        </ScrollTabsList>
      </TabsContext.Provider>
    )
  }
  if (overflow === 'menu') {
    return (
      <TabsContext.Provider value={tabsSizeContext}>
        <MenuTabsList ref={ref} className={className} {...props}>
          {children}
        </MenuTabsList>
      </TabsContext.Provider>
    )
  }
  // none（預設）
  return (
    <TabsContext.Provider value={tabsSizeContext}>
      <TabsPrimitive.List
        ref={ref}
        className={cn(TABS_LIST_BASE, 'w-full', className)}
        {...props}
      >
        {children}
      </TabsPrimitive.List>
    </TabsContext.Provider>
  )
})
TabsList.displayName = 'TabsList'

// ── Scroll mode ──
//
// 共同策略(對齊 Material 3 / Ant Design / Primer UnderlineNav 世界級作法):
//   - 容器 overflow-x-auto + overflow-y-hidden(真的可滾,鍵盤焦點可 scroll-into-view;
//     明示 y-hidden 阻 CSS overflow-3 spec「一軸 auto 時另軸 visible compute auto」)
//   - border-b 在 TabsList 內部(TABS_LIST_BASE),不在 outer wrapper,避免
//     active underline `after:bottom:-1px` 跟 outer + overflow-x-auto 觸發 y promote bug
//   - mask / arrow / fade 全部從 horizontal-overflow pattern module 取得——
//     參見 `patterns/horizontal-overflow/horizontal-overflow.spec.md`
//   - Menu 模式 = scroll 模式 + 額外的 ⌄ quick-jump button,點 menu item 同時
//     觸發 onValueChange + scrollIntoView,讓使用者在 tab strip 看到選中的 tab
// 單行水平滾動 + 邊緣 fade mask 延伸到 arrow button 底下 + 左右 always-visible arrows
//   - 鍵盤: Radix 原生方向鍵 + 瀏覽器 scroll-into-view
//   - Trackpad: 兩指橫向滑動
//   - 滑鼠滾輪: 點 arrow buttons (Shift+wheel 太隱晦)

const ScrollTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
  const { scrollRef, atStart, atEnd, canScroll } = useScrollEdges<HTMLDivElement>()
  const scrollByPage = useScrollByPage(scrollRef)
  const maskImage = buildFadeMask({
    canScroll,
    atStart,
    atEnd,
    reserveArrowWidth: ARROW_BUTTON_WIDTH,
  })

  return (
    // 2026-05-19 fix(scroll-overflow underline clip + y auto-promote):
    //   outer 撤 `border-b` → owner 升到 `TabsList` (TABS_LIST_BASE 含 border-b border-divider)
    //   把 trigger `after:bottom-[-1px]` 2px underline 的下半部 1px 收進 list border-box,
    //   再加 `overflow-y-hidden` 明示阻 browser y auto-promote(CSS overflow-3 spec:
    //   overflow-x:auto + overflow-y:visible 必 compute auto)。
    //   不加 `pb-px`(outer border 撤後 list border 已接 -1px 部分,加 pb 多 1px 多餘空白)。
    //   對齊 Primer UnderlineNav `overflow-x:auto; overflow-y:hidden` canonical 同步動
    //   horizontal-overflow.spec.md(「Hook re-export」+「典型 scroll / menu 模式組裝」段)owner 升 list 內部。
    <div className="relative">
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        <TabsPrimitive.List
          ref={ref}
          className={cn(TABS_LIST_BASE, 'min-w-full', className)}
          {...props}
        >
          {children}
        </TabsPrimitive.List>
      </div>
      {!atStart && canScroll && (
        <OverflowScrollArrow direction="left" onClick={() => scrollByPage('left')} />
      )}
      {!atEnd && canScroll && (
        <OverflowScrollArrow direction="right" onClick={() => scrollByPage('right')} />
      )}
    </div>
  )
})
ScrollTabsList.displayName = 'ScrollTabsList'

// ── Menu mode ──
// Show-all navigator pattern (Chrome tab dropdown / VS Code editor tabs / Discord channel jumper):
//   - Menu 永遠顯示全部 tabs,active 的用 checked 標記 (單選語意)
//   - 點 menu item = onValueChange + scrollIntoView(center),把該 tab 捲到視圖中央
//   - Menu 內容穩定,跟 scroll 位置無關,使用者對「⌄ = navigator」的直覺一致
//
// 為什麼底層仍是 overflow-x-auto 而非 overflow-hidden:
//   - scrollIntoView 需要真實 scroll 容器
//   - 鍵盤 focus 也依賴真實 scroll 讓 browser auto scroll-into-view
//   - scrollbar 用 CSS 隱藏,視覺看不出來
//
// Fade mask 純視覺,軟化內容硬邊,跟 menu 機制正交 (兩者可並存)。
// Menu button 出現條件: canScroll (有溢出空間才需要 navigator)。

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const MenuTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
  const { scrollRef, atStart, atEnd, canScroll } = useScrollEdges<HTMLDivElement>()
  const { onValueChange, value: activeValue } = React.useContext(TabsValueContext)

  // Local ref map — 追蹤每個 trigger 的 DOM 元素,供 scrollIntoView 使用。
  // 不用 useOverflowIndices 因為 menu 永遠顯示全部,不需要動態 overflow 計算。
  // code-quality-allow: long-function — helper fn 結構緊密,拆 sub-fn 會跨 fn 傳 state 反而複雜
  const itemRefs = React.useRef<Map<number, HTMLElement>>(new Map())
  // 2026-05-16 audit codex Round 6:capture rAF + cancel on unmount(defensive hygiene)
  const scrollRafIdRef = React.useRef<number>(0)
  React.useEffect(() => () => { if (scrollRafIdRef.current) cancelAnimationFrame(scrollRafIdRef.current) }, [])
  const registerItem = React.useCallback(
    (index: number) => (el: HTMLElement | null) => {
      if (el) itemRefs.current.set(index, el)
      else itemRefs.current.delete(index)
    },
    []
  )

  // Fragment-safe:攤平 <>…</> 讓條件渲染的溢出 tabs 也進 dropdown / ref map(見 flattenTabTriggers）
  const items = React.useMemo(
    () => flattenTabTriggers(children),
    [children]
  )

  // 2026-07-05 M10 同型修(Chip MenuChipGroup 同款):原 cloneElement 直接覆寫 child ref,
  // consumer 自有 ref 被靜默取代 → compose(registerItem + child 原 ref)。
  const enhancedChildren = items.map((child, i) => {
    const childRef = getElementRef(child)
    return React.cloneElement(
      child as React.ReactElement<{ ref?: React.Ref<HTMLElement> }>,
      {
        ref: (el: HTMLElement | null) => {
          registerItem(i)(el)
          if (typeof childRef === 'function') childRef(el)
          else if (childRef) (childRef as React.MutableRefObject<HTMLElement | null>).current = el
        },
      }
    )
  })

  // Menu 模式沒有 arrows,但仍套 fade mask (reserveArrowWidth: 0) 軟化內容硬邊
  // code-quality-allow: long-function — helper fn 結構緊密,拆 sub-fn 會跨 fn 傳 state 反而複雜
  const maskImage = buildFadeMask({ canScroll, atStart, atEnd, reserveArrowWidth: 0 })

  const handleMenuSelect = React.useCallback(
    (triggerValue: string, index: number) => {
      onValueChange?.(triggerValue)
      // 下一個 tick 再 scroll, 讓 Radix 先完成 data-state 更新
      if (scrollRafIdRef.current) cancelAnimationFrame(scrollRafIdRef.current)
      scrollRafIdRef.current = requestAnimationFrame(() => {
        scrollRafIdRef.current = 0
        itemRefs.current.get(index)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      })
    },
    [onValueChange]
  )

  return (
    // 2026-05-19 fix(scroll-overflow underline clip + y auto-promote,parallel to ScrollTabsList):
    //   outer 改 items-stretch(menu button 容器跟 TabsList 含 border 共底線)+ 撤 border。
    //   list 套 TABS_LIST_BASE,inner scroll 加 overflow-y-hidden。menu button 容器自帶
    //   border-b border-divider 跟 TabsList border 同 y 對齊(items-stretch 保證)。
    <div className="flex items-stretch">
      <div
        ref={scrollRef}
        className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        <TabsPrimitive.List
          ref={ref}
          className={cn(TABS_LIST_BASE, 'min-w-full', className)}
          {...props}
        >
          {enhancedChildren}
        </TabsPrimitive.List>
      </div>
      {canScroll && (
        <div className="flex-shrink-0 pl-[var(--layout-space-loose)] flex items-center border-b border-divider">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <OverflowMenuTriggerButton
                aria-label={`頁籤選單(共 ${items.length} 個)`}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {items.map((trigger, index) => {
                const triggerProps = trigger.props as {
                  value?: string
                  children?: React.ReactNode
                  disabled?: boolean
                }
                const triggerValue = triggerProps.value
                if (typeof triggerValue !== 'string') return null
                // 單選 active 用 DropdownMenuItem 的 selected prop
                //  → 對應 bg-neutral-selected 持續選中背景, 跟 SelectMenu 單選完全
                //  同一套 canonical 視覺, 全 DS 一致。不可用 className 發明樣式。
                return (
                  <DropdownMenuItem
                    key={triggerValue}
                    disabled={triggerProps.disabled}
                    selected={activeValue === triggerValue}
                    onSelect={() => handleMenuSelect(triggerValue, index)}
                  >
                    {triggerProps.children}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
})
MenuTabsList.displayName = 'MenuTabsList'

// ── Trigger ──
const tabsTriggerVariants = cva(
  [
    'relative inline-flex items-center justify-center',
    'gap-2',
    'whitespace-nowrap',
    'font-medium text-fg-secondary',
    'transition-colors duration-150',
    'cursor-pointer select-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    // Trigger 無水平 padding — 寬度 = 內容寬度。triggers 間的分隔靠 TabsList 的 gap-[var(--layout-space-loose)]
    // selected underline：::after 絕對定位在 bottom:-1px，2px primary（持續選中 base）
    // left-0/right-0 因為 trigger 已無 padding，底線等於內容寬度
    // 底線蓋住 TabsList 的 1px gray border，視覺單一線條
    'after:absolute after:left-0 after:right-0 after:bottom-[-1px] after:h-0.5',
    'after:bg-transparent after:transition-colors after:duration-150',
    // hover（未選）：文字轉深
    'hover:text-foreground',
    // selected
    'data-[state=active]:text-foreground data-[state=active]:font-medium',
    // 2026-07-06 user 拍板:選中底線 hover 階 → primary base(持續選中站 base;
    // Ant inkBarColor = colorPrimary / Material 3 active indicator = primary 同款)
    'data-[state=active]:after:bg-primary',
    // disabled：cursor-not-allowed + 不吃 hover 色
    // 不用 pointer-events-none，否則 cursor 不會改變；button[disabled] 本身就擋 click
    'disabled:cursor-not-allowed disabled:text-fg-disabled',
    'disabled:hover:text-fg-disabled',
  ],
  {
    variants: {
      size: {
        // leading-compact：trigger 是單行文字容器，使用 1.3 行高避免 text-body/body-lg 預設 1.5 造成垂直偏移
        sm: 'h-[var(--tab-height-sm)] text-body leading-compact',
        md: 'h-[var(--tab-height-md)] text-body leading-compact',
        lg: 'h-[var(--tab-height-lg)] text-body-lg leading-compact',
      },
    },
    defaultVariants: {
      // size = 'sm' per header-canonical.spec.md W6:overlay / chrome / dense toolbar
      // 都用 sm;獨立 page hero 用 lg。md 為 future tier(無 recommended use case)。
      // 2026-05-17 從 'md' 改 'sm'(M31 codex 比稿後)— production consumer = 0,
      // 影響面限 stories baseline(已過 visual diff gate)。
      size: 'sm',
    },
  }
)

interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /** 左側 icon（LucideIcon） */
  startIcon?: LucideIcon
  /** 右側 badge（通常是計數指示器） */
  badge?: React.ReactNode
  /**
   * 右側純視覺 indicator(LucideIcon)。**僅限方向 / 狀態 indicator**:ChevronDown / Pin / Star。
   * **不要拼 click 行為** — endIcon 是 tab body 的一部分,點到也是切 tab。
   * 需要「點該後綴開 dropdown / menu」場景請用 `inlineAction` slot(2026-05-21 拆分)。
   */
  endIcon?: LucideIcon
  /**
   * Inline action slot(2026-05-21 v3 加,per user「圖一 後綴應該是 inline action」+「點擊
   * 該 tab 的 inline action 跟其他地方應該不同反應」directive):
   * 提供 `<ItemInlineAction>` / `<DropdownMenuTrigger asChild><ItemInlineAction ... /></DropdownMenuTrigger>`
   * 等獨立 click target。**DOM 上是 trigger 的 sibling(絕對定位),非巢狀 button**
   * (2026-07-05 D4 修:Radix TabsTrigger 是原生 `<button>`,巢 button = HTML 不合法 +
   * axe nested-interactive;同 SidebarMenuButton suffixNode canonical),inline action
   * 點擊天然不落在 tab body,達成 split-click 行為(對齊 GitHub「Code ▾」/
   * Linear "Triage..." menu / Atlassian split-tab 共識)。
   *
   * 跟 endIcon 區別:endIcon = 純視覺 indicator(無獨立行為,連同 tab 一起 click),
   * inlineAction = 獨立 click target(自己的 handler,不切 tab)。語意分家明確。
   */
  inlineAction?: React.ReactNode
}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, startIcon: StartIcon, badge, endIcon: EndIcon, inlineAction, children, ...props }, ref) => {
  const { size } = React.useContext(TabsContext)
  // 2026-05-18 改 import ICON_SIZE SSOT(per user『做完』approval,消除 M17 違反 7+ 重複 ternary)
  const iconSize = ICON_SIZE[size as 'sm' | 'md' | 'lg']
  const hasSuffix = badge != null || EndIcon !== undefined
  // 2026-07-05 D4 修(deep-audit「Tabs:inlineAction slot 造成 button 巢 button」):
  // Radix TabsTrigger render 原生 <button>,inlineAction(ItemInlineActionButton)也是原生
  // <button> — 巢狀 interactive = HTML 不合法 + axe nested-interactive(serious)+ tab 的
  // accessible name 混入 action 內容。改 sibling 佈局(同 SidebarMenuButton suffixNode
  // canonical,sidebar.tsx):wrapper span(relative)內 trigger + 絕對定位 action;trigger 以
  // paddingRight 預留 action 空間 — icon 寬 + 原 gap(有 badge/endIcon 時 4px = suffix 內
  // gap-1;僅 action 時 8px = slot 間 gap-2),幾何與巢狀版一致。click 天然分流(action 不在
  // trigger 子樹,不冒泡),原 stopPropagation 五連發不再需要。
  const hasAction = inlineAction != null
  const actionPaddingRight = hasAction ? iconSize + (hasSuffix ? 4 : 8) : undefined

  const trigger = (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(tabsTriggerVariants({ size }), className)}
      style={hasAction ? { paddingRight: actionPaddingRight } : undefined}
      {...props}
    >
      {StartIcon && <StartIcon size={iconSize} aria-hidden />}
      {children != null && <span>{children}</span>}
      {hasSuffix && (
        <span className="inline-flex items-center gap-1">
          {badge}
          {EndIcon && <EndIcon size={iconSize} aria-hidden />}
        </span>
      )}
    </TabsPrimitive.Trigger>
  )

  if (!hasAction) return trigger

  return (
    // sibling 佈局 wrapper:span(relative)內 trigger + 絕對定位 action。
    // Radix roving focus 用 collection context 收 trigger,不要求 trigger 是 List 直接子層。
    <span className="relative inline-flex">
      {trigger}
      <span className="absolute top-1/2 -translate-y-1/2 right-0 inline-flex items-center">
        {inlineAction}
      </span>
    </span>
  )
})
TabsTrigger.displayName = 'TabsTrigger'

// ── Content ──
const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      // 與 TabsList 的間距 canonical(2026-06-12 user 拍板):--layout-space-tight(md 12px,
      // density 連動)。依 layoutSpace.spec「親疏 3 級」:Tabs↔Content 同 bundle(第一級,
      // 元件 spec own),值取規則 3「直接功能依賴 = tight」精神(heading → labeled content 同類)。
      // 收斂原 DS-wide 四種土法(無間距 / mt-4 / p-4 / pt-4 — M17 假 SSOT)。
      // full-height 佈局(AppShell pane)用 className="mt-0" 覆寫(tailwind-merge)。
      'mt-[var(--layout-space-tight)]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      className
    )}
    {...props}
  />
))
TabsContent.displayName = 'TabsContent'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const tabsMeta = {
  component: 'Tabs',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  // 注:`fieldHeight` 為 meta 通用 height key;Tabs **不複用 field-height**,值為 `--tab-height-*`(md density,對齊 spec.md size table + uiSize.css)
  sizes: {
    sm: { fieldHeight: 32, iconSize: 16, typography: 'body' },
    md: { fieldHeight: 40, iconSize: 16, typography: 'body' },
    lg: { fieldHeight: 48, iconSize: 20, typography: 'body-lg' },
  },
  // 'selected' = 選中 tab(Radix DOM attr 為 data-state="active",meta 詞彙統一用 'selected' 避免與「按壓 active」混用;2026-07-07)
  states: ['default', 'hover', 'selected', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-primary', 'bg-transparent'],
    fg: ['text-fg-disabled', 'text-fg-secondary', 'text-foreground'],
    ring: ['ring-ring'],
  },
  defaultSize: 'sm',
} as const

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsTriggerVariants }
export type { TabsSize, TabsListProps, TabsTriggerProps }

// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — foundational composite(SidebarProvider / Sidebar / SidebarMenu / SidebarGroup / SidebarMenuButton 等 10+ primitives 共享 context + 20+ sidebar-specific features;已是 foundational SSOT spec cap 800)
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
import { cva, type VariantProps } from "class-variance-authority"
import type { LucideIcon } from "lucide-react"
import { ChevronDown, PanelLeft } from "lucide-react"

import { useIsNarrowViewport } from "@/design-system/hooks/use-is-narrow-viewport"
import { cn } from "@/lib/utils"
import { Badge } from "@/design-system/components/Badge/badge"
import { Button } from "@/design-system/components/Button/button"
import { Input } from "@/design-system/components/Input/input"
import { ScrollArea } from "@/design-system/components/ScrollArea/scroll-area"
import { Separator } from "@/design-system/components/Separator/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/design-system/components/Sheet/sheet"
import { Skeleton } from "@/design-system/components/Skeleton/skeleton"
import { ChromeHeader } from "@/design-system/patterns/header-canonical/chrome-header"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/design-system/components/Tooltip/tooltip"
// Row primitive 共用常數與 helpers——單一 source of truth
import {
  AVATAR_SIZE,
  ICON_SIZE,
  ItemIcon,
  ItemLabel,
  ItemInlineAction,
  ItemInlineActionButton,
  RowSizeProvider,
  getUniformPrefixSlotStyle,
  ROW_PADDING_BY_SIZE,
  type RowSize,
  type InlineActionConfig,
} from "@/design-system/patterns/element-anatomy/item-anatomy"

/**
 * Sidebar
 * ─────────────────────────────────────────────────────────────
 * 本元件的 item / label 視覺規格刻意對齊 MenuItem(menuItemVariants)
 * ——sidebar、dropdown-menu、select-menu 共用同一條 item-layout 公式:
 *
 *   px = var(--layout-space-loose)   (sidebar 脈絡;md=16 / lg=24)
 *   py = calc((--field-height-md - 1lh) / 2)
 *   font: text-body leading-compact font-medium
 *   hover / selected: bg-neutral-hover / bg-neutral-selected
 *
 * 這確保 SidebarGroupLabel(header 模式)和 SidebarMenuButton(互動模式)
 * 擁有完全相同的 row height,消除「label 和 items 之間高度落差」的問題。
 */

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

// ── Context ────────────────────────────────────────────────────────────────

// Sidebar 的 size 直接用 item-layout pattern 的 RowSize type(sm/md/lg),
// 跟所有 row primitives 保持同一套 size 語意
type SidebarSize = RowSize

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
  // 全 sidebar 共用的 size(sm/md/lg)——透過 SidebarProvider 一次設定,
  // 下游所有 SidebarMenuButton / SidebarGroupLabel / SidebarMenuSkeleton 自動繼承。
  size: SidebarSize
  // Single-selection state:整個 sidebar 同時只有一個 active item。
  // SidebarMenuButton 傳 `id` prop,自動從這裡算 isActive、自動 onClick 時 setActiveId。
  // Consumer 可 controlled(傳 activeId + onActiveChange)或 uncontrolled(僅傳
  // defaultActiveId)。Router-driven 的 sidebar 通常 controlled(URL → activeId)。
  activeId: string | undefined
  setActiveId: (id: string) => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }
  return context
}

// ── Provider ───────────────────────────────────────────────────────────────

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    defaultOpen?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
    /** Sidebar row 元件的預設尺寸(sm/md/lg),propagate 給所有 children。Default: "md" */
    size?: SidebarSize
    /** 當前 active item 的 id(controlled)——router-driven sidebar 從 URL 算出來傳進。 */
    activeId?: string
    /** 初始 active id(uncontrolled)。 */
    defaultActiveId?: string
    /** Active id 改變時的 callback(controlled 必傳)。 */
    onActiveChange?: (id: string) => void
    /**
     * 全域 prefix 對齊。**預設 `false`**——只在「sidebar 內有大量 brand logo 跟一般 icon
     * 混用,期待 label 齊左掃視」時 opt-in `true`。
     *
     * **典型 use case**(should opt-in):
     * - Linear / Raycast 風格的 integration 清單:Home / Inbox(lucide icon)
     *   + GitHub / Slack / Figma(brand logo,24px)混在同一個 menu
     * - App launcher / workspace switcher / connected apps,brand logo 為主體
     *
     * **不該 opt-in**:
     * - 全 icon 主導覽 + 全 avatar user footer(語意不同層級,該分 group 不該強迫對齊)
     * - 沒有真實混用情境只想要「視覺整齊」(預設行為已經對)
     *
     * 開啟後機制:CSS `:has()` 偵測 sidebar 子樹同時存在 `data-prefix-type="icon"` 和
     * `"avatar"`(由 `<ItemIcon>` / `<ItemAvatar>` 自動標記)時,套用固定 24px 槽,
     * 跨 menu / 跨 group 全域 label 對齊。不混用時零成本。
     *
     * 為什麼預設關閉而非 always-on auto:explicit-over-implicit——sidebar 排版行為
     * 應該從寫的 prop 一眼看出,不藏 CSS 魔法。詳見 `sidebar.spec.md`。
     */
    uniformPrefix?: boolean
  }
>(
  // code-quality-allow: long-function — SidebarProvider 整合 dual-state(open + activeId)+ mobile sync + keyboard handler + context memo + style binding。拆 sub-fn 會打斷 React state binding chain + Context provider 順序語意(M21 prop variant test:拆分降低可讀性,單 fn 內 state lifecycle 一目了然)。當前 97 < cap 200。
  (
    {
      defaultOpen = true,
      open: openProp,
      onOpenChange: setOpenProp,
      size = "md",
      activeId: activeIdProp,
      defaultActiveId,
      onActiveChange,
      uniformPrefix = false,
      className,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const [_activeId, _setActiveId] = React.useState<string | undefined>(defaultActiveId)
    const activeId = activeIdProp ?? _activeId
    const setActiveId = React.useCallback(
      (id: string) => {
        if (activeIdProp === undefined) _setActiveId(id)
        onActiveChange?.(id)
      },
      [activeIdProp, onActiveChange]
    )
    const isMobile = useIsNarrowViewport()
    const [openMobile, setOpenMobile] = React.useState(false)

    const [_open, _setOpen] = React.useState(defaultOpen)
    const open = openProp ?? _open
    const setOpen = React.useCallback(
      (value: boolean | ((value: boolean) => boolean)) => {
        const openState = typeof value === "function" ? value(open) : value
        if (setOpenProp) {
          setOpenProp(openState)
        } else {
          _setOpen(openState)
        }
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
      },
      [setOpenProp, open]
    )

    const toggleSidebar = React.useCallback(() => {
      return isMobile
        ? setOpenMobile((o) => !o)
        : setOpen((o) => !o)
    }, [isMobile, setOpen, setOpenMobile])

    React.useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (
          event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
          (event.metaKey || event.ctrlKey)
        ) {
          event.preventDefault()
          toggleSidebar()
        }
      }
      window.addEventListener("keydown", handleKeyDown)
      return () => window.removeEventListener("keydown", handleKeyDown)
    }, [toggleSidebar])

    // code-quality-allow: long-function — SidebarProvider 內 dual-state(open + activeId)+ mobile + handler refs + useMemo context 集中一處;拆 sub-fn 會打斷 useMemo dep stability + Context provider 順序。當前 97 < cap 200。Script naive heuristic 把 `const state = ?` 三元當 fn 起點誤報。
    const state = open ? "expanded" : "collapsed"

    const contextValue = React.useMemo<SidebarContextProps>(
      () => ({
        state,
        open,
        setOpen,
        isMobile,
        openMobile,
        setOpenMobile,
        toggleSidebar,
        size,
        activeId,
        setActiveId,
      }),
      [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar, size, activeId, setActiveId]
    )

    // 不在此處包 TooltipProvider——shadcn 原版預設 delayDuration=0,會覆蓋
    // 應用層的 delay 設定,造成 sidebar 內部 tooltip 行為跟其他地方不一致。
    // TooltipProvider 應由應用層(Storybook preview.tsx、app root)統一設定。
    // RowSizeProvider 讓整個 sidebar 子樹的 <ItemIcon> / <ItemAvatar> 都能 auto-size,
    // asChild consumer 不需要再手動查 ICON_SIZE / AVATAR_SIZE。
    //
    // ── 全域 prefix 對齊(預設關閉,explicit opt-in)──
    // false(預設):school A,各 menu 自然 prefix 寬度,跨 menu 不對齊
    // true:opt-in CSS `:has()` auto-detect,混用時套用、不混用零成本(school B,Notion 慣例)
    const slotStyle = getUniformPrefixSlotStyle(size)
    const slotValue = slotStyle["--item-prefix-slot" as keyof typeof slotStyle]
    // 2026-05-22 Approach 9 — per-row prefix size mirror(JS const → CSS var):
    //   `--item-icon-size`    ← ICON_SIZE[size]         (sm/md=16, lg=20)
    //   `--item-avatar-size`  ← AVATAR_SIZE.inline[size] (sm=20, md/lg=24)
    // 供 SidebarMenuButton collapsed pl 公式消費,讓所有 prefix 中心(icon/avatar)鎖回
    // rail center = --sidebar-width-icon/2(per user mental model:rail anchor =
    // GlobalHeader toggle geometry,sidebar 收合所有元素 cx 對齊此 rail center)。
    // Rail anchor 自身不動(--sidebar-menu-icon-size 維持 1rem 固定,per globals.css :root)。
    const wrapperStyle = React.useMemo<React.CSSProperties>(
      () =>
        ({
          "--item-icon-size": `${ICON_SIZE[size]}px`,
          "--item-avatar-size": `${AVATAR_SIZE.inline[size]}px`,
          ...(uniformPrefix ? { "--mixed-prefix-slot": slotValue } : {}),
          ...style,
        } as React.CSSProperties),
      [size, uniformPrefix, slotValue, style]
    )

    return (
      <SidebarContext.Provider value={contextValue}>
        <RowSizeProvider value={size}>
          <div
            style={wrapperStyle}
            className={cn(
              "group/sidebar-wrapper flex min-h-svh w-full",
              // CSS :has() 偵測 — 只在 uniformPrefix=true(opt-in,預設 false;見 sidebar.spec.md「Sidebar 全域 prefix 對齊」)時掛
              // mixing detected → 同時把 --item-icon-size cascade 到 slot 寬(`!` important 蓋
              // 過 wrapperStyle inline,讓 collapsed pl 公式知道「ItemPrefix wrapper 被撐到
              // 24,effective prefix width = 24 非 16」)。
              uniformPrefix &&
                "has-[[data-prefix-type=icon]]:has-[[data-prefix-type=avatar]]:[--item-prefix-slot:var(--mixed-prefix-slot)] has-[[data-prefix-type=icon]]:has-[[data-prefix-type=avatar]]:![--item-icon-size:var(--mixed-prefix-slot)]",
              className
            )}
            ref={ref}
            {...props}
          >
            {children}
          </div>
        </RowSizeProvider>
      </SidebarContext.Provider>
    )
  }
)
SidebarProvider.displayName = "SidebarProvider"

// ── Sidebar container ──────────────────────────────────────────────────────

const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    side?: "left" | "right"
    collapsible?: "offcanvas" | "icon" | "none"
    /**
     * Viewport top inset(2026-05-20 ship per AppShell `primary-header` unblock)。
     * 預設 undefined = sidebar 從 viewport top 起算(`top:0 / h:svh`,當前 default)。
     * 提供 CSS value(eg. `'var(--chrome-header-height)'` 或 `'48px'`)時,sidebar 改
     * 從該值起算(`top: viewportInsetTop / height: calc(100svh - viewportInsetTop)`),
     * 讓 global header 不被覆蓋(AppShell primary-header mode 必傳)。
     * 對齊 Mantine `layout="default"` navbar 高度扣 header 慣例。
     */
    viewportInsetTop?: string
  }
>(
  (
    {
      side = "left",
      collapsible = "offcanvas",
      viewportInsetTop,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar()
    const insetStyle: React.CSSProperties | undefined = viewportInsetTop
      ? { top: viewportInsetTop, height: `calc(100svh - ${viewportInsetTop})` }
      : undefined

    if (collapsible === "none") {
      return (
        <div
          className={cn(
            "flex h-full w-[var(--sidebar-width)] flex-col bg-surface text-foreground",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      )
    }

    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
          <SheetContent
            data-sidebar="sidebar"
            data-mobile="true"
            className="w-[var(--sidebar-width)] bg-surface p-0 text-foreground [&>button]:hidden"
            style={
              {
                "--sidebar-width": "var(--sidebar-width-mobile)",
              } as React.CSSProperties
            }
            side={side}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Sidebar</SheetTitle>
              <SheetDescription>Displays the mobile sidebar.</SheetDescription>
            </SheetHeader>
            <div className="flex h-full w-full flex-col">{children}</div>
          </SheetContent>
        </Sheet>
      )
    }

    return (
      <div
        ref={ref}
        className="group peer hidden shrink-0 text-foreground md:block"
        data-state={state}
        data-collapsible={state === "collapsed" ? collapsible : ""}
        data-side={side}
      >
        {/* Gap div:佔據 sidebar 實際寬度,推開主內容 */}
        <div
          className={cn(
            "relative w-[var(--sidebar-width)] min-w-[var(--sidebar-width-min)] bg-transparent transition-[width,min-width] duration-200 ease-linear motion-reduce:duration-0",
            "group-data-[collapsible=offcanvas]:!w-0 group-data-[collapsible=offcanvas]:!min-w-0",
            "group-data-[side=right]:rotate-180",
            "group-data-[collapsible=icon]:!w-[var(--sidebar-width-icon)] group-data-[collapsible=icon]:!min-w-0"
          )}
        />
        <div
          style={insetStyle}
          className={cn(
            // 2026-05-20 v3:`inset-y-0 h-svh` → 可被 viewportInsetTop prop override(per AppShell primary-header)
            !viewportInsetTop && "inset-y-0 h-svh",
            // 2026-05-21 v9 fix(per user 「右側分隔線跑去哪 + sidebar 寬度沒正確變化」):
            // 補 `overflow-x-hidden` — C* refactor 主機制(outer narrows to sidebar-width-icon
            // 時 clip inner 272px overflow,visual right border 顯示,主內容不被遮)。原 C*
            // commit 漏加 className 只 comment 提及。
            "overflow-x-hidden",
            "fixed z-10 hidden w-[var(--sidebar-width)] min-w-[var(--sidebar-width-min)] transition-[left,right,width,min-width] duration-200 ease-linear motion-reduce:duration-0 md:flex",
            "group-data-[collapsible=icon]:!min-w-0",
            side === "left"
              ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
              : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
            "group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]",
            "group-data-[side=left]:border-r group-data-[side=left]:border-divider",
            "group-data-[side=right]:border-l group-data-[side=right]:border-divider",
            className
          )}
          {...props}
        >
          {/* SidebarInner:永遠 full sidebar-width via inline style(Tailwind JIT 沒 compile
              `min-w-[var(--sidebar-width)]` arbitrary class — 只 generated min-w-sidebar-width-min)。
              Inline style 繞 JIT 確保 272px。Collapsed mode 只是 outer overflow-x:hidden clip 出
              左側 sidebar-width-icon = visible icon rail。 */}
          <div
            data-sidebar="sidebar"
            style={{ width: 'var(--sidebar-width)', minWidth: 'var(--sidebar-width)' }}
            className="flex h-full shrink-0 flex-col bg-surface"
          >
            {children}
          </div>
        </div>
      </div>
    )
  }
)
Sidebar.displayName = "Sidebar"

// ── Trigger / Rail / Input ─────────────────────────────────────────────────

// SidebarTrigger — 用 Button 原生的 size="sm" iconOnly,
// 高度自動跟 density 走(field-height-sm @ md=28 / lg=32)
// 不 override size,避免 density 切換時 trigger 不變
const SidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentProps<typeof Button>
>(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      ref={ref}
      data-sidebar="trigger"
      variant="text"
      size="sm"
      iconOnly
      startIcon={PanelLeft}
      aria-label="Toggle Sidebar"
      className={className}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    />
  )
})
SidebarTrigger.displayName = "SidebarTrigger"

// SidebarInput — 用 Input 元件原生高度(跟 density 自動走),不 override
const SidebarInput = React.forwardRef<
  React.ElementRef<typeof Input>,
  React.ComponentProps<typeof Input>
>(({ className, ...props }, ref) => {
  return (
    <Input
      ref={ref}
      data-sidebar="input"
      className={cn("w-full", className)}
      {...props}
    />
  )
})
SidebarInput.displayName = "SidebarInput"

// ── Shell regions ──────────────────────────────────────────────────────────

// SidebarHeader / SidebarFooter:
//   - 固定高度 `var(--chrome-header-height)`(md=48 / lg=56,density-responsive)
//   - 跨元件 chrome header 共享同一個 token,自動跟主內容 page header 對齊
//   - 水平 padding 用 loose token(跟 items 的 px 對齊)
//   - 邊框是結構邊界(分隔 fixed/scroll 區),full-width 不內縮
//
// 為什麼 density-responsive:chrome 裡放的 button 綁定 field-height token,
// 會隨 density 變大。Chrome 如果不跟著放大,lg density 下 padding 會被擠壓。
const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { withTabs?: boolean; tabsSlot?: React.ReactNode }
>(({ className, withTabs, tabsSlot, ...props }, ref) => {
  return (
    // 2026-05-21 v9 — restore main behavior(per user「不應該調整原本的樣式,只有說收起來的時候
    // 要調整 header logo 的位置使其與其下 icon 水平置中」):
    //   - Expanded mode:ChromeHeader default `px-loose`(16px L+R),avatar 跟 menu icon 對齊
    //   - Collapsed mode:`!px-0 !justify-center` 拿掉 padding + 內容置中,WorkspaceBrand text
    //     已 `group-data-[collapsible=icon]:hidden`,collapsed 只剩 avatar 24px,centered in 48px
    //     square → avatar.center = 24 = menu icon center.x ✓
    // 完全 match main 行為(v7 leadingRail / v8 -ml-1 surgical 全撤回)。
    <ChromeHeader
      ref={ref}
      withTabs={withTabs}
      tabsSlot={tabsSlot}
      data-sidebar="header"
      className={cn(
        // 2026-05-21 v14 — rail-derived collapsed padding,full SSOT cascade(per user directive
        // 「avatar尺寸、menu item padding、menu icon尺寸任一變動都要正確連動」+ codex Layer B
        // 比稿共識):
        //
        // 公式 derivation(rail-centered geometric identity):
        //   avatar.cx = pl + avatar/2 = (sidebar-width-icon - avatar)/2 + avatar/2 = sidebar-width-icon/2
        //   menu icon.cx = loose + icon-size/2
        //   sidebar-width-icon = 2*loose + icon-size  →  sidebar-width-icon/2 = loose + icon-size/2 ✓
        //
        // → 任何 avatar / loose / icon-size 改值,公式自動對齊 menu icon 中心(rail 幾何恆等)。
        //
        // SSOT 連動鏈:
        //   --layout-space-loose (density token) ─┐
        //   --sidebar-menu-icon-size              ├→ --sidebar-width-icon (calc cascade)
        //                                          └→ 公式自動跟 ✓
        //   --chrome-header-avatar-size (header-canonical.css local token):公式 var 引用,
        //                                JS 端透過 WorkspaceBrand RowSizeProvider value="md"
        //                                + AVATAR_SIZE.inline.md spec-coupled 共識 sync。
        //
        // Numerical equivalence to v13 `loose-4` 公式(verified):
        //   md density: (48-24)/2 = 12 = loose-4 = 12 ✓ identical
        //   lg density: (64-24)/2 = 20 = loose-4 = 20 ✓ identical
        // → v14 upgrade 純 SSOT chain robustness,0 視覺改變。
        "group-data-[collapsible=icon]:!pl-[calc((var(--sidebar-width-icon)-var(--chrome-header-avatar-size))/2)]",
        "group-data-[collapsible=icon]:!pr-0",
        "transition-[padding] duration-200 ease-linear motion-reduce:duration-0",
        className
      )}
      {...props}
    />
  )
})
SidebarHeader.displayName = "SidebarHeader"

// SidebarFooter — pinned 在 sidebar 底部的 menu group 容器,不是固定高度 chrome slot。
// 行為跟 SidebarGroup 類似(flex flex-col py-2),但永遠靠底(shrink-0)且有 border-t 分隔。
// Consumer 放 SidebarMenu + SidebarMenuButton,高度由內容決定(1~N 個 items)。
// 典型內容:user menu、settings、help、logout 等底部選項群組。
const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="footer"
      className={cn(
        "flex shrink-0 flex-col py-2 border-t border-divider",
        className
      )}
      {...props}
    />
  )
})
SidebarFooter.displayName = "SidebarFooter"

const SidebarSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.ComponentProps<typeof Separator>
>(({ className, ...props }, ref) => {
  // 預設對齊 loose token:分隔兩個 scrollable group 時,跟 item 內容對齊。
  // 分隔 fixed 元件(Header/Footer 與 Content)時,consumer 可傳 className 覆寫成 mx-0。
  return (
    <Separator
      ref={ref}
      data-sidebar="separator"
      className={cn(
        "mx-[var(--layout-space-loose)] w-auto bg-divider",
        className
      )}
      {...props}
    />
  )
})
SidebarSeparator.displayName = "SidebarSeparator"

const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="content"
      // SidebarContent 用 ScrollArea 處理長列表 scroll——跨 OS 一致不吃寬度(macOS
      // overlay vs Windows/Linux always-visible 差異見 scroll-area.tsx 註解)。
      // 呼吸空間和分隔線由 SidebarGroup 自己處理(對齊 MenuGroup 的 py-2 + [&+&]:border-t)。
      // ScrollArea Root 本身 overflow-hidden,icon-collapsed 時不會露出 scroll chrome。
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        className
      )}
      {...props}
    >
      <ScrollArea className="flex-1">
        <div className="flex flex-col">{children}</div>
      </ScrollArea>
    </div>
  )
})
SidebarContent.displayName = "SidebarContent"

// ── Group ──────────────────────────────────────────────────────────────────

// SidebarGroupContext——讓 `SidebarGroupLabel` 和 `SidebarGroupContent` 知道當前
// 所在的 group 是否 collapsible,以自動切換渲染模式(label 變 trigger,content 變
// `Collapsible.Content`)。沒有 context 就是舊行為(非 collapsible 的 plain div)。
type SidebarGroupContextValue = {
  collapsible: boolean
}
const SidebarGroupContext = React.createContext<SidebarGroupContextValue | null>(null)

function useSidebarGroup() {
  return React.useContext(SidebarGroupContext)
}

/**
 * SidebarGroup
 *
 * 預設是非互動的 plain group(div)。當 `collapsible` = true 時自動切換成 Radix
 * Collapsible:SidebarGroupLabel 變 trigger、SidebarGroupContent 變 Content、
 * 自動渲染 chevron 於 label 尾端、chevron 依 open state 旋轉。
 *
 * ── API 設計決策 ──
 * 為什麼是 group 層級的 prop 而不是 label 層級?因為「group 是否可收合」是結構層
 * 的決定,影響 group 所有子 primitive 的渲染模式(label 變 button、content 變
 * animated container)。把 prop 放在 label 上會讓 content 不知道自己該不該被包,
 * 形成跨元件的 prop drilling。放在 group 上用 context 傳遞是 React 的標準做法。
 */
const SidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    collapsible?: boolean
    defaultOpen?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }
>(({ className, collapsible = false, defaultOpen = true, open, onOpenChange, children, ...props }, ref) => {
  const contextValue = React.useMemo<SidebarGroupContextValue>(
    () => ({ collapsible }),
    [collapsible]
  )

  // 非 collapsible 就是 plain div,舊行為完全不變
  const baseClass = cn(
    "relative flex w-full min-w-0 flex-col py-2",
    "[&+&]:before:absolute [&+&]:before:top-0 [&+&]:before:left-[var(--layout-space-loose)] [&+&]:before:right-[var(--layout-space-loose)] [&+&]:before:h-px [&+&]:before:bg-divider [&+&]:before:content-['']",
    className
  )

  if (!collapsible) {
    return (
      <SidebarGroupContext.Provider value={contextValue}>
        <div ref={ref} data-sidebar="group" className={baseClass} {...props}>
          {children}
        </div>
      </SidebarGroupContext.Provider>
    )
  }

  // Collapsible 模式:Radix Collapsible.Root 當 group container
  return (
    <SidebarGroupContext.Provider value={contextValue}>
      <CollapsiblePrimitive.Root
        ref={ref}
        data-sidebar="group"
        defaultOpen={defaultOpen}
        open={open}
        onOpenChange={onOpenChange}
        className={baseClass}
        // Collapsible 在 icon 模式下整個隱藏(跟 TreeView 一樣——icon rail 沒空間放展開的 tree)
        // Consumer 若要在 icon 模式顯示整個 group,自行傳 className 覆寫
        {...(props as React.ComponentProps<typeof CollapsiblePrimitive.Root>)}
      >
        {children}
      </CollapsiblePrimitive.Root>
    </SidebarGroupContext.Provider>
  )
})
SidebarGroup.displayName = "SidebarGroup"

const SidebarGroupContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  const group = useSidebarGroup()
  if (group?.collapsible) {
    return (
      <CollapsiblePrimitive.Content
        // Radix 提供 data-state="open|closed",搭配 animate 做展開/收合動畫
        // (若之後需要,可在這個 div 上加 CSS animation)
        data-sidebar="group-content"
        className={cn("w-full overflow-hidden", className)}
        {...(props as React.ComponentProps<typeof CollapsiblePrimitive.Content>)}
      >
        <div ref={ref}>{props.children}</div>
      </CollapsiblePrimitive.Content>
    )
  }
  return (
    <div
      ref={ref}
      data-sidebar="group-content"
      className={cn("w-full", className)}
      {...props}
    />
  )
})
SidebarGroupContent.displayName = "SidebarGroupContent"

// SidebarGroupLabel — 完全對齊 MenuItem header 的視覺 + TreeView 的 sm/md/lg 尺寸:
//   - 跟 SidebarMenuButton 共用 item-layout 公式(同 py 公式、同 text size、同 icon size)
//   - 唯一差異:font-medium + text-fg-muted + pointer-events-none(header 語意)
// 這樣 label 和 items 的 row height 在任何 size 下都完全對齊。
//
// Icon 模式:整列 display:none(不是 -mt + opacity 0,避免脆弱的 margin 計算)
const sidebarGroupLabelVariants = cva(
  [
    // items-start 對齊 item-layout 規則(跟 SidebarMenuButton / TreeItem / MenuItem 一致)
    "flex w-full items-start gap-2",
    "px-[var(--layout-space-loose)]",
    "font-medium text-fg-muted",
    "cursor-default select-none pointer-events-none outline-none",
    // icon 模式:display:none 硬隱藏(跟 SidebarMenuButton label span 一致的策略)
    "group-data-[collapsible=icon]:hidden",
  ],
  {
    variants: {
      // 消費 ROW_PADDING_BY_SIZE SSOT(跟 SidebarMenuButton / MenuItem / TreeItem 一致)
      size: ROW_PADDING_BY_SIZE,
    },
    defaultVariants: { size: "md" },
  }
)

const SidebarGroupLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    asChild?: boolean
    /** ARIA label for the expand/collapse chevron (only when group is collapsible). Override for i18n. Default: 「展開或收合」 */
    toggleAriaLabel?: string
  } & VariantProps<typeof sidebarGroupLabelVariants>
>(({ className, asChild = false, size: sizeProp, children, toggleAriaLabel = '展開或收合' /* i18n-allow: DS default; consumer override via toggleAriaLabel prop */, ...props }, ref) => {
  const { size: contextSize } = useSidebar()
  const size = sizeProp ?? contextSize
  const group = useSidebarGroup()

  // Collapsible group:label 本身仍是 plain header(保留原本語意),
  // chevron 是 suffix slot 裡的 inline action button,用 Radix Collapsible.Trigger asChild
  // 包住 `ItemInlineActionButton`——視覺規格完全對齊 patterns/element-anatomy/inline-action.spec.md(Inline Action SSOT),
  // 跟 SidebarMenuButton 的 suffix inline action 同一套 canonical 實作。
  //
  // **為什麼 chevron 是 inline action 而非整個 label 是 trigger**:
  // 1. 同 sidebar 內的 inline action 視覺必須一致(fg-muted → foreground、hover bg、圓角)
  // 2. Linear / Notion / Finder 等世界級 sidebar 都是「label 裝飾、chevron 互動」
  // 3. 整個 label 當 trigger 會把 label 升格為 button,跟非 collapsible group 的 label
  //    語意不一致(一個是 div、一個是 button),無障礙與視覺焦點都會跳動
  if (group?.collapsible) {
    return (
      <div
        ref={ref}
        data-sidebar="group-label"
        role="presentation"
        className={cn(
          sidebarGroupLabelVariants({ size }),
          // Single-line group header:改用 items-center 讓 chevron button(16×16)跟 text 垂直精確置中。
          // cva base 的 `items-start` 是 multi-line safety,單行 header 用不到,明確覆寫成 center。
          "!items-center",
          className
        )}
        {...props}
      >
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {/* Chevron:inline action button,Radix Collapsible.Trigger asChild 包住,
            Radix 會 merge onClick + aria-expanded + data-state 到 button。
            ── Suffix 位置的 chevron 用 accordion 慣例 ──
            base = ChevronDown (`v`),open 時 rotate-180° → `^`。
            對齊 Radix Accordion / shadcn Collapsible / Material Expansion / Linear 的 section header。
            (Prefix 位置的 chevron 如 TreeView 才用 ChevronRight + rotate-90 的 tree disclosure 慣例) */}
        <CollapsiblePrimitive.Trigger asChild>
          <ItemInlineActionButton
            icon={ChevronDown}
            aria-label={toggleAriaLabel}
            className="pointer-events-auto ml-auto"
            iconClassName="transition-transform duration-150 motion-reduce:duration-0 [[data-state=open]_&]:rotate-180"
          />
        </CollapsiblePrimitive.Trigger>
      </div>
    )
  }

  // 非 collapsible:plain label(div,pointer-events-none)
  const Comp = asChild ? Slot : "div"
  return (
    <Comp
      ref={ref}
      data-sidebar="group-label"
      role="presentation"
      className={cn(sidebarGroupLabelVariants({ size }), className)}
      {...props}
    >
      {children}
    </Comp>
  )
})
SidebarGroupLabel.displayName = "SidebarGroupLabel"

const SidebarGroupAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      ref={ref}
      data-sidebar="group-action"
      className={cn(
        "absolute right-[var(--layout-space-loose)] top-2 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-fg-muted outline-none ring-ring transition-colors hover:bg-neutral-hover hover:text-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "after:absolute after:-inset-2 after:md:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
})
SidebarGroupAction.displayName = "SidebarGroupAction"

// ── Menu ───────────────────────────────────────────────────────────────────

// SidebarMenu — items 容器
//
// Prefix 對齊由 `SidebarProvider` 的 `uniformPrefix`(opt-in,預設 false)全域處理(school B,
// Notion/Linear 慣例):開啟後,整個 sidebar 子樹同時存在 icon 和 avatar prefix 時,自動套用
// 固定槽,跨 menu 跨 group 對齊。要啟用,在 `<SidebarProvider uniformPrefix>` 全域 opt-in
// (explicit > implicit,見 sidebar.spec.md「Sidebar 全域 prefix 對齊」段)。SidebarMenu 沒有
// per-menu 覆寫——沒有真實 use case,YAGNI。
const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu"
    // 無 gap:items 連續緊貼(對齊 DropdownMenu / TreeView 的視覺節奏)
    className={cn("flex w-full min-w-0 flex-col", className)}
    {...props}
  />
))
SidebarMenu.displayName = "SidebarMenu"

const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    data-sidebar="menu-item"
    className={cn("group/menu-item relative", className)}
    {...props}
  />
))
SidebarMenuItem.displayName = "SidebarMenuItem"

/**
 * SidebarMenuButton
 *
 * 對齊 MenuItem / TreeItem 的 item-layout,支援 sm/md/lg 三種尺寸:
 *   - horizontal: px = var(--layout-space-loose)
 *   - vertical:   py = calc((--field-height-{size} - 1lh) / 2)
 *   - typography: text-body leading-compact(sm/md)/ text-body-lg(lg)+ font-medium
 *   - icon:       size-4 (sm/md) / size-5 (lg)
 *   - hover:      bg-neutral-hover
 *   - selected:   bg-neutral-selected(data-active=true)
 *
 * Icon 模式:button 保持 w-full 填滿 sidebar icon rail,鎖高為 field-height-{size},
 * content 用 justify-center 居中,label span 以 display:none 硬隱藏。
 */
const sidebarMenuButtonVariants = cva(
  [
    "peer/menu-button group/menu-button",
    // items-start(跟 TreeItem / MenuItem 一致的 item-layout 規則):
    // 多行 label 時 prefix 留在第一行不飄移。
    // 單行 label 時(我們的預設情境,truncate = line-clamp-1),效果跟 items-center 完全相同,
    // 因為 prefix 被包在 `h-[1lh] flex items-center` 容器,強制對齊第一行文字中線。
    "flex w-full items-start gap-2 text-left overflow-hidden",
    "px-[var(--layout-space-loose)]",
    "font-medium text-fg-secondary",
    "cursor-pointer select-none outline-none",
    // 2026-05-21 v4 C* refactor(per codex M31 Layer C 比稿 final architecture):
    //   撤回所有 `group-data-[collapsible=icon]:*` overrides。Sidebar outer overflow-x:hidden
    //   自動 clip menu button 右側 label / badge / action,左側 icon 自然顯示在 sidebar-width-icon
    //   range 內。Row geometry 永遠 stable(px-loose + items-start + gap-2 + height auto),
    //   無 discrete property switch → 無 fly / 無 flutter / 無 jitter。
    //
    //   Label/badge/action 自然存在 DOM(a11y screen reader 仍讀到),只是 outer clip 視覺消失。
    //   Tooltip 仍在 collapsed state 顯示(per L1043-1055 既有 hidden 條件)。
    //
    //   對齊 MUI MiniDrawer + shadcn canonical(width morph + overflow clip + row geometry 不變)。
    "transition-[background-color,color] duration-200 ease-linear motion-reduce:duration-0",
    "hover:bg-neutral-hover hover:text-foreground",
    "focus-visible:bg-neutral-hover focus-visible:text-foreground",
    // 2026-05-31 M24:SidebarMenuButton 主要為 icon+label(currentColor 可改寫)→ 用 semantic
    // text-fg-disabled 對齊 MenuItem primitive(menu-item.tsx:198/221/248 + item-anatomy.tsx:374),
    // 非 opacity-disabled(opacity 保留給圖片/avatar/Switch 等無法改寫內部色者,per color.spec.md:103/118/701)。
    "disabled:pointer-events-none disabled:text-fg-disabled",
    "aria-disabled:pointer-events-none aria-disabled:text-fg-disabled",
    "data-[active=true]:bg-neutral-selected data-[active=true]:text-foreground",
    "group-has-[[data-sidebar=menu-action]]/menu-item:pr-8",
    // 2026-05-21 v5 restore label display:none(user 抓「label 沒消失」):
    // C* outer overflow-x:hidden 理論 clip,但 label.x=40 在 sidebar-width-icon=48 內 → 首字
    // 部分可見。display:none 是 instant 切換非 main animation,跟 C* 「不用 display:none 做主
    // 動畫」不衝突(label 不參與 width 動畫,純 final state)。對齊 shadcn canonical。
    "group-data-[collapsible=icon]:[&_[data-sidebar=menu-label]]:hidden",
    // 2026-05-22 Approach 9 — 收合時所有 prefix center 鎖回 rail center
    // (--sidebar-width-icon/2 = GlobalHeader toggle geometry SSOT)。
    // 公式: pl = (rail - prefix-width) / 2,prefix-width 由 SidebarProvider 注入的
    // --item-icon-size / --item-avatar-size CSS var(JS const mirror)提供。
    // 任何 row size(sm/md/lg)× density(md/lg)× prefix type(icon/avatar)6 cell 全對齊。
    "group-data-[collapsible=icon]:has-[[data-prefix-type=icon]]:!pl-[calc((var(--sidebar-width-icon)-var(--item-icon-size))/2)]",
    "group-data-[collapsible=icon]:has-[[data-prefix-type=avatar]]:!pl-[calc((var(--sidebar-width-icon)-var(--item-avatar-size))/2)]",
  ],
  {
    variants: {
      // size:消費 ROW_PADDING_BY_SIZE SSOT(item-anatomy.tsx)+ Sidebar-specific collapsed height
      // 前為 3 cva(menu / sidebar / tree)重複同一 py 公式,drift risk 已知。
      // 改用 shared SSOT 後 formula 改一處全同步。
      size: {
        // 2026-05-21 v4 C*:撤回 `group-data-[collapsible=icon]:!h-[...]` height lock
        // (per codex Layer C — row height 永遠 stable,collapsed 只 outer clip 視覺)
        sm: ROW_PADDING_BY_SIZE.sm,
        md: ROW_PADDING_BY_SIZE.md,
        lg: ROW_PADDING_BY_SIZE.lg,
      },
      variant: {
        /** 預設 — 導覽 item,參與 single-selection */
        default: "",
        /**
         * Meta 命令 row(例:「查看更多」「載入更多」「Show all」「+ 新增專案」)。
         *
         * 語意上**不是導覽目的地**,是 section 底部的命令。規格:
         * - 文字從 `text-fg-secondary` 退到 `text-fg-muted`(視覺重量下沉,hover 才升到 foreground)
         * - **不該參與 single-selection**:不傳 `id`,TS 階段提醒;執行階段傳了也不會 active
         * - `font-medium` 降為 `font-normal`(更輕,signal「這不是 primary 導覽」)
         * - 世界級對照:Linear "Show N more"、Notion "Show N more"、Slack "Show more"、
         *   Gmail Labels "More"
         */
        meta: [
          "font-normal text-fg-muted",
          // meta variant 不該有 active 態;即使誤傳 isActive 也不啟動
          "data-[active=true]:bg-transparent data-[active=true]:text-fg-muted",
        ],
      },
    },
    defaultVariants: { size: "md", variant: "default" },
  }
)

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentProps<"button">, "id"> & {
    asChild?: boolean
    /**
     * Item 的唯一識別(對齊 `SidebarProvider.activeId`)。**強烈建議傳**——
     * 傳了之後 `isActive` 自動從 context 算、`onClick` 自動 setActiveId,
     * 整個 sidebar 的 single-selection 自動成立,不會寫出啞 item。
     */
    id?: string
    /**
     * 手動覆寫 active 狀態(極少用)。預設從 `SidebarProvider.activeId === id` 自動算。
     * 兩者都傳時以 `isActive` 為準。
     */
    isActive?: boolean
    startIcon?: LucideIcon
    tooltip?: string | React.ComponentProps<typeof TooltipContent>
    /**
     * Suffix slot 的 inline actions(宣告式 API,對齊 patterns/element-anatomy/inline-action.spec.md)。
     * Host 自動用 `<ItemInlineAction>` 渲染,consumer 只宣告 intent。
     * Icon 模式下自動隱藏。
     */
    inlineActions?: InlineActionConfig[]
    /**
     * 右側 actions slot(ReactNode)— escape hatch 供 consumer 放自訂元素
     * (如 DropdownMenu trigger / 自訂 popover trigger / 多 tier 動作)。
     *
     * 跟 `inlineActions` 互斥(同時傳 `inlineActionsSlot` 會優先,`inlineActions` 被忽略)。
     * 規則對齊 Input.endSlot canonical:90% case 用 `inlineActions` 宣告式 API,
     * 10% config 表達不出時走 slot。
     *
     * Padding budget:slot mode 預留 1 icon 寬度的 paddingRight(覆寫多 icon 寬度需 consumer 自控 className)。
     * Reveal / collapsed-hide / 絕對定位 chrome 跟 inlineActions 共用,consumer 不需重做。
     */
    inlineActionsSlot?: React.ReactNode
    /**
     * Inline actions 的顯示模式:
     * - `false`(預設):永遠顯示
     * - `"hover"`:row hover 時才淡入(TreeView 模式)
     */
    actionsReveal?: false | "hover"
  } & VariantProps<typeof sidebarMenuButtonVariants>
>(
  (
    {
      asChild = false,
      id,
      isActive: isActiveProp,
      size: sizeProp,
      variant = "default",
      startIcon: StartIcon,
      tooltip,
      inlineActions,
      inlineActionsSlot,
      actionsReveal = false,
      className,
      children,
      onClick,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button"
    // 沒傳 size 就從 SidebarProvider context 繼承(預設 md)
    const { isMobile, state, size: contextSize, activeId, setActiveId } = useSidebar()
    const size = sizeProp ?? contextSize

    // Meta variant 永不參與 single-selection,即使誤傳 id / isActive
    const isMeta = variant === "meta"

    // Active 狀態:明確傳的 isActive 優先;否則 `activeId === id` 自動算
    // Meta variant 永遠 false
    const isActive = isMeta ? false : (isActiveProp ?? (id !== undefined && activeId === id))

    // Click handler:id 存在且非 meta 才 setActiveId(single-selection 自動建立),
    // 同時呼叫 consumer 傳入的 onClick
    // code-quality-allow: long-function — helper fn 結構緊密,拆 sub-fn 會跨 fn 傳 state 反而複雜
    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!isMeta && id !== undefined) setActiveId(id)
        onClick?.(e)
      },
      [isMeta, id, setActiveId, onClick]
    )

    // asChild 時,我們不能額外 wrap span / icon——Slot 要求單一 child。
    // 所以 asChild 的 consumer 自行放 icon + label(記得 prefix 要包在 h-[1lh] 容器,
    // label span 要有 data-sidebar="menu-label" attribute 才能參與 icon 模式自動隱藏)。
    //
    // Label span 在 icon 模式下透過 cva base 的 `[&_[data-sidebar=menu-label]]:hidden` display:none,
    // 這樣 flex 只剩 icon 一個 child,justify-center 可以真正置中。
    // Sidebar 寬度 transition 200ms 是唯一持續動畫,使用者視線跟著寬度走,不會察覺 label 的瞬切。
    // 用 `<ItemIcon>` / `<ItemLabel>` helper,**不直接寫 ItemPrefix wrap StartIcon**——
    // ItemIcon 內部會自動加 `data-prefix-type="icon"`,讓 SidebarProvider 的全域
    // `:has()` prefix-mix 偵測能命中。直接用 ItemPrefix 就會錯過這個 tag,
    // 全域對齊功能對 SidebarMenuButton 路徑失效(曾經發生過的 bug)。
    const content = asChild ? (
      children
    ) : (
      <>
        {StartIcon && <ItemIcon icon={StartIcon} />}
        <ItemLabel>{children}</ItemLabel>
      </>
    )

    const hasSlot = !!inlineActionsSlot
    // Host disabled 時 inline actions(config + slot)整段不渲染,paddingRight 預留一併取消
    // (inline-action.spec.md「宿主 disabled 時不渲染」+ sidebar.spec.md「Host disabled 時|不渲染」)。
    // 必須 render 層 guard:suffix 跟 button 是 sibling(避免巢狀 button),
    // native disabled 的 pointer-events-none 蓋不到 sibling,CSS 層無從繼承。
    // aria-disabled 同步 guard——對齊 cva `aria-disabled:` 樣式支線(asChild 非 button host 自傳)。
    const isDisabled =
      !!props.disabled || props["aria-disabled"] === true || props["aria-disabled"] === "true"
    const hasActions = !isDisabled && (hasSlot || (!!inlineActions && inlineActions.length > 0))

    // 計算 suffix 所佔寬度:N×icon + (N-1)×gap-2(8px),再加 gap-2 跟 label 之間的間隔
    // Slot mode 預設按 1 icon 預留(consumer 寬度自控)
    const iconSz = ICON_SIZE[size ?? "md"]
    const n = hasSlot ? 1 : (inlineActions?.length ?? 0)
    const suffixContentWidth = n > 0 ? n * iconSz + (n - 1) * 8 : 0
    // Button 的 paddingRight = loose + suffix 寬度 + gap-2
    // 用 CSS calc 表達 loose token,不硬寫 px(loose 會隨 density 變)
    const buttonPaddingRight = hasActions
      ? `calc(var(--layout-space-loose) + ${suffixContentWidth}px + 0.5rem)`
      : undefined

    const button = (
      <Comp
        ref={ref}
        data-sidebar="menu-button"
        data-active={isActive}
        className={cn(sidebarMenuButtonVariants({ size, variant }), className)}
        style={hasActions ? { paddingRight: buttonPaddingRight } : undefined}
        onClick={handleClick}
        {...props}
      >
        {content}
      </Comp>
    )

    // Suffix inline actions——絕對定位在 menu-item 右邊,
    // 跟 button 同層(不是 button 的 child,避免巢狀 button)。
    const suffixNode = hasActions ? (
      <span
        data-sidebar="menu-inline-actions"
        className={cn(
          "absolute top-1/2 -translate-y-1/2 flex items-center gap-2",
          "right-[var(--layout-space-loose)]",
          // Icon 模式隱藏(跟 SidebarMenuBadge / SidebarMenuAction 一致)
          "group-data-[collapsible=icon]:hidden",
          // hover-reveal:滑鼠 hover 或鍵盤 focus(但不是 mouse click 的 focus)時顯示。
          // 用 `:has(:focus-visible)` 而非 `:focus-within`——focus-within 會被
          // mouse click 觸發,導致 click 之後 actions 永久顯示直到焦點移走;
          // focus-visible 只在鍵盤 tab 時啟動,mouse click 不會觸發,符合使用者直覺。
          actionsReveal === "hover" &&
            "opacity-0 group-hover/menu-item:opacity-100 group-has-[:focus-visible]/menu-item:opacity-100 transition-opacity duration-150"
        )}
      >
        {hasSlot
          ? inlineActionsSlot
          : inlineActions!.map((action, i) => (
              <ItemInlineAction key={action.label + i} action={action} />
            ))}
      </span>
    ) : null

    // code-quality-allow: long-function — helper fn 結構緊密,拆 sub-fn 會跨 fn 傳 state 反而複雜
    const buttonWithTooltip = tooltip ? (
      (() => {
        const tooltipProps =
          typeof tooltip === "string" ? { children: tooltip } : tooltip
        return (
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent
              side="right"
              align="center"
              hidden={state !== "collapsed" || isMobile}
              {...tooltipProps}
            />
          </Tooltip>
        )
      })()
    ) : (
      button
    )

    if (!suffixNode) return buttonWithTooltip
    return (
      <>
        {buttonWithTooltip}
        {suffixNode}
      </>
    )
  }
)
SidebarMenuButton.displayName = "SidebarMenuButton"

const SidebarMenuAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean
    showOnHover?: boolean
  }
>(({ className, asChild = false, showOnHover = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      ref={ref}
      data-sidebar="menu-action"
      className={cn(
        "absolute right-[var(--layout-space-loose)] top-1/2 -translate-y-1/2 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-fg-muted outline-none ring-ring transition-colors hover:bg-neutral-hover hover:text-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "after:absolute after:-inset-2 after:md:hidden",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-foreground md:opacity-0",
        className
      )}
      {...props}
    />
  )
})
SidebarMenuAction.displayName = "SidebarMenuAction"

// SidebarMenuBadge — 重用專案的 Badge 元件,絕對定位在 menu item 右側
// Consumer 傳入 Badge 的所有 props(count / variant / max 等)
const SidebarMenuBadge = React.forwardRef<
  React.ElementRef<typeof Badge>,
  React.ComponentProps<typeof Badge>
>(({ className, ...props }, ref) => (
  <Badge
    ref={ref}
    data-sidebar="menu-badge"
    className={cn(
      "pointer-events-none absolute right-[var(--layout-space-loose)] top-1/2 -translate-y-1/2",
      "group-data-[collapsible=icon]:hidden",
      className
    )}
    {...props}
  />
))
SidebarMenuBadge.displayName = "SidebarMenuBadge"

// SidebarMenuSkeleton — 對齊 SidebarMenuButton 的 item-layout 公式,支援 sm/md/lg
// 沒傳 size 就從 context 繼承,確保 loading 狀態跟實際 item 同高不跳動
const sidebarMenuSkeletonVariants = cva(
  [
    "flex items-start gap-2",
    "px-[var(--layout-space-loose)]",
  ],
  {
    variants: {
      // 消費 ROW_PADDING_BY_SIZE SSOT + skeleton-icon size modifier(Sidebar-specific)
      // 注:skeleton 無文字,typography class 雖被帶入但無害,保持公式一處同步
      size: {
        sm: [ROW_PADDING_BY_SIZE.sm, "[&>[data-sidebar=menu-skeleton-icon]]:size-4"],
        md: [ROW_PADDING_BY_SIZE.md, "[&>[data-sidebar=menu-skeleton-icon]]:size-4"],
        lg: [ROW_PADDING_BY_SIZE.lg, "[&>[data-sidebar=menu-skeleton-icon]]:size-5"],
      },
    },
    defaultVariants: { size: "md" },
  }
)

const SidebarMenuSkeleton = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    showIcon?: boolean
  } & VariantProps<typeof sidebarMenuSkeletonVariants>
>(({ className, showIcon = false, size: sizeProp, ...props }, ref) => {
  const { size: contextSize } = useSidebar()
  const size = sizeProp ?? contextSize
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`
  }, [])

  return (
    <div
      ref={ref}
      data-sidebar="menu-skeleton"
      className={cn(sidebarMenuSkeletonVariants({ size }), className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="rounded-md shrink-0"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 max-w-[var(--skeleton-width)] flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  )
})
SidebarMenuSkeleton.displayName = "SidebarMenuSkeleton"

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const sidebarMeta = {
  component: 'Sidebar',
  family: null, // non-family composite / overlay / layout
  variants: {
    default: { when: '標準導覽 row,參與 single-selection' },
    meta: { when: 'Section 底部命令 row(Show more / 新增),不參與 selection' },
  },
  sizes: {
    sm: { px: 28, when: '次導覽 / 設定頁 / 緊湊空間' },
    md: { px: 32, when: '預設 — 應用程式主導覽' },
    lg: { px: 36, when: '重要主導覽 / icon-prominent workspace switcher' },
  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-neutral-hover', 'bg-surface', 'bg-transparent'],
    fg: ['text-fg-muted', 'text-fg-secondary', 'text-foreground'],
    ring: ['ring-ring'],
  },
  defaultSize: 'md',
} as const

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}

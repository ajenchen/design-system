// @benchmark-cited: 2026-05-19 — Mantine AppShell / Ant Layout / Material 3 Drawer / Atlassian Navigation System cite in app-shell.spec.md frontmatter.
/**
 * AppShell — web service page-level layout primitive。
 *
 * 組合 Sidebar + ChromeHeader + Aside + main 成完整 page shell。SSOT 邊界:本 pattern only
 * own slot composition + layout mode + Aside responsive mode;不 own sidebar / header /
 * sheet 視覺(各自 spec own)。
 *
 * 對齊 Mantine AppShell compound API + Ant Layout slot 模式 + Material 3 standard/modal
 * drawer canonical(per spec.md frontmatter cite)。
 *
 * Spec SSOT:`patterns/app-shell/app-shell.spec.md`
 */

import * as React from 'react'
import { X as XIcon } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/design-system/components/Sheet/sheet'
import { Button } from '@/design-system/components/Button/button'
import { ScrollArea } from '@/design-system/components/ScrollArea/scroll-area'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'
import { useIsNarrowViewport } from '@/design-system/hooks/use-is-narrow-viewport'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

type AppShellLayout = 'primary-sidebar' | 'primary-header'

export interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** primary-sidebar (Linear/Notion 派) | primary-header (GitHub/Slack 派);預設 primary-sidebar */
  layout?: AppShellLayout
  /** Sidebar 元素(必傳 Sidebar primitive,per Consumer 紀律)*/
  sidebar?: React.ReactNode
  /**
   * Local page header(永遠 render 在 main column 頂部,當前頁 actions / breadcrumb / page-level filter)。
   * 兩 layout mode 都會 render 此 slot — `primary-header` mode 多了 globalHeader 在上方,
   * **不取代** local header(per 2026-05-20 user clarification「primary-header = primary-sidebar + 一條 global header」)。
   */
  header?: React.ReactNode
  /**
   * Global header(僅 `primary-header` mode render)。橫跨整 viewport 的頂部 bar:
   * account avatar / workspace switcher / global search / notifications。
   * 對齊 GitHub top nav / Slack workspace bar / Gmail logo bar 慣例。
   * `primary-sidebar` mode 傳此 prop 會被忽略。
   */
  globalHeader?: React.ReactNode
  /** Aside 元素(`<AppShellAside>` sub-component);可選 */
  aside?: React.ReactNode
  /** Aside open state(modal mode 必須)*/
  asideOpen?: boolean
  onAsideOpenChange?: (open: boolean) => void
  /** Main content;`<main>` landmark + padding=0 */
  children: React.ReactNode
}

export interface AppShellAsideProps {
  /** Required:modal mode 走 Sheet → aria-labelledby 強制,per sheet.spec.md:98 */
  title: string
  /** Width(number 或 breakpoint-keyed object);clamp min:240 max:640 */
  width?: number | { md?: number; xl?: number }
  /** Children content */
  children: React.ReactNode
  className?: string
}

// ── Context ──────────────────────────────────────────────────────────────────

interface AppShellContextValue {
  layout: AppShellLayout
  asideOpen: boolean
  setAsideOpen: (open: boolean) => void
  isMobile: boolean
}

const AppShellContext = React.createContext<AppShellContextValue | null>(null)

function useAppShell(): AppShellContextValue {
  const ctx = React.useContext(AppShellContext)
  if (!ctx) throw new Error('AppShellAside must be used within <AppShell>')
  return ctx
}

// Mobile breakpoint:**消費既有 `useIsNarrowViewport`**(`hooks/use-is-narrow-viewport.ts` SSOT,
// 768px,跟 Sidebar SSOT 同源)— 不發明 local hook,per codex Layer B D2/D4 verdict 避 drift。

// xl breakpoint(對齊 Tailwind v4 xl = 1280px,DS-wide consensus)
const XL_BREAKPOINT_PX = 1280

function useIsXl(): boolean {
  const [isXl, setIsXl] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(`(min-width: ${XL_BREAKPOINT_PX}px)`).matches
  })

  React.useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${XL_BREAKPOINT_PX}px)`)
    const handler = (e: MediaQueryListEvent) => setIsXl(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isXl
}

// ── Width resolve(consumer 自傳 + clamp 240-640)──────────────────────────────

const ASIDE_WIDTH_MIN = 240
const ASIDE_WIDTH_MAX = 640
const ASIDE_WIDTH_DEFAULT = 320

function resolveAsideWidth(width: AppShellAsideProps['width'], isXl: boolean): number {
  if (typeof width === 'number') {
    return Math.max(ASIDE_WIDTH_MIN, Math.min(ASIDE_WIDTH_MAX, width))
  }
  if (width && typeof width === 'object') {
    // breakpoint-keyed:xl viewport(≥1280px)用 xl,否則 md
    const v = (isXl ? width.xl ?? width.md : width.md) ?? ASIDE_WIDTH_DEFAULT
    return Math.max(ASIDE_WIDTH_MIN, Math.min(ASIDE_WIDTH_MAX, v))
  }
  return ASIDE_WIDTH_DEFAULT
}

// ── Skip-to-main link(a11y WCAG 2.4.1)───────────────────────────────────────

function SkipToMain() {
  return (
    <a
      href="#app-shell-main"
      className={cn(
        'sr-only focus:not-sr-only',
        'focus:fixed focus:top-2 focus:left-2 focus:z-50',
        'focus:px-3 focus:py-2 focus:rounded-md',
        'focus:bg-surface focus:text-foreground focus:shadow-[var(--elevation-200)]',
        'focus:outline-none focus:ring-2 focus:ring-primary'
      )}
    >
      Skip to main content
    </a>
  )
}

// ── AppShell root ────────────────────────────────────────────────────────────

const AppShell = React.forwardRef<HTMLDivElement, AppShellProps>(
  (
    {
      layout = 'primary-sidebar',
      sidebar,
      header,
      globalHeader,
      aside,
      asideOpen: asideOpenProp,
      onAsideOpenChange,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const [asideOpenInternal, setAsideOpenInternal] = React.useState(false)
    const isControlled = asideOpenProp !== undefined
    const asideOpen = isControlled ? asideOpenProp : asideOpenInternal

    const setAsideOpen = React.useCallback(
      (open: boolean) => {
        if (!isControlled) setAsideOpenInternal(open)
        onAsideOpenChange?.(open)
      },
      [isControlled, onAsideOpenChange]
    )

    const isMobile = useIsNarrowViewport()

    // ── Keyboard: cmd+. toggle aside ──
    // ⌘B sidebar toggle by Sidebar SSOT(本 component 不重覆 register)
    React.useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === '.' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          setAsideOpen(!asideOpen)
        }
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [asideOpen, setAsideOpen])

    const ctxValue = React.useMemo<AppShellContextValue>(
      () => ({ layout, asideOpen, setAsideOpen, isMobile }),
      [layout, asideOpen, setAsideOpen, isMobile]
    )

    // ── Layout grid(2 mode)──
    // primary-sidebar:
    //   row1: [sidebar (頂天)][main col (header + main)][aside (頂天)]
    // primary-header:
    //   row1: [header (橫跨整 viewport, banner role)]
    //   row2: [sidebar][main][aside]

    // AppShellAside 自決 inline vs modal mode(via AppShellContext.isMobile)。
    // AppShell 一律只 render `{aside}` 一次,AppShellAside 內部根據 isMobile 決定 render 形式。

    if (layout === 'primary-header') {
      // primary-header layout(2026-05-21 v2 — user clarification「primary-header = primary-sidebar + 一條 global header」):
      // 結構:row1 globalHeader(全寬 global bar)/ row2 [sidebar][main col: localHeader + main][aside]
      // - globalHeader = 跨頁 account / workspace switcher / notifications(對齊 GitHub top nav / Slack workspace bar)
      // - header = local page header,**仍存在**(per page actions / breadcrumb,對齊 GitHub repo header / Slack channel header / Gmail email-list toolbar 2-layer 慣例)
      // Consumer 必傳 `<Sidebar viewportInsetTop="var(--chrome-header-height)">` 讓 sidebar 從 globalHeader 下方起算。
      return (
        <AppShellContext.Provider value={ctxValue}>
          <div
            ref={ref}
            className={cn('flex h-svh w-full flex-col overflow-hidden bg-canvas', className)}
            {...props}
          >
            <SkipToMain />
            {/* Row 1:Global header(account / workspace switcher / notifications,橫跨整 viewport)*/}
            {globalHeader && <div className="flex-shrink-0">{globalHeader}</div>}
            {/* Row 2:[sidebar][main col][aside]horizontal row */}
            <div className="flex flex-1 min-h-0 w-full">
              {sidebar}
              {/* Main column:local header + main content(per user model「primary-header = primary-sidebar + global header」)*/}
              <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
                {header && <div className="flex-shrink-0">{header}</div>}
                <main
                  id="app-shell-main"
                  tabIndex={-1}
                  className="flex-1 min-w-0 min-h-0 overflow-y-auto focus:outline-none"
                >
                  {children}
                </main>
              </div>
              {aside}
            </div>
          </div>
        </AppShellContext.Provider>
      )
    }

    // primary-sidebar layout
    return (
      <AppShellContext.Provider value={ctxValue}>
        <div
          ref={ref}
          className={cn('flex h-svh w-full overflow-hidden bg-canvas', className)}
          {...props}
        >
          <SkipToMain />
          {/* Sidebar — 頂天 */}
          {sidebar}
          {/* Main column(header + main 垂直堆)*/}
          <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
            {header && (
              // Header 在 main column 內(main col sibling,非 main descendant)。ChromeHeader 自
              // 2026-05-20 起 render `<header>`(chrome-header.tsx);依 W3C HTML-AAM,`<div>` wrapper
              // 不 scope out banner(只有 main/article/aside/nav/section 能)→ 仍得 implicit banner ✓
              // (對齊 app-shell.spec.md「W3C ARIA in HTML banner rule」段)。
              <div className="flex-shrink-0">{header}</div>
            )}
            <main
              id="app-shell-main"
              tabIndex={-1}
              className="flex-1 min-h-0 overflow-y-auto focus:outline-none"
            >
              {children}
            </main>
          </div>
          {/* Aside slot — desktop inline OR mobile Sheet,內部自決 */}
          {aside}
        </div>
      </AppShellContext.Provider>
    )
  }
)
AppShell.displayName = 'AppShell'

// ── AppShellAside sub-component ──────────────────────────────────────────────

/**
 * AppShellAside — right panel:standard inline(desktop) vs modal overlay(mobile)。
 *
 * Desktop(viewport ≥ 768px):
 *   - Render 直接放 layout grid 右側(asideOpen=true 才 mount,close hide via parent)
 *   - 不蓋 mask / background 可操作 / 佔 layout 寬
 *   - Vertical extent:primary-sidebar → 頂天立地 / primary-header → header 下方
 *
 * Mobile(viewport < 768px):
 *   - Render 走 Sheet primitive(side="right",per sheet.spec.md)
 *   - Mask 蓋 / background 不可操作 / 不佔 layout 寬
 *   - title 強制(aria-labelledby per sheet.spec.md:98)
 */
const AppShellAside = React.forwardRef<HTMLElement, AppShellAsideProps>(
  ({ title, width, children, className }, ref) => {
    const { asideOpen, setAsideOpen, isMobile } = useAppShell()
    const isXl = useIsXl()
    const resolvedWidth = resolveAsideWidth(width, isXl)

    // Shared frame:always-on header(title + close X)+ body(ScrollArea + layoutSpace 規則 1B 父層 padding)
    // 對齊 codex Layer B 2026-05-20「container mode 可變,panel role/content 不該變」+ Notion/Figma right
    // panel 共識(modal vs inline 結構相同,host wrapper 不同)。
    // 2026-05-20 migrate 消費 ChromeHeader primitive(撤回自刻 + 撤回 bg-surface 疊加 — 對齊
    // `header-canonical.spec.md`「6. Background ownership」段「Nested chrome header 透明繼承
    // parent」:aside container 自身已 bg-surface,內 header 不該再畫 bg 避免疊加 drift)。
    // titleNode 依 mode 不同:modal(Sheet)用 SheetTitle 綁 Radix Dialog titleId — 否則
    // SheetContent 的 aria-labelledby 指向不存在的 id → SR 念「unnamed dialog」+ Radix
    // TitleWarning console.error(違 sheet.spec.md:98「Sheet content 必有可見 title」)。
    // inline(aside)用純 <h2>:aside 自身已 aria-label={title},且無 Dialog context 不可用 SheetTitle。
    const renderFrame = (titleNode: React.ReactNode) => (
      <>
        <ChromeHeader>
          {titleNode}
          <Button
            iconOnly
            dismiss
            size="sm"
            startIcon={XIcon}
            aria-label="關閉"
            onClick={() => setAsideOpen(false)}
          />
        </ChromeHeader>
        <ScrollArea className="flex-1 min-h-0">
          {children}
        </ScrollArea>
      </>
    )

    // Modal mode(mobile)— Sheet from right
    if (isMobile) {
      return (
        <Sheet open={asideOpen} onOpenChange={setAsideOpen}>
          <SheetContent
            side="right"
            className="w-[min(90vw,var(--app-shell-aside-modal-width))] flex flex-col p-0 [&>button]:hidden"
            style={{ ['--app-shell-aside-modal-width' as string]: `${resolvedWidth}px` }}
          >
            {renderFrame(<SheetTitle className="flex-1">{title}</SheetTitle>)}
          </SheetContent>
        </Sheet>
      )
    }

    // Standard inline mode(desktop)
    if (!asideOpen) return null

    return (
      <aside
        ref={ref}
        aria-label={title}
        className={cn(
          'flex flex-col h-full min-h-0 overflow-hidden',
          'bg-surface border-l border-divider',
          className
        )}
        style={{ width: resolvedWidth }}
      >
        {renderFrame(<h2 className="text-body-lg font-medium flex-1 truncate">{title}</h2>)}
      </aside>
    )
  }
)
AppShellAside.displayName = 'AppShellAside'

// ── Exports ──────────────────────────────────────────────────────────────────

// code-quality-allow: dead-export useAppShell — public compound API hook(consumer 可自拼 custom aside layout,
// 對齊 Radix `useDialogContext` / MUI `useFormControl` 慣例)。內部 AppShellAside 已消費(L294),
// audit script 抓「無 cross-file import」是 false positive(2026-05-21 D2 codify)。
export { AppShell, AppShellAside, useAppShell }

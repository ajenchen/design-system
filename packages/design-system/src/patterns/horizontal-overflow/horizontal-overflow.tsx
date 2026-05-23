/**
 * @internal — DS-internal primitive module(2026-05-23 per `.claude/rules/ui-development.md` Public vs Internal canonical)。
 * end-user app 直接 import 無 functioning UI;由 Tabs / ChipGroup 等 DS 元件 wrap 消費 hook + helper components。
 */
// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/design-system/components/Button/button'
import {
  useScrollEdges,
  useOverflowIndices,
} from '@/design-system/hooks/use-overflow-items'

/**
 * Horizontal Overflow — canonical primitives + helpers
 *
 * 詳細設計原則與消費規則見 `horizontal-overflow.spec.md`。
 *
 * ── 核心規則 ──
 * 所有 horizontal overflow 的 affordance 一律是 `<Button variant="text" size="sm" iconOnly>`。
 * 無論內容是 Tab / Chip / Step / SegmentedControl item,overflow trigger 永遠同一套。
 * 這是工具層,跟業務層(內容)解耦,不該跟內容爭視覺重量。
 *
 * ── 為什麼存在 ──
 * 過去 Tabs 和 Chip 兩邊各自 copy-paste `ScrollArrow` / `buildFadeMask` / 常數,
 * 導致 Chip menu trigger 漂移成 chip-shape(違反 mental model)。本 module 是
 * single source of truth,消除複製帶來的漂移空間。
 */

// ── Constants ─────────────────────────────────────────────────────────────

/** Fade mask 漸變寬度(px)*/
// code-quality-allow: dead-export — public constant — DS API surface,consumer 可引(即使當前 internal-only)
export const FADE_WIDTH = 16

/**
 * Scroll arrow 預留的按鈕區寬度(px)。
 * 值對齊 `field-height-sm` 在 lg density 下的最大值(32px),確保 arrow button
 * 在任何 density 都能完整容納 Button text sm iconOnly。
 */
export const ARROW_BUTTON_WIDTH = 32

/** 點一次 scroll arrow 滑動 80% 容器寬度 */
// code-quality-allow: dead-export — public constant — DS API surface,consumer 可引(即使當前 internal-only)
export const SCROLL_PAGE_RATIO = 0.8

// ── Helpers ───────────────────────────────────────────────────────────────

interface BuildFadeMaskArgs {
  canScroll: boolean
  atStart: boolean
  atEnd: boolean
  /**
   * 預留給 scroll arrow button 的寬度(px)。
   * - Scroll 模式:傳 `ARROW_BUTTON_WIDTH`,fade 會延伸到 arrow 底下,
   *   避免「透明 button icon 跟 item 文字視覺打架」(Material 3 scrim 原理)
   * - Menu 模式:傳 0,沒有 arrow,fade 直接從容器邊緣開始
   */
  reserveArrowWidth?: number
}

/**
 * 計算 fade mask 的 `linear-gradient` 字串。
 *
 * 回傳 `undefined` 時代表「不需要 mask」(內容沒溢出),消費者該讓 `maskImage`
 * 等於 undefined 讓 CSS 恢復正常渲染。
 */
export function buildFadeMask({
  canScroll,
  atStart,
  atEnd,
  reserveArrowWidth = 0,
}: BuildFadeMaskArgs): string | undefined {
  if (!canScroll) return undefined
  const stops: string[] = []
  if (!atStart) {
    if (reserveArrowWidth > 0) {
      stops.push('transparent 0')
      stops.push(`transparent ${reserveArrowWidth}px`)
      stops.push(`black ${reserveArrowWidth + FADE_WIDTH}px`)
    } else {
      stops.push('transparent 0')
      stops.push(`black ${FADE_WIDTH}px`)
    }
  } else {
    stops.push('black 0')
  }
  if (!atEnd) {
    if (reserveArrowWidth > 0) {
      stops.push(`black calc(100% - ${reserveArrowWidth + FADE_WIDTH}px)`)
      stops.push(`transparent calc(100% - ${reserveArrowWidth}px)`)
      stops.push('transparent 100%')
    } else {
      stops.push(`black calc(100% - ${FADE_WIDTH}px)`)
      stops.push('transparent 100%')
    }
  } else {
    stops.push('black 100%')
  }
  return `linear-gradient(to right, ${stops.join(', ')})`
}

/**
 * Scroll by page helper。接收 scrollRef 回傳一個 `scrollByPage(direction)` 函式,
 * 呼叫後以 smooth 動畫橫向滑動 `clientWidth × SCROLL_PAGE_RATIO`。
 *
 * 使用 useCallback 並以 scrollRef 為 dependency,確保消費者可以安全把回傳函式
 * 傳給 `<OverflowScrollArrow onClick>`。
 */
export function useScrollByPage<T extends HTMLElement>(
  scrollRef: React.RefObject<T | null>,
): (direction: 'left' | 'right') => void {
  return React.useCallback(
    (direction: 'left' | 'right') => {
      const el = scrollRef.current
      if (!el) return
      el.scrollBy({
        left: el.clientWidth * SCROLL_PAGE_RATIO * (direction === 'left' ? -1 : 1),
        behavior: 'smooth',
      })
    },
    [scrollRef],
  )
}

// ── Primitives ────────────────────────────────────────────────────────────

export interface OverflowScrollArrowProps {
  direction: 'left' | 'right'
  onClick: () => void
  /**
   * 覆寫 aria-label(預設為「向左捲動」/「向右捲動」)。
   * 一般情況不需要傳——預設繁中 label 對所有水平捲動情境都成立。
   */
  'aria-label'?: string
}

/**
 * Scroll arrow button — canonical horizontal overflow affordance。
 *
 * **絕對定位**在容器的 `left-0` / `right-0`,使用 `pointer-events-none` 外層 +
 * `pointer-events-auto` 內層,讓 fade mask 下方仍可橫向滑動(arrow 只接受點
 * 自身的 click)。
 *
 * Root 是 `<Button variant="text" size="sm" iconOnly>`——跟 Tabs / Chip /
 * 未來所有消費者共用同一個按鈕視覺。
 */
export const OverflowScrollArrow: React.FC<OverflowScrollArrowProps> = ({
  direction,
  onClick,
  'aria-label': ariaLabel,
}) => {
  const defaultLabel = direction === 'left' ? '向左捲動' : '向右捲動' // i18n-allow: DS default; consumer override via aria-label prop
  return (
    <div
      className={cn(
        'absolute top-0 bottom-0 flex items-center pointer-events-none z-10',
        direction === 'left' ? 'left-0' : 'right-0',
      )}
    >
      <div className="pointer-events-auto">
        <Button
          variant="text"
          size="sm"
          iconOnly
          startIcon={direction === 'left' ? ChevronLeft : ChevronRight}
          aria-label={ariaLabel ?? defaultLabel}
          onClick={onClick}
        />
      </div>
    </div>
  )
}

export interface OverflowMenuTriggerButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /**
   * Accessible label。消費者應傳入有語境的 label,例如
   * `"頁籤選單(共 5 個)"` 或 `"分類選單(共 8 個)"`。必填。
   */
  'aria-label': string
}

/**
 * Menu trigger button — canonical overflow menu affordance。
 *
 * Root 是 `<Button variant="text" size="sm" iconOnly startIcon={ChevronDown}>`。
 * **forwardRef + props spread** 讓 Radix `<DropdownMenuTrigger asChild>` 可以
 * 接管 onClick / aria-expanded / data-state 等 attributes。
 *
 * ── 為什麼不包 DropdownMenu ──
 * Menu 的內容(items)取決於消費者的資料結構(Tab 用 DropdownMenuItem + selected,
 * Chip 用 DropdownMenuCheckboxItem),所以只提供 trigger button,消費者自己
 * 把 `<DropdownMenu> <DropdownMenuTrigger asChild> <OverflowMenuTriggerButton /> ... </DropdownMenu>`
 * 串起來。
 */
export const OverflowMenuTriggerButton = React.forwardRef<
  HTMLButtonElement,
  OverflowMenuTriggerButtonProps
>(({ 'aria-label': ariaLabel, ...props }, ref) => (
  <Button
    ref={ref}
    variant="text"
    size="sm"
    iconOnly
    startIcon={ChevronDown}
    aria-label={ariaLabel}
    {...props}
  />
))
OverflowMenuTriggerButton.displayName = 'OverflowMenuTriggerButton'

// ── Hook re-exports ──────────────────────────────────────────────────────
// 讓消費者只從本 module import 所有 overflow 相關的 API。

export { useScrollEdges, useOverflowIndices }

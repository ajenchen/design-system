/**
 * @internal — DS-internal primitive module(2026-05-23 per `packages/design-system/ds-canonical/rules/ui-development.md` Public vs Internal canonical)。
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
/** 箭頭翻頁發在捲動容器上的事件:使用者自己捲的(useRevealSelected 據此不在尺寸改變時搶回位置)。閘 overflow-reveal-selected 的揭露探針也認這個名字(對照組 mute-user-scroll,以及 U1 / U2 確認使用者的捲動訊號有送到的那一步);改名要一起改閘。 */
const OVERFLOW_USER_SCROLL_EVENT = 'ds-overflow-user-scroll'

export function useScrollByPage<T extends HTMLElement>(
  scrollRef: React.RefObject<T | null>,
): (direction: 'left' | 'right') => void {
  return React.useCallback(
    (direction: 'left' | 'right') => {
      const el = scrollRef.current
      if (!el) return
      // 告訴同一排的 useRevealSelected「這是使用者自己捲的」(尺寸改變時不搶回;2026-11-12)
      el.dispatchEvent(new Event(OVERFLOW_USER_SCROLL_EVENT))
      el.scrollBy({
        left: el.clientWidth * SCROLL_PAGE_RATIO * (direction === 'left' ? -1 : 1),
        behavior: 'smooth',
      })
    },
    [scrollRef],
  )
}

// ── 選到就露出來(reveal-selected)────────────────────────────────────────
//
// 契約 SSOT = horizontal-overflow.spec.md「選到就露出來」。對齊方式 B:一律把目標項置中,兩端到底時夾住(不留空白)。
// user 2026-11-11(逐字):「Chip 的問題確保有找到root cause，並修 root cause，然後我覺得 B比較好吧？」、
// 「「我建議 A。你還是想要 B 也完全可以，根因的修法三種都一樣。」都先B」。
//
// 根因(2026-11-11 研究,MASTER-TODO 11-11):捲動原本只寫在 Chip / Tabs 的 ⌄ 選單處理程式裡(requestAnimationFrame + scrollIntoView),
// 直接點擊走 Radix Toggle / Tabs Trigger、方向鍵靠瀏覽器 focus(Chromium 對水平「部分可見」的項目不捲),兩條路都沒有揭露;
// 這個模組也沒有「選到就露出來」的 primitive 與契約 → 各消費者各寫各的(縮圖列另一份 scrollIntoView)。
// 現在揭露只住這裡:消費者宣告「哪些元素是項目、選中寫在哪個屬性」,觸發來源不再分滑鼠 / 鍵盤 / 選單 / 程式。

/**
 * 揭露目標的捲動位置(純函式;閘 `scripts/overflow-reveal-selected-invariant.mjs` 量的就是它的結果)。
 * - 置中:項目中心對齊容器可視寬的中心;
 * - 夾住:算出來 < 0 或 > 最大捲動量時夾到兩端(到底時不留空白,此時項目落在靠那一端的半邊);
 * - 項目比「扣掉兩側遮擋後的可讀寬」還寬(置中也會被兩側箭頭 + 淡出切掉):改把開頭對齊左側可讀邊 ——【AI 推導】
 *   置中時兩頭都被切,對齊開頭至少讀得到標籤的開頭;實際 DS 內沒有這麼寬的項目(邊界保護,不是常態路徑)。
 */
export function computeRevealScrollLeft({
  itemStart,
  itemWidth,
  clientWidth,
  scrollWidth,
  obstruction,
}: {
  /** 項目在捲動內容座標系的左緣(px) */
  itemStart: number
  itemWidth: number
  clientWidth: number
  scrollWidth: number
  /** 單側被遮擋的寬度(px)= 預留給箭頭的寬度 + FADE_WIDTH */
  obstruction: number
}): number {
  const max = Math.max(0, scrollWidth - clientWidth)
  const target =
    itemWidth > clientWidth - 2 * obstruction
      ? itemStart - obstruction
      : itemStart + itemWidth / 2 - clientWidth / 2
  return Math.min(max, Math.max(0, target))
}

export interface UseRevealSelectedOptions {
  /** 這一排的項目(在捲動容器內找;Chip `[data-slot="chip"]` / Tabs `[role="tab"]` / 縮圖列 `[data-thumb-index]`) */
  itemSelector: string
  /** 「選中」寫在項目的哪個屬性、等於哪個值(Chip `data-state=on` / Tabs `aria-selected=true` / 縮圖列 `aria-current=true`) */
  selectedAttribute: { name: string; value: string }
  /** 兩側預留給箭頭的寬度,與同一排 `buildFadeMask` 傳的 `reserveArrowWidth` 同一個值(scroll 模式 `ARROW_BUTTON_WIDTH`、menu 模式 0) */
  reserveArrowWidth?: number
}

function matchesSafe(el: Element, selector: string): boolean {
  try {
    return el.matches(selector)
  } catch {
    return false // 不支援的選擇器(舊測試環境的 :focus-visible)視為不成立
  }
}

/**
 * 選到就露出來 —— 水平溢出那一排的「目前項目」一律置中(對齊 B,兩端夾住)。觸發:
 * 1. **選中狀態改變**(滑鼠點、鍵盤 Space / Enter / 方向鍵自動啟用、⌄ 選單選取、consumer 程式改 value 全部同一條):
 *    看項目上的選中屬性(MutationObserver),不看事件來源 —— 選中狀態本身就是要保證的性質,不拿「哪個處理程式跑過」當代理(M37)。
 *    一次只有一個項目變成選中 → 揭露它;沒有項目變成選中、只有一個項目被取消(多選 Chip 點掉)→ 揭露被點掉的那一個(使用者剛動的就是它);
 *    一次多個變成選中(全選之類的批次)→ 不捲,沒有「使用者剛動的那一個」。
 * 2. **鍵盤焦點移到項目上**(`:focus-visible`;Chip 方向鍵只移焦點不選、Tab 進入整組、Tabs 手動啟用模式):滑鼠點擊的焦點不算,那一下由 1 處理。
 *    新加進來的項目一掛上去就是選中(沒有屬性變動)也算這一條(childList)。
 * 3. **容器尺寸改變**(含掛載後第一次排版):揭露「上一次揭露的項目」,還沒有就揭露唯一的選中項;多選且沒動過 → 不捲;
 *    上一次揭露之後使用者自己捲過 → 不捲(不搶回使用者的位置)。
 *    尺寸改變與掛載不用動畫(拖拉視窗時每一格都在變)。
 * 1 / 2 用 smooth,`prefers-reduced-motion: reduce` 時改瞬間。
 * 只捲這個容器本身(`scrollTo`),不用 `scrollIntoView` —— 後者會連帶捲動外層頁面與任何可捲動的祖先。
 */
export function useRevealSelected<T extends HTMLElement>(
  scrollRef: React.RefObject<T | null>,
  { itemSelector, selectedAttribute, reserveArrowWidth = 0 }: UseRevealSelectedOptions,
): void {
  const { name: attrName, value: attrValue } = selectedAttribute
  React.useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    let anchor: HTMLElement | null = null
    const isItem = (el: EventTarget | Node | null): el is HTMLElement =>
      el instanceof HTMLElement && el !== scroller && scroller.contains(el) && matchesSafe(el, itemSelector)
    const isSelected = (el: HTMLElement) => el.getAttribute(attrName) === attrValue

    // 「上一次揭露之後使用者自己捲過」(2026-11-12 審查):自己捲開之後視窗一變寬窄就被拉回上次置中的那一項 = 搶走使用者的捲動位置。
    // 看的是**使用者的捲動輸入**(滾輪 / 觸控 / 在捲軸或空白處按下 / 箭頭翻頁),不看 scroll 事件 —— 容器變窄時瀏覽器把
    // scrollLeft 夾回範圍內也會發 scroll 事件,那不是使用者捲的(第一版用 scroll / scrollend 判,overflow-reveal-selected 的
    // 縮放格全部變成「沒置中」,就是被這種事件誤判)。
    let userScrolledSinceReveal = false
    const reveal = (item: HTMLElement, animate: boolean) => {
      anchor = item
      userScrolledSinceReveal = false
      const s = scroller.getBoundingClientRect()
      const r = item.getBoundingClientRect()
      // 祖先若在做縮放動畫(Dialog / FileViewer 進場),getBoundingClientRect 是縮放後的值 → 換回版面像素
      const scale = scroller.offsetWidth > 0 ? s.width / scroller.offsetWidth : 1
      const k = scale > 0 ? scale : 1
      const left = computeRevealScrollLeft({
        itemStart: (r.left - s.left) / k - scroller.clientLeft + scroller.scrollLeft,
        itemWidth: r.width / k,
        clientWidth: scroller.clientWidth,
        scrollWidth: scroller.scrollWidth,
        obstruction: reserveArrowWidth + FADE_WIDTH,
      })
      const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      // 一律呼叫(即使已在目標):同時取消進行中的 smooth 捲動,免得它把畫面帶到舊目標
      scroller.scrollTo({ left, behavior: animate && !reduce ? 'smooth' : 'auto' })
    }
    const markUserScroll = () => { userScrolledSinceReveal = true }
    // 在捲軸 / 容器空白處按下(拖捲軸);按在項目上是點選,由選中狀態那條處理
    const onPointerDown = (e: PointerEvent) => { if (e.target === scroller) userScrolledSinceReveal = true }
    scroller.addEventListener('wheel', markUserScroll, { passive: true })
    scroller.addEventListener('touchstart', markUserScroll, { passive: true })
    scroller.addEventListener('pointerdown', onPointerDown)
    scroller.addEventListener(OVERFLOW_USER_SCROLL_EVENT, markUserScroll)

    // 1. 選中狀態改變 —— 含「新加進來的項目一掛上去就是選中」(沒有屬性變動,只有 childList;2026-11-12 審查:
    //    FileViewer 原本的 useEffect([activeIndex]) 拿掉後,新縮圖帶著選中掛上來時捲去的是舊的那一個)
    const mo = new MutationObserver((records) => {
      const changed = new Set<HTMLElement>()
      for (const rec of records) {
        if (rec.type === 'childList') {
          rec.addedNodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) return
            const candidates: HTMLElement[] = [node, ...Array.from(node.querySelectorAll<HTMLElement>(itemSelector))]
            for (const it of candidates) if (isItem(it) && isSelected(it)) changed.add(it)
          })
          continue
        }
        if (!isItem(rec.target)) continue
        if (rec.oldValue === rec.target.getAttribute(attrName)) continue // 設了同一個值,沒有改變
        changed.add(rec.target)
      }
      if (changed.size === 0) return
      const list = Array.from(changed)
      const nowSelected = list.filter(isSelected)
      const target = nowSelected.length === 1 ? nowSelected[0] : nowSelected.length === 0 && list.length === 1 ? list[0] : null
      if (target) reveal(target, true)
    })
    mo.observe(scroller, { attributes: true, attributeFilter: [attrName], attributeOldValue: true, subtree: true, childList: true })

    // 2. 鍵盤焦點移到項目上
    const onFocusIn = (e: FocusEvent) => {
      if (isItem(e.target) && matchesSafe(e.target, ':focus-visible')) reveal(e.target, true)
    }
    scroller.addEventListener('focusin', onFocusIn)

    // 3. 容器尺寸改變(observe 當下的第一次回呼 = 掛載後第一次排版)
    const ro = new ResizeObserver(() => {
      if (userScrolledSinceReveal) return // 使用者在上一次揭露之後自己捲過 → 尺寸改變不搶回他的位置
      let target: HTMLElement | null = anchor && anchor.isConnected && isItem(anchor) ? anchor : null
      if (!target) {
        const selected = Array.from(scroller.querySelectorAll<HTMLElement>(itemSelector)).filter(isSelected)
        target = selected.length === 1 ? selected[0] : null
      }
      if (target) reveal(target, false)
    })
    ro.observe(scroller)

    return () => {
      mo.disconnect()
      ro.disconnect()
      scroller.removeEventListener('focusin', onFocusIn)
      scroller.removeEventListener('wheel', markUserScroll)
      scroller.removeEventListener('touchstart', markUserScroll)
      scroller.removeEventListener('pointerdown', onPointerDown)
      scroller.removeEventListener(OVERFLOW_USER_SCROLL_EVENT, markUserScroll)
    }
  }, [scrollRef, itemSelector, attrName, attrValue, reserveArrowWidth])
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
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  // ── 焦點接力(2026-09-29,待辦總帳 OE26)──
  // 箭頭是條件渲染(spec「典型 scroll 模式組裝」:`!atEnd && canScroll`),鍵盤使用者按到底的那一下,焦點正停在它上面,
  // 卸載會讓焦點掉到 body、下一次 Tab 從文件開頭重來。layout-effect 的 cleanup 在 React 把節點拿掉之前跑,此時 activeElement
  // 還是這顆鈕 → 交給同一個容器裡的另一側箭頭(到底時左箭頭一定在);另一側也沒有(內容不再溢出)→ 交給捲動容器本身
  //(`useScrollEdges` 在容器上標 `data-overflow-scroller`,焦點給它時補 tabindex=-1)。同 BulkActionBar 的 return-focus,沒有新 prop。
  React.useLayoutEffect(() => {
    const el = buttonRef.current
    return () => {
      if (!el || document.activeElement !== el) return
      const host = el.closest<HTMLElement>('[data-overflow-arrow]')?.parentElement
      if (!host) return
      // 等這次 commit 做完再找另一側:同一次 commit 常常「卸掉這一側、掛上另一側」(捲回起點:左箭頭卸、右箭頭掛),
      // React 先做刪除再做插入,cleanup 當下另一側還不在 DOM 裡 —— 2026-09-29 第一版在這裡直接找,story 閘抓到焦點落到容器而不是箭頭。
      queueMicrotask(() => {
        const active = document.activeElement
        if (active && active !== document.body && host.contains(active)) return // 已有人接手(例如消費者自己搬了焦點)
        const other = Array.from(host.querySelectorAll<HTMLElement>('[data-overflow-arrow] button')).find((b) => b !== el && b.isConnected)
        if (other) { other.focus({ preventScroll: true }); return }
        const scroller = host.querySelector<HTMLElement>('[data-overflow-scroller]')
        if (!scroller) return
        if (!scroller.hasAttribute('tabindex')) scroller.setAttribute('tabindex', '-1')
        scroller.focus({ preventScroll: true })
      })
    }
  }, [])
  return (
    <div
      data-overflow-arrow={direction}
      className={cn(
        'absolute top-0 bottom-0 flex items-center pointer-events-none z-10',
        direction === 'left' ? 'left-0' : 'right-0',
      )}
    >
      <div className="pointer-events-auto">
        <Button
          ref={buttonRef}
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

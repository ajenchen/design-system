import * as React from 'react'

/**
 * 水平溢出追蹤 hooks — 給 Tabs / ChipGroup 等「一排水平 items 塞不下父容器」的元件共用。
 *
 * ── 設計原則 ──
 *   Scroll 模式與 Menu 模式是兩種處理策略：
 *
 *   1. **Scroll 模式**（Material / Polaris / Primer / iOS 作法）
 *      items 用原生 overflow-x-auto 水平滾動，邊緣 fade mask 指示還有內容。
 *      使用 `useScrollEdges()`：回傳 atStart / atEnd / canScroll，讓消費端
 *      決定 mask-image / scroll arrow 的顯示。
 *
 *   2. **Menu 模式**（Ant Design / Atlassian「動態 collapse-overflow」作法）
 *      塞不下的 items 收進 DropdownMenu。`useOverflowIndices()` 回傳 overflowIndices
 *      供消費端動態計算哪些 items 塞不下、渲染對應的 menu items。
 *
 *      ⚠️ **目前 0 consumer（reserved primitive）**：DS 內現有 menu 模式實作（Tabs / Chip）走的是
 *      「**show-all navigator**」派 — dropdown 永遠列**全部** items（不需動態 overflow 計算），各自用
 *      local registerItem，**刻意不用** `useOverflowIndices`（見 tabs.tsx:256 / chip.tsx:219 註解）。
 *      本 hook 保留給未來真正需要「collapse-overflow：只把塞不下的收進選單」的 consumer。
 *      **roving tabindex / a11y 語意由 consumer 的渲染方式決定**（hook 只回傳 indices，不操作
 *      DOM / tabindex），非 hook 本身保證。
 *
 * ── 為什麼分兩個 hook，不合一 ──
 *   Scroll 的計算依據是 scroll 事件與 client/scroll width；Menu 的計算依據是
 *   items 的 offsetLeft/offsetWidth 相對容器 clientWidth。訂閱的事件不同
 *   （scroll vs resize），回傳的資料形狀不同。合一會讓 API 有一半是 noise。
 */

// ─────────────────────────────────────────────────────────────────────────────
// useScrollEdges — 給 scroll 模式
// ─────────────────────────────────────────────────────────────────────────────

// code-quality-allow: dead-export — hook return type — API surface for consumers who want to annotate
export interface UseScrollEdgesResult<T extends HTMLElement> {
  /** 綁在 scroll container 上的 ref */
  scrollRef: React.RefObject<T>
  /** scroll 位置在最左側（無法再往左）*/
  atStart: boolean
  /** scroll 位置在最右側（無法再往右）*/
  atEnd: boolean
  /** 內容總寬度超過可視寬度，有滾動空間 */
  canScroll: boolean
}

/**
 * 追蹤 scroll container 的滾動位置，用來決定左右 fade mask 是否顯示。
 *
 * 典型用法：
 * ```tsx
 * const { scrollRef, atStart, atEnd, canScroll } = useScrollEdges<HTMLDivElement>()
 * const maskImage = canScroll
 *   ? `linear-gradient(to right,
 *       ${atStart ? 'black' : 'transparent'} 0,
 *       black 16px,
 *       black calc(100% - 16px),
 *       ${atEnd ? 'black' : 'transparent'} 100%)`
 *   : undefined
 * return <div ref={scrollRef} className="overflow-x-auto" style={{ maskImage, WebkitMaskImage: maskImage }}>
 *   {items}
 * </div>
 * ```
 */
export function useScrollEdges<T extends HTMLElement = HTMLElement>(): UseScrollEdgesResult<T> {
  const scrollRef = React.useRef<T | null>(null)
  const [state, setState] = React.useState({ atStart: true, atEnd: true, canScroll: false })

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const update = () => {
      const canScroll = el.scrollWidth > el.clientWidth + 1
      const atStart = el.scrollLeft <= 0
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
      setState((prev) =>
        prev.atStart === atStart && prev.atEnd === atEnd && prev.canScroll === canScroll
          ? prev
          : { atStart, atEnd, canScroll }
      )
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    // 監聽 children 變化（items 增減、字體載入）
    const mo = new MutationObserver(update)
    mo.observe(el, { childList: true, subtree: true, characterData: true })

    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
      mo.disconnect()
    }
  }, [])

  return { scrollRef, ...state }
}

// ─────────────────────────────────────────────────────────────────────────────
// useOverflowIndices — 給 menu 模式
// ─────────────────────────────────────────────────────────────────────────────

export interface UseOverflowIndicesOptions {
  /**
   * 預留給 overflow trigger（如 "More" 按鈕）的右側寬度（px）。
   * 計算 items 是否溢出時會從 container clientWidth 扣掉這個值。
   */
  reserveTriggerWidth?: number
}

// code-quality-allow: dead-export — hook return type — API surface for consumers who want to annotate
export interface UseOverflowIndicesResult<C extends HTMLElement> {
  /** 綁在 items 的父容器上 */
  containerRef: React.RefObject<C>
  /** 為每個 item 註冊 ref（回傳 callback ref）*/
  registerItem: (index: number) => (el: HTMLElement | null) => void
  /** DOM 順序上溢出的 item 索引（連續區間，從某個 index 到尾端）*/
  overflowIndices: number[]
  /** 至少有一個 item 溢出 */
  hasOverflow: boolean
  /** 依 index 取得對應 item 的 DOM 元素，供 scrollIntoView 等操作使用 */
  getItemAt: (index: number) => HTMLElement | undefined
}

/**
 * 追蹤一排水平 items 裡哪些「當前不在可視範圍內」。
 *
 * ── 演算法 ──
 *   對每個 item 檢查 `[offsetLeft, offsetLeft+offsetWidth]` 是否完全落在
 *   `[scrollLeft, scrollLeft + clientWidth - reserveTriggerWidth]` 範圍內。
 *   沒完全落在內的就算溢出。
 *
 *   **關鍵**：overflow 集合跟 scrollLeft 連動,不是靜態「原始佈局不 fit」集合。
 *   這是 Ant Design / Atlassian 世界級作法 —— menu 顯示「當下看不到的 items」,
 *   不是「原始溢出的 items」。
 *
 *   為什麼這樣對:
 *   - 使用者點 menu item → `scrollIntoView` → 原本 overflow 的 item 進入視圖,
 *     原本可見的 items 被推出去 → 下次開 menu 看到的是「剛被推出去的 items」,
 *     永遠能找到所有當前看不到的 items,不會卡住。
 *   - 靜態 overflow (只算原始佈局) 會造成 scroll 後無法回到前面的 items。
 *
 * ── 觸發重算 ──
 *   - ResizeObserver: 容器寬度變化 / item 尺寸變化
 *   - scroll event: scroll 位置變化
 *
 * ── 前提 ──
 *   items 在 DOM 裡始終存在 (不可 conditional render),並用 `registerItem(i)` 綁 ref。
 *   容器要可以 scroll (overflow-x-auto 或類似),否則 scrollLeft 永遠 0。
 *
 * 典型用法:
 * ```tsx
 * const { containerRef, registerItem, overflowIndices, hasOverflow, getItemAt } =
 *   useOverflowIndices<HTMLDivElement>({ reserveTriggerWidth: 0 })
 *
 * const handleMenuSelect = (value: string, index: number) => {
 *   onValueChange?.(value)
 *   requestAnimationFrame(() => {
 *     getItemAt(index)?.scrollIntoView({ behavior: 'smooth', inline: 'center' })
 *   })
 * }
 *
 * return (
 *   <div className="flex items-center">
 *     <div ref={containerRef} className="flex-1 min-w-0 overflow-x-auto">
 *       <ItemList>
 *         {items.map((item, i) => React.cloneElement(item, { ref: registerItem(i) }))}
 *       </ItemList>
 *     </div>
 *     {hasOverflow && <OverflowMenu items={overflowIndices.map(i => items[i])} />}
 *   </div>
 * )
 * ```
 */
export function useOverflowIndices<C extends HTMLElement = HTMLElement>(
  options: UseOverflowIndicesOptions = {}
): UseOverflowIndicesResult<C> {
  const { reserveTriggerWidth = 0 } = options
  const containerRef = React.useRef<C | null>(null)
  const itemRefsMap = React.useRef<Map<number, HTMLElement>>(new Map())
  const [overflowIndices, setOverflowIndices] = React.useState<number[]>([])

  const registerItem = React.useCallback((index: number) => {
    return (el: HTMLElement | null) => {
      if (el) {
        itemRefsMap.current.set(index, el)
      } else {
        itemRefsMap.current.delete(index)
      }
    }
  }, [])

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const compute = () => {
      const containerWidth = container.clientWidth
      if (containerWidth === 0) return

      const scrollLeft = container.scrollLeft
      const visibleStart = scrollLeft
      const visibleEnd = scrollLeft + containerWidth - reserveTriggerWidth

      // 容許 1px 的像素取整誤差,避免邊界 item 被誤判為 overflow
      const tolerance = 1

      const indices = Array.from(itemRefsMap.current.keys()).sort((a, b) => a - b)

      const overflow: number[] = []
      for (const i of indices) {
        const el = itemRefsMap.current.get(i)
        if (!el) continue

        const left = el.offsetLeft
        const right = left + el.offsetWidth
        // 完全可見條件: item 的左右邊都在可視窗口內
        const fullyVisible =
          left >= visibleStart - tolerance && right <= visibleEnd + tolerance
        if (!fullyVisible) overflow.push(i)
      }

      setOverflowIndices((prev) => {
        if (prev.length === overflow.length && prev.every((v, i) => v === overflow[i])) {
          return prev
        }
        return overflow
      })
    }

    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(container)
    // 也觀察每個 item 的尺寸變化（字體載入、label 更新等）
    itemRefsMap.current.forEach((el) => ro.observe(el))
    // Scroll event: overflow 集合隨 scroll 位置變化
    container.addEventListener('scroll', compute, { passive: true })

    return () => {
      ro.disconnect()
      container.removeEventListener('scroll', compute)
    }
  }, [reserveTriggerWidth])

  const getItemAt = React.useCallback(
    (index: number) => itemRefsMap.current.get(index),
    []
  )

  return {
    containerRef,
    registerItem,
    overflowIndices,
    hasOverflow: overflowIndices.length > 0,
    getItemAt,
  }
}

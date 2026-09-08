/**
 * 浮層並存 primitive —— 讓一個浮層在開著時,**指定的區域仍然可用**。
 *
 * ── 為什麼需要它 ──────────────────────────────────────────────────────
 * agent 原則 v14 條 A:「內部內容以自己的 URL 取得協作資格」;條 B:「寬螢幕讓具資格的
 * 內容與 agent **並列可操作**」。Radix Dialog 的 modal 分支寫死三件事,三件都擋住它:
 *   `hideOthers(content)` 只保留 content(`react-dialog` 的 modal 分支,無法傳白名單)
 *   `trapFocus: true` + `onFocusOutside: preventDefault`(焦點出不去)
 *   `disableOutsidePointerEvents: true`(body 不可點)
 * 而 `modal={false}` 是另一個極端:三件全關,**連 Overlay 都不渲染**。
 * 兩個預設都不是 v14 要的「其餘 inert、但這幾塊仍可用」。
 *
 * ── 這支做什麼 ────────────────────────────────────────────────────────
 * `suppressOthers([...保留節點])` —— `aria-hidden` 官方 API,第一個參數就收**陣列**,
 * 支援 `inert` 時用原生 `inert`(一次處理鍵盤、指標、無障礙樹),不支援才退回 `aria-hidden`。
 * 保留節點以外的整棵樹被抑制,保留節點自己完全不受影響。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────
 * - **不合成跨區的 Tab 循環**。v14 只要求「並列**可操作**」,沒要求兩區之間 Tab 連續;
 *   鍵盤往返是 user 2026-09-07 明確裁示的 backlog,不在這裡偷偷升級成前置條件。
 * - **不碰預設路徑**。沒有傳保留節點時這支不做任何事,Dialog 的 modal 行為一個位元不變。
 * - **不認識 agent**。它只知道「保留這些節點」,誰是 agent 由呼叫端決定 —— DS 元件不被產品概念汙染。
 */
import * as React from 'react'
import { suppressOthers } from 'aria-hidden'
import { cn } from '@/lib/utils'

export type CoexistenceTargets = () => Element[]

/**
 * @param active   浮層是否開著
 * @param keep     要保留可用的節點(回傳陣列的函式,在 effect 內才呼叫 —— ref 那時才有值)
 */
export function useOverlayCoexistence(active: boolean, keep: CoexistenceTargets | undefined) {
  React.useEffect(() => {
    if (!active || !keep) return
    let undo: (() => void) | undefined
    // **等一個影格再套用**。保留集合通常含「浮層自己的 Content」,而 Content 走 Portal、
    // 又可能被 Radix 的 Presence 包住延後掛載 —— effect 跑的當下它不一定在 DOM 裡。
    // 少了它,`suppressOthers` 就會把**浮層自己**一起 inert 掉:實測 Dialog 的
    // `role="dialog"` 節點自己帶上 inert=true,框內按鈕完全 focus 不進去(2026-09-08)。
    // rAF 之後版面已經 commit 完,保留集合才是完整的。
    const frame = requestAnimationFrame(() => {
      const targets = keep().filter((el): el is Element => !!el && el.isConnected)
      // 一個保留節點都沒有時什麼都不做:抑制「除了空集合以外的一切」等於抑制整頁。
      if (targets.length === 0) return
      undo = suppressOthers(targets)
    })
    return () => { cancelAnimationFrame(frame); undo?.() }
  }, [active, keep])
}

/**
 * 並存遮罩 —— modal 開著時宿主要被遮住(它仍然是 modal),但保留節點不能被遮、也不能被擋住點擊。
 * Radix 在 `modal={false}` 時不渲染 Overlay,所以這裡自己畫一層 `fixed inset-0` 的遮罩,
 * 用 `clip-path: polygon(evenodd …)` 在每個保留節點的位置**挖洞**:洞裡沒有遮罩像素、也沒有命中區,
 * 保留節點照常可見可點;洞外(宿主)被遮、點下去是「外部點擊」→ 關閉 modal(v14 條 A 的 modal 語意)。
 * 不用 z-index 把保留節點抬上來:保留節點常是 `display:contents` 的殼或 flex 子節點,改它們的定位會破版。
 * 洞的位置跟著 ResizeObserver / 視窗 resize / 捲動更新。
 */
export function CoexistenceMask({ keep, className, ...rest }: { keep: CoexistenceTargets } & React.HTMLAttributes<HTMLDivElement>) {
  const [clipPath, setClipPath] = React.useState<string>('none')
  const selfRef = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    let frame = 0
    const compute = () => {
      frame = 0
      const self = selfRef.current
      if (!self) return
      // 遮罩可能被傳送進帶 transform 的畫布(fixed 以畫布為準),所以洞的座標一律相對遮罩自己的盒子算
      const base = self.getBoundingClientRect()
      // `display:contents` 的殼沒有自己的盒子(rect 全 0),用它的子節點當洞
      const boxes = (el: Element): DOMRect[] => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 ? [r] : [...el.children].flatMap(boxes)
      }
      const rects = keep()
        .filter((el): el is Element => !!el && el.isConnected)
        .flatMap(boxes)
      if (rects.length === 0 || base.width === 0) { setClipPath('none'); return }
      // path() 支援多個子路徑,evenodd 讓內圈變成洞;polygon() 只有單一路徑,接縫會畫出斜切三角(2026-09-08 實測)
      const W = base.width, H = base.height
      const outer = `M0 0H${W}V${H}H0Z`
      const holes = rects.map((r) => {
        const x1 = Math.max(0, r.left - base.left), y1 = Math.max(0, r.top - base.top)
        const x2 = Math.min(W, r.right - base.left), y2 = Math.min(H, r.bottom - base.top)
        return x2 > x1 && y2 > y1 ? `M${x1} ${y1}H${x2}V${y2}H${x1}Z` : ''
      }).join('')
      setClipPath(`path(evenodd, '${outer}${holes}')`)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(compute) }
    compute()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    for (const el of keep()) if (el && ro) ro.observe(el)
    if (ro && selfRef.current) ro.observe(selfRef.current)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      ro?.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
    }
  }, [keep])
  // 本檔是 .ts(不是 .tsx),用 createElement 而不是 JSX
  return React.createElement('div', {
    ref: selfRef,
    'aria-hidden': true,
    'data-coexistence-mask': '',
    className: cn('fixed inset-0 z-30 bg-overlay', className),
    style: { clipPath },
    ...rest,
  })
}

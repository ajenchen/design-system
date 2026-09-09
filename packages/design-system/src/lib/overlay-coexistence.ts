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
    let frame = 0
    const apply = () => {
      frame = 0
      const targets = keep().filter((el): el is Element => !!el && el.isConnected)
      // 一個保留節點都沒有時什麼都不做:抑制「除了空集合以外的一切」等於抑制整頁。
      if (targets.length === 0) return
      undo = suppressOthers(targets)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(apply) }
    // **等一個影格再套用**。保留集合通常含「浮層自己的 Content」,而 Content 走 Portal、
    // 又可能被 Radix 的 Presence 包住延後掛載 —— effect 跑的當下它不一定在 DOM 裡。
    // 少了它,`suppressOthers` 就會把**浮層自己**一起 inert 掉:實測 Dialog 的
    // `role="dialog"` 節點自己帶上 inert=true,框內按鈕完全 focus 不進去(2026-09-08)。
    // rAF 之後版面已經 commit 完,保留集合才是完整的。
    schedule()
    // **刻意不在之後的 DOM 變動時重套**(2026-09-09 實測撤回):`suppressOthers` 只標記呼叫當下的節點,
    // 曾想用 MutationObserver 在有新節點 portal 到 body 時重套一次,結果保留區**自己開出來的浮層**
    // (並存 modal 裡的 PeoplePicker / Select 選單、蓋板態面板的歷史浮層,都 portal 到 body)也被抑制,
    // 選項點不到(閘 S3 當場紅)。「之後 portal 出來的 modal 在蓋板後方仍可鍵盤到達」這個缺口
    // 由層級(蓋板 z-[45] > 並存面 z-40)與 portal 進被抑制的宿主容器承接,不在這裡硬補。
    return () => { if (frame) cancelAnimationFrame(frame); undo?.() }
  }, [active, keep])
}

/**
 * 並存遮罩 —— modal 開著時宿主要被遮住(它仍然是 modal),但保留節點不能被遮、也不能被擋住點擊。
 * Radix 在 `modal={false}` 時不渲染 Overlay,所以這裡自己畫一層 `fixed inset-0` 的遮罩,
 * 用 `clip-path: path(evenodd …)` 在每個保留節點的位置**挖洞**(洞 = 元素可視形狀,含圓角;2026-09-09):洞裡沒有遮罩像素、也沒有命中區,
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
      // 洞 = 常駐節點底下**點得到或畫得出來**的盒子。兩種節點沒有資格自己當洞、要往下找子節點:
      //   - `display:contents` 的殼沒有自己的盒子(rect 全 0);
      //   - `pointer-events:none` 的定位圖層(rect 是全舞台、卻既不吃指標也不畫東西)。
      //     根因錨(2026-09-09 user:「為何關閉 agent 之後,原本 dialog 該有的遮罩就消失了?」):
      //     agent 關閉後,常駐殼裡換成入口鈕的 Dock,它外層是一個與舞台等大的
      //     `pointer-events-none absolute inset-0 overflow-clip` 裁切圖層(agent-panel-fab.tsx);
      //     舊判準「有盒子就是洞」把整層當成洞,evenodd 之下洞 = 外框 → 遮罩整張被挖空。
      //   例外:`<svg>` / `<img>` / `<canvas>` / `<video>` 這類自己會畫的元素即使 pointer-events:none
      //   也算(入口鈕的招喚光圈就是 pointer-events-none 的 svg,洞要把它露出來)。
      const PAINTS = new Set(['svg', 'img', 'canvas', 'video'])
      // 洞 = 元素的**可視形狀**,不是外接矩形(2026-09-09 user:「dialog 遮罩不能在視覺上沿著 fab 的形狀?而是切出一個正方形放 fab?」):
      // 圓形入口鈕原本挖 40×40 的方洞,四個角露出沒被遮的底色 = 那個「白方塊」。四個角各讀實際 border-radius(px / %;
      // `rounded-full` 的 9999px 依 CSS 規則夾到邊長一半,相鄰兩角相加超過邊長時等比縮),用弧線畫子路徑;直角元素路徑與舊版相同。
      type Hole = { r: DOMRect; radii: [number, number, number, number] }
      const radiusPx = (value: string, w: number, h: number, axis: 'w' | 'h') => {
        const v = value.trim().split(/\s+/)[0] ?? '0' // 「a / b」橢圓角只取水平值(DS 沒有橢圓角)
        if (v.endsWith('%')) return (parseFloat(v) / 100) * (axis === 'w' ? w : h)
        return parseFloat(v) || 0
      }
      const boxes = (el: Element): Hole[] => {
        const r = el.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) return [...el.children].flatMap(boxes)
        const cs = getComputedStyle(el)
        const hitTestable = cs.pointerEvents !== 'none'
        if (!(hitTestable || PAINTS.has(el.tagName.toLowerCase()))) return [...el.children].flatMap(boxes)
        let radii: [number, number, number, number] = [
          radiusPx(cs.borderTopLeftRadius, r.width, r.height, 'w'), radiusPx(cs.borderTopRightRadius, r.width, r.height, 'w'),
          radiusPx(cs.borderBottomRightRadius, r.width, r.height, 'w'), radiusPx(cs.borderBottomLeftRadius, r.width, r.height, 'w'),
        ].map((v) => Math.max(0, Math.min(v, r.width / 2, r.height / 2))) as [number, number, number, number]
        // CSS「相鄰圓角相加不得超過該邊長」:超過就全體等比縮(css-backgrounds-3 §5.5 corner-overlap)
        const f = Math.min(1, r.width / ((radii[0] + radii[1]) || 1), r.width / ((radii[2] + radii[3]) || 1), r.height / ((radii[0] + radii[3]) || 1), r.height / ((radii[1] + radii[2]) || 1))
        if (f < 1) radii = radii.map((v) => v * f) as [number, number, number, number]
        return [{ r, radii }]
      }
      const holesData = keep()
        .filter((el): el is Element => !!el && el.isConnected)
        .flatMap(boxes)
      if (holesData.length === 0 || base.width === 0) { setClipPath('none'); return }
      // path() 支援多個子路徑,evenodd 讓內圈變成洞;polygon() 只有單一路徑,接縫會畫出斜切三角(2026-09-08 實測)
      const W = base.width, H = base.height
      const outer = `M0 0H${W}V${H}H0Z`
      const n = (v: number) => Math.round(v * 100) / 100
      const holes = holesData.map(({ r, radii: [tl, tr, br, bl] }) => {
        const x1 = Math.max(0, r.left - base.left), y1 = Math.max(0, r.top - base.top)
        const x2 = Math.min(W, r.right - base.left), y2 = Math.min(H, r.bottom - base.top)
        if (!(x2 > x1 && y2 > y1)) return ''
        if (tl + tr + br + bl === 0) return `M${n(x1)} ${n(y1)}H${n(x2)}V${n(y2)}H${n(x1)}Z`
        const arc = (rad: number, x: number, y: number) => (rad > 0 ? `A${n(rad)} ${n(rad)} 0 0 1 ${n(x)} ${n(y)}` : `L${n(x)} ${n(y)}`)
        return `M${n(x1 + tl)} ${n(y1)}H${n(x2 - tr)}${arc(tr, x2, y1 + tr)}V${n(y2 - br)}${arc(br, x2 - br, y2)}H${n(x1 + bl)}${arc(bl, x1, y2 - bl)}V${n(y1 + tl)}${arc(tl, x1 + tl, y1)}Z`
      }).join('')
      setClipPath(`path(evenodd, '${outer}${holes}')`)
      // 保留元素正在動畫 / 過渡(入口鈕拖放後 250ms 飛回家、貼邊形態過渡)時,洞要每幀跟著算到動畫結束;
      // 否則洞停在算的那一刻的位置(2026-09-09 user:「fab 推到邊緣再拖回原本的地方,會在遮罩上挖出另一個圓形的洞」:
      // 實測洞心停在飛行途中 1364,766、鈕心已到 1387,847)。ResizeObserver / MutationObserver 都看不到位置過渡。
      const animating = keep().some((el) => !!el && el.isConnected && typeof el.getAnimations === 'function'
        && el.getAnimations({ subtree: true }).some((a) => a.playState === 'running'))
      if (animating) frame = requestAnimationFrame(compute)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(compute) }
    compute()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    for (const el of keep()) if (el && ro) ro.observe(el)
    if (ro && selfRef.current) ro.observe(selfRef.current)
    // 常駐殼的**內容**換掉時(面板 → 入口鈕、入口鈕 → 面板)洞也要重算:殼本身是 display:contents,
    // ResizeObserver 觀察不到它;子樹增減走 MutationObserver。
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null
    for (const el of keep()) if (el && mo) mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    // 過渡 / 動畫結束再算最後一次(playState 掃描與結束事件互為保險)
    document.addEventListener('transitionend', schedule, true)
    document.addEventListener('transitioncancel', schedule, true)
    document.addEventListener('animationend', schedule, true)
    return () => {
      document.removeEventListener('transitionend', schedule, true)
      document.removeEventListener('transitioncancel', schedule, true)
      document.removeEventListener('animationend', schedule, true)
      if (frame) cancelAnimationFrame(frame)
      ro?.disconnect()
      mo?.disconnect()
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

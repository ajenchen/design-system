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
 * `inertOutside([...保留節點])`(本檔下方)—— 保留節點以外的整棵樹設原生 `inert`(一次處理鍵盤、指標、無障礙樹),
 * 保留節點自己完全不受影響;頁面上**不屬於任何控件**的播報區(`[aria-live]`,例:Toast 區、DS 的 polite / assertive 播報)也保留,
 * 和 Radix 一般 modal 用的 `hideOthers` 同一個目的;
 * 不支援 `inert` 的瀏覽器才退回 `aria-hidden` 套件的 `hideOthers`。
 * 2026-10-07 前用的是 `aria-hidden` 套件的 `suppressOthers`,為什麼換掉見 `inertOutside` 的說明(它和 Radix 共用一份計數)。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────
 * - **不合成跨區的 Tab 循環**。v14 只要求「並列**可操作**」,沒要求兩區之間 Tab 連續;
 *   鍵盤往返是 user 2026-09-07 明確裁示的 backlog,不在這裡偷偷升級成前置條件。
 * - **不碰預設路徑**。沒有傳保留節點時這支不做任何事,Dialog 的 modal 行為一個位元不變。
 * - **不認識 agent**。它只知道「保留這些節點」,誰是 agent 由呼叫端決定 —— DS 元件不被產品概念汙染。
 */
import * as React from 'react'
import { hideOthers } from 'aria-hidden'
import { cn } from '@/lib/utils'

export type CoexistenceTargets = () => Element[]

/**
 * 「保留這些節點、其餘全部 inert」的唯一實作,**自己記帳**,不借 `aria-hidden` 套件的 `suppressOthers` / `inertOthers`。
 *
 * ── 為什麼不能借(2026-10-07 根因;閘 scripts/agent-url-registry-demo-invariant.mjs S5 / S7 殘留抑制兩列)──
 * `aria-hidden`(1.2.6,`node_modules/aria-hidden/dist/es2015/index.js`)整個模組只有**一份**「這個節點被幾個鎖蓋著」的計數
 * (模組層的 `counterMap`),不分控制屬性:Radix 的 modal Dialog / Popover / Menu 呼叫 `hideOthers`(控制 `aria-hidden`),
 * 這裡原本呼叫 `suppressOthers`(控制 `inert`),兩者記在同一格。解鎖時誰把那一格減到 0,就只拿掉**它自己**的屬性 ——
 * 所以同一個節點被兩種鎖蓋住、又不是後進先出地解開時,先解的那一方的屬性永遠留著、沒有主人:
 *   並存的任務對話框 `inert` 了 `<main>`(計數 1)→ 疊上的確認框(一般 modal)`hideOthers` 也蓋到 `<main>`(計數 2)
 *   → 確認刪除,兩個對話框同一次 commit 卸載,React 依樹順序先跑並存對話框的清理(計數 2→1,`inert` **沒拿掉**)
 *   → 再跑確認框的清理(計數 1→0,拿掉的是 `aria-hidden`)→ `<main>` 永遠 inert,清單連結點不到。
 *   反過來的順序則是 `aria-hidden` 永遠留在 `<main>` 上(讀屏讀不到主內容,零訊號)。
 * 為什麼 2026-10-07 才發作:`hideOthers` 會**保留**頁面上所有 `[aria-live]`(它的設計:播報區不能被藏),那之前並存對話框裡
 * 沒有播報區,`hideOthers` 只蓋到舞台外層、碰不到 `<main>`;可搜尋選單的「已移除『X』」播報區(select-menu-removal-status.tsx,
 * 常駐在 Select 觸發欄位裡)讓舞台變成「保留節點的祖先」,`hideOthers` 往下走、蓋到了和並存鎖同一個 `<main>`。
 * 播報區沒有錯(它必須常駐);錯的是兩種屬性共用一份計數 —— 任何一個欄位、Toast、`CommandEmptyStatus` 都能觸發同一件事。
 *
 * ── 不屬於控件的播報區保留(同族,2026-10-07)──
 * `hideOthers` 刻意保留頁面上所有 `[aria-live]`(`aria-hidden` 1.2.6 `dist/es2015/index.js:131-133`:
 * 「we should not hide aria-live elements」),而它的 inert 版 `inertOthers` / `suppressOthers` 沒有保留 ——
 * 結果是一般 modal 開著時 Toast 照常念得到,**並存**浮層(並存對話框、AI agent 浮層、FileViewer)開著時卻全部靜音
 * (inert = 從無障礙樹拿掉)。這裡保留播報區連同它到 body 的祖先鏈(鏈上其他兄弟照樣 inert)。
 * **但只保留不在任何控件裡的播報區**:`aria-hidden` 只影響讀屏,`inert` 還會擋鍵盤與指標 —— 保留一條祖先鏈就等於把鏈上每個節點
 * 都放出來,鏈上若有可操作的控件(例:可搜尋 Select 的欄位外框,裡面常駐「已移除『X』」播報區),那個被蓋住的控件就變回可聚焦,
 * 違反「被蓋住的宿主不得留下可聚焦控件」(scripts/agent-panel-invariants.mjs B;scripts/agent-url-registry-demo-invariant.mjs S9,2026-10-07 實測抓到)。
 * 控件自己的播報區跟著控件一起被擋是對的:那個控件此刻不能操作,它的播報也沒有對象。
 * 播報區**自己裡面**的互動元素(例:Toast 的「復原」)保持可用,與一般 modal 下 Toast 仍可點的行為相同。
 *
 * ── 這份怎麼記 ──
 * 只數**本實作**自己的鎖(`inertLocks`),只控制 `inert`;Radix 的 `aria-hidden` 鎖由 `aria-hidden` 套件自己數,兩邊互不相干,
 * 解鎖順序怎麼交錯都各自歸零。同一個節點被多個並存浮層(並存對話框 + AI agent 浮層)同時 inert 時,最後一個解開才拿掉。
 * 第一次上鎖時節點**已經**是 inert(不是本實作設的)→ 記下來,歸零時不拿掉(不碰別人的屬性;與 `aria-hidden` 套件同一條)。
 * 回傳的解鎖函式**冪等**:呼叫第二次什麼都不做(不會把別的鎖的計數多減一次)。
 * 不支援 `inert` 時退回 `hideOthers`:那時控制的是同一個 `aria-hidden` 屬性,與 Radix 共用計數反而正確(同一個屬性、誰最後解誰拿掉)。
 */
/** 控件:鍵盤或指標可操作的元素。祖先鏈上有它的播報區屬於那個控件,不單獨保留(見 inertOutside「不屬於控件的播報區保留」)。 */
const CONTROL_SELECTOR = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable=""], [contenteditable="true"], [role="button"], [role="link"], [role="combobox"], [role="textbox"], [role="searchbox"], [role="listbox"], [role="option"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="slider"], [role="spinbutton"], [role="gridcell"], [role="treeitem"]'
function insideControl(el: Element, body: Element): boolean {
  for (let n = el.parentElement; n && n !== body; n = n.parentElement) if (n.matches(CONTROL_SELECTOR)) return true
  return false
}
const inertLocks = new WeakMap<Element, number>()
const inertBeforeLock = new WeakSet<Element>()
function inertOutside(targets: Element[]): () => void {
  const body = targets[0]?.ownerDocument.body
  const kept = body ? targets.filter((el) => body.contains(el)) : []
  if (!body || kept.length === 0) return () => {}
  if (!Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'inert')) return hideOthers(kept, body)
  // 不屬於控件的播報區保留(見上方說明);已在保留節點裡面的不必重複
  const live = Array.from(body.querySelectorAll('[aria-live]')).filter((el) => !kept.some((k) => k.contains(el)) && !insideControl(el, body))
  const keepAll = [...kept, ...live]
  // 保留節點與它們到 body 的祖先鏈:這條鏈上的節點往下走,鏈外的兄弟整棵 inert;保留節點本身不往下走
  const path = new Set<Element>()
  for (const el of keepAll) for (let n: Element | null = el; n && n !== body; n = n.parentElement) path.add(n)
  const stop = new Set<Element>(keepAll)
  const locked: Element[] = []
  const walk = (parent: Element) => {
    if (stop.has(parent)) return
    for (const child of Array.from(parent.children)) {
      if (path.has(child)) { walk(child); continue }
      const count = (inertLocks.get(child) ?? 0) + 1
      inertLocks.set(child, count)
      if (count === 1) {
        if (child.hasAttribute('inert')) inertBeforeLock.add(child)
        else child.setAttribute('inert', '')
      }
      locked.push(child)
    }
  }
  walk(body)
  let released = false
  return () => {
    if (released) return
    released = true
    for (const el of locked) {
      const count = (inertLocks.get(el) ?? 1) - 1
      if (count > 0) { inertLocks.set(el, count); continue }
      inertLocks.delete(el)
      if (inertBeforeLock.has(el)) inertBeforeLock.delete(el)
      else el.removeAttribute('inert')
    }
  }
}

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
      undo = inertOutside(targets)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(apply) }
    // **等一個影格再套用**。保留集合通常含「浮層自己的 Content」,而 Content 走 Portal、
    // 又可能被 Radix 的 Presence 包住延後掛載 —— effect 跑的當下它不一定在 DOM 裡。
    // 少了它,`inertOutside` 就會把**浮層自己**一起 inert 掉:實測 Dialog 的
    // `role="dialog"` 節點自己帶上 inert=true,框內按鈕完全 focus 不進去(2026-09-08)。
    // rAF 之後版面已經 commit 完,保留集合才是完整的。
    schedule()
    // **刻意不在之後的 DOM 變動時重套**(2026-09-09 實測撤回):`inertOutside` 只標記呼叫當下的節點,
    // 曾想用 MutationObserver 在有新節點 portal 到 body 時重套一次,結果保留區**自己開出來的浮層**
    // (並存 modal 裡的 PeoplePicker / Select 選單、浮層態代理面板的歷史浮層,都 portal 到 body)也被抑制,
    // 選項點不到(閘 S3 當場紅)。「之後 portal 出來的 modal 在 AI agent 浮層後方仍可鍵盤到達」這個缺口
    // 由層級(AI agent 浮層 z-[45] > 並存面 z-40)與 portal 進被抑制的宿主容器承接,不在這裡硬補。
    // 解鎖綁在這次 effect 的生命週期上(浮層關閉 / 卸載 / 保留集合換了),而且只解這一次上的鎖 —— 別人的鎖(Radix 的 aria-hidden、
    // 另一個並存浮層的 inert)不受解鎖順序影響(inertOutside 的說明)
    return () => { if (frame) cancelAnimationFrame(frame); undo?.(); undo = undefined }
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
// forwardRef(2026-09-16):AI agent 浮層要把自家遮罩放進保留集合(讓它接住指標、不被設 inert),需要拿到節點;React 18 的函式元件不會把 ref 當 prop 傳。
export const CoexistenceMask = React.forwardRef<HTMLDivElement, { keep: CoexistenceTargets } & React.HTMLAttributes<HTMLDivElement>>(
function CoexistenceMask({ keep, className, ...rest }, forwardedRef) {
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
        // 遮罩不是洞(2026-09-16):另一層的並存遮罩(AI agent 浮層自家的遮罩住在常駐殼裡、與面板同級)雖然有盒子、
        // 也接住指標(它要把點擊擋在自己身上,不讓點擊穿到底下的 modal / 宿主),但它是「遮住」不是「保留」——
        // 把它當洞會讓本遮罩整張被挖空;它自己算洞時更不能把自己挖掉。
        if (el.hasAttribute('data-coexistence-mask')) return []
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
    ref: (node: HTMLDivElement | null): void => {
      selfRef.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    },
    'aria-hidden': true,
    'data-coexistence-mask': '',
    className: cn('fixed inset-0 z-30 bg-overlay', className),
    style: { clipPath },
    ...rest,
  })
})
CoexistenceMask.displayName = 'CoexistenceMask'

/**
 * 並存守衛 —— 判定一個「框外事件」(Radix `onPointerDownOutside` / `onFocusOutside` / `onInteractOutside`)的目標
 * 其實屬於保留區,不該關閉並存浮層。三種情況算保留區(Dialog 與 FileViewer 共用這一份,不得各自再寫一套):
 *   (1) 目標在保留節點子樹裡;
 *   (2) 目標在保留區**自己開出來的浮層**裡 —— 入口鈕的右鍵選單、面板裡的 Select / Popover 都 portal 到 body,
 *       不在保留區子樹;用觸發器的 `aria-controls` / `aria-owns` 找回開它的元素(Radix menu / popover / select 都會寫),
 *       觸發器在保留區 → 這個浮層算保留區(2026-09-09 user:「遮罩上的 fab 右鍵點擊都無法正常反應」)。
 *       **關閉中也算**:Radix 只在開著時寫 `aria-controls`;滑鼠點選單項 → 選單進入關閉態、屬性已拿掉、
 *       Radix 把焦點還給選單容器 → 那一次 focus-outside 認不出來,並存框當場關掉(2026-09-10 user:
 *       「點擊展開後的選單選項…會直接關閉當前開啟的 dialog」;鍵盤 Enter 不會,因為指標不在選單上、沒有那次還焦點)。
 *       所以三道認法:觸發器的 `aria-controls` / `aria-owns`(開著時)→ 浮層自己的 `aria-labelledby` 指回觸發器(Radix menu
 *       關閉中仍在)→ 認過一次的浮層 id 記憶(其他浮層的關閉階段)。屬性還在時以屬性為準(觸發器已不在保留區 → 不算)。
 *   (3) 目標在疊在上面的另一個 dialog 裡(沒有 URL 的確認框;v14 第 9 題「取消後兩邊恢復」)。
 * @param keep     保留節點(同 useOverlayCoexistence 的 keep)
 * @param getSelf  並存浮層自己的內容節點(第 3 條要排除自己)
 */
export function createPersistentGuard(keep: CoexistenceTargets, getSelf: () => Element | null) {
  const confirmed = new Set<string>()
  const escapeId = (id: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&'))
  return (node: EventTarget | null): boolean => {
    if (!(node instanceof Node)) return false
    const kept = keep().filter((el): el is Element => !!el)
    if (kept.some((el) => el.contains(node))) return true
    const start = node instanceof Element ? node : node.parentElement
    for (let cur: Element | null = start; cur; cur = cur.parentElement) {
      // 反向關係:Radix menu content 無條件寫 `aria-labelledby` = 觸發器 id(關閉中也還在),被指向者在保留區就算(Codex R21 對照)
      const labelledBy = cur.getAttribute('aria-labelledby')
      if (labelledBy && labelledBy.split(/\s+/).some((ref) => { const el = ref ? document.getElementById(ref) : null; return !!el && kept.some((k) => k.contains(el)) })) {
        if (cur.id) confirmed.add(cur.id)
        return true
      }
      if (!cur.id) continue
      const opener = document.querySelector(`[aria-controls="${escapeId(cur.id)}"], [aria-owns="${escapeId(cur.id)}"]`)
      if (opener) {
        if (kept.some((el) => el.contains(opener))) {
          confirmed.add(cur.id)
          return true
        }
        continue
      }
      if (confirmed.has(cur.id)) return true
    }
    const other = start?.closest('[role="dialog"]')
    return !!other && other !== getSelf()
  }
}

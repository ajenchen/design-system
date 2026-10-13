/**
 * @internal — 舞台幾何:「常駐件在舞台上佔掉哪裡」的唯一通道(DS 內部:登記者與讀者都在 DS 裡,不是 consumer API)。
 *
 * 由來(user 2026-08-08 原話):「toast 一樣落在舞台上啊
 * 反正視覺和互動的結果就是把原本的畫面挪出了一個空間放 ai agent,而其他的元件都應該按照原本的規則在舞台運作得好好的才對吧？」
 *
 * 舞台 = 畫面扣掉代理面板之後的那一塊(`components/AgentPanel/agent-panel.spec.md`「量的是容器不是視窗」)。
 * 常駐件把佔掉的部分登記在這裡,頁面層的浮動訊息(Toast)讀它決定落點 —— 兩邊互不 import,
 * 也不靠 consumer 手動接線(`<Toaster />` 是 app-level-one,見 `components/Toast/toast.spec.md`「落點」)。
 *
 * 兩種佔法(各只有一個登記者):
 * - `edge`  沿舞台右緣切走一條:並排的代理面板(`AgentPanel`,蓋板態不登記 —— 蓋板沒有挪出空間,舞台仍是全寬)。
 *           舞台右緣 = 這個盒子的左緣。
 * - `corner` 佔住舞台右下角:在家的入口鈕(`AgentFabDock`,貼邊態不登記 —— 角落已讓出來)。
 *           浮動訊息疊在它上方,間距由登記者給(入口鈕自己離舞台邊的 `--layout-space-loose`)。
 *
 * **量的是版面,不是畫面**:登記者交出的盒子不得含進場位移 / 懸停放大 / 位置過渡的中間值
 * (面板開啟時 slide-in 16px、入口鈕飛回家 250ms —— 量到中間值,浮動訊息就停在錯的地方,而且之後沒有任何 resize 會把它校正回來)。
 *
 * **量自讀者的定位框,不是視窗**:讀者交出一個量尺元素(`<Toaster>` 的 `position: fixed; inset: 0` span,跟 Toast 清單同一個包含塊),
 * 距離 = 「離**這個框**的右緣 / 下緣多遠」。一般 app 這個框就是視窗;祖先有 transform 時(Storybook docs 頁每則 story 的外框)
 * 是那個祖先 —— 量自視窗會差出祖先離視窗右緣的那一段(2026-10-13 複審:docs 頁差 221px)。
 * **只算跟定位框相交的佔用**:框外的東西不在這份舞台上(docs 頁同時有十幾則 story 的面板登記,各自的 Toast 只讓自己那一則的)。
 *
 * 讀者(`useStageGeometry`)以 ResizeObserver 觀察登記者交出的元素(面板本身 + 宿主 / 入口鈕的舞台)與量尺,
 * 另聽視窗 resize 與任何捲動(capture;每影格最多量一次)—— 佔用者在捲動的內容裡時,畫面位置會變而尺寸不變,ResizeObserver 看不到。
 * 讀者拿到的是距離,不是座標,render 期間不碰 `window` / `document`(SSR-safe)。
 * 沒有任何登記時回 `NO_STAGE_CLAIM`,讀者應當什麼都不改(沒有代理的頁面逐像素不變)。
 */

import * as React from 'react'

/** 視窗座標的盒子(px)。 */
export interface StageBox {
  left: number
  top: number
  right: number
  bottom: number
}

export type StageClaim =
  | {
      kind: 'edge'
      /** 此刻的版面盒子(不含自身 transform);回 null = 這一格沒有版面,不算。 */
      box: () => StageBox | null
      /** 尺寸一變就要重量的元素(自身 + 宿主)。 */
      observe: () => Element[]
    }
  | {
      kind: 'corner'
      box: () => StageBox | null
      observe: () => Element[]
      /** 浮動訊息與它之間要留的距離(px)。 */
      gap: () => number
    }

export interface StageGeometry {
  /** 舞台右緣離定位框右緣多遠(px);null = 沒有東西切走右緣。 */
  rightInset: number | null
  /** 浮動訊息底緣最低可到離定位框下緣多遠(px;= 角落佔用者頂 − 間距);null = 角落沒被佔。 */
  bottomInset: number | null
}

export const NO_STAGE_CLAIM: StageGeometry = { rightInset: null, bottomInset: null }

const claims = new Set<StageClaim>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/**
 * 登記一筆佔用;傳 null = 這一刻沒有佔(例:面板翻成蓋板、入口鈕貼邊)。
 * claim 物件要穩定(呼叫端以 useMemo 依「是否佔用」建),換一個物件 = 撤銷舊的、登記新的。
 */
export function useStageClaim(claim: StageClaim | null) {
  React.useLayoutEffect(() => {
    if (!claim) return
    claims.add(claim)
    notify()
    return () => {
      claims.delete(claim)
      notify()
    }
  }, [claim])
}

/** 盒子扣掉元素**自己**的 transform 位移(進場 slide-in 等),得到版面位置。只處理平移 —— 登記者不得用縮放 / 旋轉的盒子。 */
export function untransformedBox(el: Element): StageBox {
  const r = el.getBoundingClientRect()
  const t = getComputedStyle(el).transform
  if (!t || t === 'none') return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  const m = new DOMMatrixReadOnly(t)
  return { left: r.left - m.m41, top: r.top - m.m42, right: r.right - m.m41, bottom: r.bottom - m.m42 }
}

/**
 * 把此刻所有登記換算成距離。純函式(輸入 = 盒子 + 定位框,都是視窗座標),供讀者與閘共用。
 * 定位框 = 讀者那份浮動清單的 `position: fixed` 包含塊;與它不相交的佔用不算(不在這份舞台上)。
 */
export function resolveStageGeometry(
  entries: ReadonlyArray<{ kind: 'edge' | 'corner'; box: StageBox | null; gap?: number }>,
  frame: StageBox,
): StageGeometry {
  let rightInset: number | null = null
  let bottomInset: number | null = null
  for (const { kind, box, gap = 0 } of entries) {
    if (!box || box.right <= box.left || box.bottom <= box.top) continue
    if (box.right <= frame.left || box.left >= frame.right || box.bottom <= frame.top || box.top >= frame.bottom) continue
    if (kind === 'edge') {
      const inset = Math.max(0, frame.right - box.left)
      rightInset = rightInset === null ? inset : Math.max(rightInset, inset)
    } else {
      const inset = frame.bottom - (box.top - gap)
      bottomInset = bottomInset === null ? inset : Math.max(bottomInset, inset)
    }
  }
  return rightInset === null && bottomInset === null ? NO_STAGE_CLAIM : { rightInset, bottomInset }
}

function measure(origin: Element | null): StageGeometry {
  if (claims.size === 0) return NO_STAGE_CLAIM
  const root = document.documentElement
  // 量尺不在(還沒掛上)時退回視窗:position:fixed 的包含塊 = 視窗扣掉捲軸 = clientWidth / clientHeight
  const r = origin?.getBoundingClientRect()
  const frame: StageBox = r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : { left: 0, top: 0, right: root.clientWidth, bottom: root.clientHeight }
  return resolveStageGeometry(
    Array.from(claims, (c) => ({ kind: c.kind, box: c.box(), gap: c.kind === 'corner' ? c.gap() : 0 })),
    frame,
  )
}

const sameGeometry = (a: StageGeometry, b: StageGeometry) => a.rightInset === b.rightInset && a.bottomInset === b.bottomInset

/**
 * 讀舞台此刻被佔掉多少,距離量自 `originRef` 那個量尺(讀者浮動清單的定位框;見檔頭「量自讀者的定位框」)。
 * 沒有登記 → `NO_STAGE_CLAIM`(同一個物件,呼叫端可直接比參照)。
 * 用 useEffect 不用 useLayoutEffect:讀者是 app root 的 `<Toaster />`,SSR 時 React 18 會對 useLayoutEffect 印警告
 *(toast.spec.md「A11y 預設」SSR-safe 那一條)。不會晚一格:登記者是在自己的 layout effect 裡 notify,
 * 那一刻讀者的 setState 跟著在 paint 前沖掉;讀者自己掛載時還沒有任何 Toast(sonner 沒有 Toast 就不渲染清單:dist/index.mjs:1091 `if (!filteredToasts.length) return null`),沒有東西會被畫錯。
 * 捲動是例外:捲動事件本來就在畫完之後才來,這一格量、下一格生效(每影格最多量一次)。
 */
export function useStageGeometry(originRef: React.RefObject<Element | null>): StageGeometry {
  const [geometry, setGeometry] = React.useState<StageGeometry>(NO_STAGE_CLAIM)
  React.useEffect(() => {
    let ro: ResizeObserver | null = null
    let raf = 0
    let listeningScroll = false
    const update = () => {
      const next = measure(originRef.current)
      setGeometry((prev) => (sameGeometry(prev, next) ? prev : next))
    }
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        update()
      })
    }
    const listenScroll = (on: boolean) => {
      if (on === listeningScroll) return
      listeningScroll = on
      if (on) window.addEventListener('scroll', onScroll, { capture: true, passive: true })
      else window.removeEventListener('scroll', onScroll, { capture: true })
    }
    const bind = () => {
      ro?.disconnect()
      ro = null
      const active = claims.size > 0
      if (active && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(update)
        claims.forEach((c) => c.observe().forEach((el) => ro?.observe(el)))
        if (originRef.current) ro.observe(originRef.current)
      }
      // 只在有登記時聽捲動:沒有代理的頁面不多掛任何東西(捲動很頻繁,沒有登記時量了也是 NO_STAGE_CLAIM)
      listenScroll(active)
      update()
    }
    listeners.add(bind)
    window.addEventListener('resize', update)
    bind()
    return () => {
      listeners.delete(bind)
      window.removeEventListener('resize', update)
      listenScroll(false)
      if (raf) cancelAnimationFrame(raf)
      ro?.disconnect()
    }
  }, [originRef])
  return geometry
}

import * as React from 'react'

// ── useTruncated — 單行文字截斷偵測引擎(SSOT)─────────────────────────────────
// 收斂 Breadcrumb TruncatedLabel / DataTable TruncateCell / Tag 三處**逐字重複**的
// module-level shared ResizeObserver 引擎 + isTruncated 狀態機為唯一 owner(M17 SSOT)。
//
// 世界級對照(M8):MUI/MUI-X 官方無第一方 primitive,社群共識 = 「hook 量測 scrollWidth>clientWidth
//   + ref + 以 Tooltip `open` prop 條件控制」(issue #37211);此 hook 即該低階量測層,
//   上層 `<TruncatedText>`(patterns/element-anatomy)對應 Ant `Typography.Text ellipsis` 高階元件。
//
// 三處變異點皆以 options 注入,**行為零漂移**:
//   - Breadcrumb / DataTable:預設 scrollWidth>clientWidth。
//   - Tag:trigger≠量測元素(observe root、量測內層 span)+ Canvas measureText(flex 內 scrollWidth
//     不可靠)+ useLayoutEffect(避免 paint flash)+ deps=[children] → 全走 options。

type RoCallback = (entry: ResizeObserverEntry) => void

let sharedRO: ResizeObserver | null = null
const sharedROCallbacks = new WeakMap<Element, RoCallback>()

// 全 DS 共用單一 ResizeObserver,dispatch 到 per-element callback(2026-04-22 DataTable D3 perf audit
// 成果:10 col × 100 row = 1 RO 而非 1000)。element 卸載時 cleanup,singleton RO 本身不 disconnect。
function getSharedRO(): ResizeObserver {
  if (sharedRO) return sharedRO
  sharedRO = new ResizeObserver((entries) => {
    entries.forEach((e) => {
      const cb = sharedROCallbacks.get(e.target)
      if (cb) cb(e)
    })
  })
  return sharedRO
}

function observeShared(el: Element, cb: RoCallback): () => void {
  const obs = getSharedRO()
  sharedROCallbacks.set(el, cb)
  obs.observe(el)
  return () => {
    sharedROCallbacks.delete(el)
    obs.unobserve(el)
  }
}

export interface UseTruncatedOptions {
  /**
   * 偵測策略:回傳 `true` = 截斷、`false` = 未截斷、`undefined` = 本次無法量測(保留前一狀態)。
   * 預設 = `el.scrollWidth > el.clientWidth`(觀察元素自身)。
   * Tag 傳自訂 fn:observe root、內部 `querySelector('[data-tag-text]')` + Canvas measureText。
   */
  measure?: (observedEl: HTMLElement) => boolean | undefined
  /** deps 變更時 cleanup + 重新量測 / 重新訂閱(Tag 傳 `[children]`)。預設 `[]`(mount-once)。 */
  deps?: React.DependencyList
  /**
   * 是否在首次 paint 後以 `requestAnimationFrame` + `setTimeout(100)` 再量一次,捕獲首幀 layout
   * 未完成 / 字型 async load 的假陰性(Breadcrumb 已採此 robust 版)。預設 `true`。
   */
  recheckAfterPaint?: boolean
  /** `'layoutEffect'` = `useLayoutEffect`(量測在 paint 前,避免 flash;Tag 用)/ `'effect'` = `useEffect`。預設 `'effect'`。 */
  timing?: 'effect' | 'layoutEffect'
}

const defaultMeasure = (el: HTMLElement): boolean => el.scrollWidth > el.clientWidth

/**
 * 偵測 ref 所指元素的文字是否被截斷,回傳 `{ ref, isTruncated }`。
 * `isTruncated` 用來驅動 Tooltip「僅截斷時顯示」(對齊 `tooltip.principles.stories.tsx`「沒被截斷就不該顯示 tooltip」)。
 */
export function useTruncated<E extends HTMLElement = HTMLElement>(
  options: UseTruncatedOptions = {},
): { ref: React.MutableRefObject<E | null>; isTruncated: boolean } {
  const { measure = defaultMeasure, deps = [], recheckAfterPaint = true, timing = 'effect' } = options
  // MutableRefObject(consumer 可經 callback ref 寫入 .current 以與 forwardedRef 合併,如 Tag)。
  const ref = React.useRef<E | null>(null)
  const [isTruncated, setIsTruncated] = React.useState(false)

  // measure 每 render 可能是新 closure(consumer inline);收進 ref 讓 effect 不因它重訂閱,
  // 但 RO 回呼仍讀到最新版。
  const measureRef = React.useRef(measure)
  measureRef.current = measure

  // timing 為 call-site 固定字面值(某 consumer 永遠同一值)→ 每個 component instance 每 render
  // 呼叫同一個 effect hook,符合 rules-of-hooks。
  const useIsoEffect = timing === 'layoutEffect' ? React.useLayoutEffect : React.useEffect

  useIsoEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => {
      const r = measureRef.current(el)
      if (r !== undefined) setIsTruncated(r)
    }
    check()
    let raf = 0
    let t: ReturnType<typeof setTimeout> | undefined
    if (recheckAfterPaint) {
      raf = requestAnimationFrame(check)
      t = setTimeout(check, 100)
    }
    const cleanup = observeShared(el, check)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (t) clearTimeout(t)
      cleanup()
    }
    // deps 由 consumer 決定(Tag: [children];其餘: []);measure 走 ref 不需進 deps。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { ref, isTruncated }
}

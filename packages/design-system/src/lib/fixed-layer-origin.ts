/**
 * @internal — `position: fixed` 浮層此刻真正的定位基準(containing block)換算(2026-11-26,workspace F 組 F3)。
 *
 * **為什麼要有這支**:`position: fixed` 的元素平常以視窗為基準,所以「拿 `getBoundingClientRect()` 的視窗座標直接寫進
 * `style.left / top`」剛好對。但只要祖先帶 transform / translate / scale / filter / contain 之類的屬性,fixed 的基準就換成
 * 那個祖先的 padding box(MDN Containing block:「If the position property is absolute or fixed, the containing block may also be
 * formed by the edge of the padding box of the nearest ancestor element that has any of the following: A filter, backdrop-filter,
 * transform, perspective, rotate, scale, or translate value other than none.」,https://developer.mozilla.org/en-US/docs/Web/CSS/Containing_block),
 * 視窗座標就多偏出那個祖先的原點。DS 自己的 Dialog 置中就靠 `-translate-x/y-1/2`(Tailwind v4 編譯成獨立的 `translate` 屬性),
 * AppShell 也明文支援放在帶 transform 的畫布裡(`patterns/app-shell/app-shell.spec.md` portalContainer)。
 *
 * **直接量,不列舉屬性**(M37):會產生定位基準的屬性清單有瀏覽器差異(MDN 同頁「There are browser inconsistencies with perspective
 * and filter」;Floating UI `isContainingBlock` 為此分 WebKit 分支),列舉就是拿「我想得到的屬性」代替「此刻真正的基準」。
 * 這裡只量**和浮層同一個定位基準、而且本身不會被任何人位移的** fixed 參考物此刻畫在哪裡,反推基準的原點與縮放:
 *   - `originFromInsetLayer`:`position: fixed; inset: 0` 的宿主層 —— 它的框就是基準的 padding box(沒有這類祖先時 = 視窗)。
 *   - `originFromProbe`:跟浮層放在同一個 portal 目標裡的常駐探針(`FIXED_ORIGIN_PROBE_*`:零尺寸、看不見的 fixed 點 (0,0),
 *     裡面再一個零尺寸的點在 (100,100))—— 原點 = 第一點的位置,縮放 = 兩點距離 ÷ 100。
 * **不量浮層本身**(2026-11-26 規格核對抓到):拿浮層自己的位置當基準,浮層身上的任何位移(量具注入的偏移、樣式誤套的 translate)
 * 都會在下一次重量時被當成「基準」扣掉、從此量不出來 —— 那是拿「浮層此刻在哪」代替「基準在哪」(M37)。`data-table-handle-position.mjs
 * --hover=follow --selftest` 的 20px 注入偏移因此漏抓過。
 * 縮放涵蓋 Dialog 進場 `zoom-in-95` 那一段。只處理平移 + 縮放(旋轉 / 歪斜不在範圍)。
 *
 * **沒有這類祖先時逐字不變**:量到的原點與縮放離「視窗」不到 `IDENTITY_EPSILON` 就回 `VIEWPORT_ORIGIN`,
 * `toLocal` 回傳的就是原本的視窗座標(同一個數字,不是近似值),既有閘零差異。
 *
 * 宿主:`components/DataTable/data-table.tsx` RowDragHandle(列拖曳把手)、
 * `components/DataTable/data-table-interaction-layer.tsx`(試算表格游標 / 滑過框 / 浮層編輯器那一層)。
 */

/** fixed 浮層的定位基準:原點(視窗座標)與縮放。`toLocal` 把視窗座標換成可以直接寫進 `style.left / top` 的值。 */
export interface FixedLayerOrigin {
  readonly x: number
  readonly y: number
  readonly sx: number
  readonly sy: number
}

/** 基準就是視窗(沒有會產生定位基準的祖先) */
export const VIEWPORT_ORIGIN: FixedLayerOrigin = Object.freeze({ x: 0, y: 0, sx: 1, sy: 1 })

/** 原點偏移 < 0.5px、縮放偏離 < 0.1% 視為就是視窗(版面取整的次像素殘差;真的偏移都是整段祖先原點) */
const IDENTITY_EPSILON = { px: 0.5, scale: 0.001 }

function normalize(o: FixedLayerOrigin): FixedLayerOrigin {
  const finite = Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.sx) && Number.isFinite(o.sy) && o.sx > 0 && o.sy > 0
  if (!finite) return VIEWPORT_ORIGIN
  const nearViewport = Math.abs(o.x) < IDENTITY_EPSILON.px && Math.abs(o.y) < IDENTITY_EPSILON.px
    && Math.abs(o.sx - 1) < IDENTITY_EPSILON.scale && Math.abs(o.sy - 1) < IDENTITY_EPSILON.scale
  return nearViewport ? VIEWPORT_ORIGIN : o
}

/** `position: fixed; inset: 0` 的層:它畫出來的框 = 定位基準的 padding box。 */
export function originFromInsetLayer(layer: HTMLElement): FixedLayerOrigin {
  const r = layer.getBoundingClientRect()
  return normalize({
    x: r.left,
    y: r.top,
    sx: layer.offsetWidth > 0 ? r.width / layer.offsetWidth : 1,
    sy: layer.offsetHeight > 0 ? r.height / layer.offsetHeight : 1,
  })
}

/** 探針第二點離第一點的距離(基準座標 px);兩點距離 ÷ 這個值 = 縮放 */
export const FIXED_ORIGIN_PROBE_SPAN = 100
/** 探針外層(第一點,基準的 (0,0)):零尺寸、看不見、不接指標;跟浮層放在同一個 portal 目標 → 同一個定位基準 */
export const FIXED_ORIGIN_PROBE_STYLE = {
  position: 'fixed', left: 0, top: 0, width: 0, height: 0, overflow: 'visible', visibility: 'hidden', pointerEvents: 'none',
} as const
/** 探針內層(第二點,基準的 (SPAN, SPAN)) */
export const FIXED_ORIGIN_PROBE_INNER_STYLE = {
  position: 'absolute', left: FIXED_ORIGIN_PROBE_SPAN, top: FIXED_ORIGIN_PROBE_SPAN, width: 0, height: 0,
} as const

/**
 * 常駐探針(外層 = `FIXED_ORIGIN_PROBE_STYLE`,唯一子元素 = `FIXED_ORIGIN_PROBE_INNER_STYLE`)→ 它所在的 fixed 定位基準。
 * 呼叫端在**寫新座標之前**讀(那時版面是乾淨的,不多一次強制排版)。結構不對(沒有子元素)回視窗。
 */
export function originFromProbe(probe: HTMLElement): FixedLayerOrigin {
  const inner = probe.firstElementChild
  if (!inner) return VIEWPORT_ORIGIN
  const a = probe.getBoundingClientRect()
  const b = inner.getBoundingClientRect()
  return normalize({
    x: a.left,
    y: a.top,
    sx: (b.left - a.left) / FIXED_ORIGIN_PROBE_SPAN,
    sy: (b.top - a.top) / FIXED_ORIGIN_PROBE_SPAN,
  })
}

/** 視窗座標 → 寫進 fixed 元素 `style.left / top` 的值。基準是視窗時原樣回傳。 */
export function toLocal(o: FixedLayerOrigin, viewportX: number, viewportY: number): { left: number; top: number } {
  if (o === VIEWPORT_ORIGIN) return { left: viewportX, top: viewportY }
  return { left: (viewportX - o.x) / o.sx, top: (viewportY - o.y) / o.sy }
}

/** 視窗座標的矩形 → 基準座標的矩形(寬高除以縮放 = 版面尺寸)。基準是視窗時原樣回傳同一個物件。 */
export function toLocalRect<R extends { x: number; y: number; width: number; height: number }>(o: FixedLayerOrigin, rect: R): R {
  if (o === VIEWPORT_ORIGIN) return rect
  return { ...rect, x: (rect.x - o.x) / o.sx, y: (rect.y - o.y) / o.sy, width: rect.width / o.sx, height: rect.height / o.sy }
}

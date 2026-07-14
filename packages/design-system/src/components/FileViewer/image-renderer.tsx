// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
  type ReactZoomPanPinchContentRef,
} from 'react-zoom-pan-pinch'
import type { FileRendererProps } from './file-viewer-types'

/**
 * ImageRenderer — FileViewer 的圖片 renderer。
 *
 * ── 世界級 zoom semantic canonical(2026-04-21 重寫)──
 * Figma / Preview.app / Adobe Acrobat / Google Drive 共通:
 *   - `100%` = image natural pixel size(**非** CSS contain-scaled)
 *   - 開圖預設 fit-to-page(image 自動 fit,zoom input 顯示 fit % 如 40%)
 *   - `fit-to-width` = image width 填滿 container width(portrait 會 overflow 垂直)
 *   - `fit-to-page` = image 完整可見(contain semantic)
 *   - `+/-` preset 改 zoom 對應 natural 倍率,精準
 *
 * ── 實作細節 ──
 * image 不走 CSS `object-contain`(那會 pre-scale,導致 transform.scale 解讀錯誤);
 * 改走 **natural size + transform scale 管實際顯示**。onLoad 時算 fit-page scale
 * 再 `onZoomChange(fitPct)` 將 UI zoom 同步到真實倍率。
 *
 * ── 為什麼消費 react-zoom-pan-pinch ──
 * Zoom + pan 是行為 primitive;自寫 pinch / wheel 踩大量 edge case
 * (trackpad vs mouse / momentum / bounds),library 是 canonical 解法
 * (世界級 Figma Community / Miro embed / PhotoSwipe 同類流派)。
 */

const MIN_SCALE = 0.1 // 10%
const MAX_SCALE = 4.0 // 400%

type FitMode = 'fit-width' | 'fit-page'

export const ImageRenderer: React.FC<FileRendererProps> = ({
  file,
  zoom,
  onZoomChange,
  fitRequest,
  onCapabilitiesChange,
}) => {
  const apiRef = React.useRef<ReactZoomPanPinchContentRef | null>(null)
  const imgRef = React.useRef<HTMLImageElement | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [loaded, setLoaded] = React.useState(false)
  // 2026-05-16 Round 5 codex audit fix:capture image-load rAF ID + cancel on unmount
  // (原 uncancelled rAF 可能 unmount 後 fire onZoomChange → setState 後 component 已 gone)
  const handleImageLoadRafIdRef = React.useRef<number>(0)
  React.useEffect(() => () => { if (handleImageLoadRafIdRef.current) cancelAnimationFrame(handleImageLoadRafIdRef.current) }, [])
  // Q2 RWD:track「user 最後一次的 zoom 意圖」— fit-page / fit-width 自動 reflow,manual 不動。
  // 對齊 Apple Photos / Drive canonical:resize 時若 user 在 fit mode → recompute,manual zoom → 維持。
  const lastFitModeRef = React.useRef<FitMode | 'manual'>('fit-page')
  // 區分「user wheel/pinch」vs「programmatic centerView」— lib onTransform 兩者都觸發,
  // 用 flag 防 programmatic 的 onTransform 誤標 mode = manual。
  const programmaticZoomRef = React.useRef(false)

  // 宣告 capability — shell 用此決定 toolbar 內容。
  React.useEffect(() => {
    onCapabilitiesChange({ zoom: true })
  }, [onCapabilitiesChange])

  // file.url 切換 → reset state,等 onLoad 重 fit。
  // 原本 bug:cache 命中時 onLoad 不 fire → handleImageLoad 不跑 → zoom 卡上一張的值
  // (或 shell 設的 100%)→ user 看到「同一張圖每次切過來尺寸不一致」。
  React.useEffect(() => {
    setLoaded(false)
    lastFitModeRef.current = 'fit-page'
    // cache 命中(<img complete>)→ onLoad 可能不 fire,直接觸發 handleImageLoad 邏輯
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth > 0) {
      // 等下一個 microtask,確保 ref / state 都到位
      Promise.resolve().then(() => handleImageLoad())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.url])

  // 算 fit scale(container 寬高 / image natural 寬高)
  const computeFitScale = React.useCallback((fit: FitMode): number | null => {
    const img = imgRef.current
    const container = containerRef.current
    if (!img || !container) return null
    if (!img.naturalWidth || !img.naturalHeight) return null
    const cw = container.clientWidth
    const ch = container.clientHeight
    if (cw <= 0 || ch <= 0) return null
    const widthRatio = cw / img.naturalWidth
    const heightRatio = ch / img.naturalHeight
    // fit-width = 寬填滿;fit-page = 完整可見(取較小 scale)
    return fit === 'fit-width' ? widthRatio : Math.min(widthRatio, heightRatio)
  }, [])

  const clampToPct = React.useCallback((scale: number): number => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
    // Floor 而非 round:fit-to-page / fit-to-width 時 scale 是 float(e.g. 0.8356)。
    // round(0.8356 * 100) = 84 → 實際 scale 0.84 → image 比 canvas 大 4px,垂直溢出破壞
    // 對稱置中(user 抓:「上下邊距不對稱」)。Floor → 0.83 → image 比 canvas 小,永遠
    // 完整可見 + 視覺 symmetric padding。代價是最多 ~1% 的空間餘量,視覺幾乎看不出。
    return Math.floor(clamped * 100)
  }, [])

  // Image onLoad → 自動 fit-to-page(世界級開圖預設)
  const handleImageLoad = React.useCallback(() => {
    setLoaded(true)
    const scale = computeFitScale('fit-page')
    if (scale == null) return
    const pct = clampToPct(scale)
    lastFitModeRef.current = 'fit-page'
    // 等 transform 就緒再更新(避免 initialScale=1 → fit 過程跳兩段)
    if (handleImageLoadRafIdRef.current) cancelAnimationFrame(handleImageLoadRafIdRef.current)
    handleImageLoadRafIdRef.current = requestAnimationFrame(() => {
      handleImageLoadRafIdRef.current = 0
      onZoomChange(pct)
    })
  }, [computeFitScale, clampToPct, onZoomChange])

  // Q2 RWD:container resize 時若在 fit mode 重算 — 對齊 Apple Photos / Drive canonical
  // rAF debounce:drag window edge 期間 ResizeObserver 連續 fire 數十次,
  // 合併到下一 frame 只觸發一次 → 避免 race / 過多 centerView animation 互相打斷。
  React.useEffect(() => {
    if (!loaded) return
    const container = containerRef.current
    if (!container) return
    let rafId = 0
    // manual mode 視覺中心保持需要前次容器尺寸(比對 delta 反推新 position)
    let prevW = container.clientWidth
    let prevH = container.clientHeight
    const obs = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        rafId = 0
        const mode = lastFitModeRef.current
        const newW = container.clientWidth
        const newH = container.clientHeight
        if (mode === 'manual') {
          // 2026-07-08 Q2 補洞(user「畫布在各種情況都能完美適應」):manual zoom 下容器 resize
          //(InfoPanel 開合 / Filmstrip 增減 / 視窗 RWD / 裝置旋轉 — 同一咽喉點全涵蓋)
          // = **scale 不變、視覺中心點保持**(Figma / Photoshop canonical;原本 early-return
          // 什麼都不做 → transform 座標絕對值,容器變窄內容偏移)。
          // 幾何:舊容器中心對到的內容點 (cx,cy),resize 後把同一內容點放到新容器中心。
          const api = apiRef.current
          if (api && (newW !== prevW || newH !== prevH)) {
            const { positionX, positionY, scale } = api.state
            const cx = (prevW / 2 - positionX) / scale
            const cy = (prevH / 2 - positionY) / scale
            programmaticZoomRef.current = true
            api.setTransform(newW / 2 - cx * scale, newH / 2 - cy * scale, scale, 0)
            // setTransform 同步無動畫;下一 frame 解 flag(防 onTransform 誤標 manual→已是 manual,保守處理)
            requestAnimationFrame(() => { programmaticZoomRef.current = false })
          }
          prevW = newW
          prevH = newH
          return
        }
        prevW = newW
        prevH = newH
        const scale = computeFitScale(mode)
        if (scale == null) return
        onZoomChange(clampToPct(scale))
      })
    })
    obs.observe(container)
    return () => {
      obs.disconnect()
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [loaded, computeFitScale, clampToPct, onZoomChange])

  // Q3 雙擊 toggle fit ↔ 100%(對齊 Apple Photos / Preview.app / Imgur / PhotoSwipe canonical)
  const handleDoubleClick = React.useCallback(() => {
    if (!loaded) return
    const fitScale = computeFitScale('fit-page')
    if (fitScale == null) return
    const fitPct = clampToPct(fitScale)
    // 在 fit-page 附近(±5pt)→ 跳 100% natural;否則 → 回 fit-page
    const atFit = Math.abs(zoom - fitPct) < 5
    const targetPct = atFit ? 100 : fitPct
    lastFitModeRef.current = atFit ? 'manual' : 'fit-page'  // 跳 100% = manual,回 fit = fit mode
    onZoomChange(targetPct)
  }, [loaded, zoom, computeFitScale, clampToPct, onZoomChange])

  // 外部 zoom 變動(preset / ± / 打字 / fit request)→ centerView 重定位
  // library canonical `centerView` 同時處理 scale + 置中 + animation + bounds。
  React.useEffect(() => {
    const api = apiRef.current
    if (!api || !loaded) return
    const currentScale = api.state.scale
    const targetScale = zoom / 100
    if (Math.abs(currentScale - targetScale) < 0.005) return
    // 標記 programmatic — onTransform 期間不要被誤標 manual mode
    programmaticZoomRef.current = true
    api.centerView(targetScale, 200)
    // 動畫 ~200ms + buffer 後解 flag
    const t = setTimeout(() => { programmaticZoomRef.current = false }, 280)
    return () => clearTimeout(t)
  }, [zoom, loaded])

  // Fit request(toolbar 菜單點 fit-width / fit-page)→ 算 scale emit 回 shell
  React.useEffect(() => {
    if (!fitRequest || !loaded) return
    const scale = computeFitScale(fitRequest.fit)
    if (scale == null) return
    lastFitModeRef.current = fitRequest.fit  // 記 fit mode 給 ResizeObserver 用
    onZoomChange(clampToPct(scale))
  }, [fitRequest, loaded, computeFitScale, clampToPct, onZoomChange])

  // 內部 wheel / pinch zoom → 同步回 shell + 標記為 manual mode(打破 fit auto-reflow)
  // programmatic centerView 期間 lib 也會 fire onTransform → 用 flag 跳過,避免誤標 manual。
  const handleTransformed = React.useCallback(
    (_ref: ReactZoomPanPinchRef, state: { scale: number }) => {
      if (programmaticZoomRef.current) return  // programmatic update,不標 manual
      const nextZoom = Math.round(state.scale * 100)
      if (nextZoom !== zoom) {
        lastFitModeRef.current = 'manual'
        onZoomChange(nextZoom)
      }
    },
    [zoom, onZoomChange],
  )

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden" onDoubleClick={handleDoubleClick}>
      <TransformWrapper
        // TransformWrapper ref = ReactZoomPanPinchContentRef(dist/index.d.ts:351 + export L399);型別有 export → 用真型別,不需 as any
        ref={apiRef}
        initialScale={1}
        minScale={MIN_SCALE}
        maxScale={MAX_SCALE}
        centerOnInit
        centerZoomedOut
        // Teams 對標(2026-04-23):image viewer 走 chat-app lightbox 慣例 —
        // drag 時 image 保持在 canvas bounds 內(zoom-fit 時 drag 無意義,zoom-in 時 drag pan 有限制)。
        // `limitToBounds=true` 跟 Microsoft Teams / Slack / iOS Photos 等 chat-lightbox 互動一致,
        // 避免 Figma-canvas 式「可 drag 到任意位置」的無界體驗混淆 viewer 語境。
        limitToBounds={true}
        // Wheel zoom canonical:
        // - `step: 0.03` = 每 tick ~3% scale,對齊 Figma / Preview.app 細緻度
        //   (原 0.1 = 10% 太粗,接近 Google Slides 離散慣例)
        // - wheel zoom = `scale + delta × step` 加法線性(handleCalculateWheelZoom,
        //   dist/index.esm.js:1265;非 multiplicative/log —— 乘算 exp 只用於 setup smooth 的按鈕 zoom path)
        // 註:lib 型別無 `smoothStep` / `smoothScroll` key(僅 setup `smooth?:boolean` 走按鈕 exp、
        // 不影響 wheel);trackpad 平滑度目前無對應 wheel prop 可調
        wheel={{ step: 0.03 }}
        // Q3 雙擊改自定 handler:lib `mode: 'reset'` 永遠 reset 到 initialScale=1 → 100%,
        // 失去 fit ↔ 100% toggle UX(Apple Photos / Drive canonical)。disabled lib 預設 + 自定 onDoubleClick。
        doubleClick={{ disabled: true }}
        onTransform={handleTransformed}
      >
        {/* 2026-04-23 debug fix:contentClass 不設 `!w-full !h-full`。
            設 `!w-full !h-full` 會讓 `.react-transform-component` 強制 1280×752 容器尺寸,
            但 image 是 natural 1440×900(自然溢出 container)。Library `centerView(scale)`
            基於 component 尺寸計算 translate → 計算偏 61px(視 image 被 WRAPPER 框住而非
            自然 size)。
            移除 content fixed size 後:component 自然 size = image natural → library 以
            image 實際尺寸計算置中,translate 正確(42.4, 2.5)得到 symmetric padding。
            wrapper 保留 `!w-full !h-full` 作 interaction capture bounds。 */}
        <TransformComponent wrapperClass="!w-full !h-full">
          <img
            ref={imgRef}
            src={file.url}
            alt={file.name}
            onLoad={handleImageLoad}
            draggable={false}
            // natural size(**不走 object-contain**)— transform scale 管實際顯示大小
            className="max-w-none max-h-none select-none"
            style={{ pointerEvents: 'none' }}
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}
ImageRenderer.displayName = 'ImageRenderer'

// canRenderImage 已拆至 ./can-render-image(2026-07-06 D3 bundle fix)——
// shell 需同步呼叫它,而本檔頂層 import react-zoom-pan-pinch;留在本檔會把整個 lib
// 拉進 shell 的靜態 import graph,React.lazy 切分就失效。

/**
 * Geometry diagnostic — Storybook addon Top 3 #1(2026-05-12 codex Q1 verdict)。
 *
 * 目的:Windows / cross-DPR 環境下 overlay 視覺漂移時,一次性 dump
 * (a) viewport metrics — DPR / innerWidth / clientWidth / scrollbar width / visualViewport
 * (b) document context — html/body computed transform / zoom / overflow / writing mode
 * (c) overlay vs target — overlay root rect / target rect / 計算 outline 應位置
 *
 * Playwright test assert:overlay outline rect ≈ target rect within 1 CSS px,
 * 跨 deviceScaleFactor: 1, 1.25, 2(對齊 Chrome DevTools cross-platform regression coverage)。
 *
 * 對齊 codex Q1 verdict「fixed viewport overlay + getBoundingClientRect 在 iframe 正常 idiom;
 * 但需加 diagnostic 排除 body/html transform/zoom 異常 OR Windows font fallback metric 問題」。
 *
 * 對齊 MDN getComputedStyle resolved-values canonical(無 Windows-specific calc/var unresolved string bug)。
 */

export interface GeometryDiagnostic {
  ts: string  // ISO timestamp
  // ── (a) viewport metrics ───────────────────────────────────────────────
  devicePixelRatio: number
  innerWidth: number
  innerHeight: number
  clientWidth: number
  clientHeight: number
  /** scrollbar gutter width(計算公式 innerWidth - clientWidth)*/
  scrollbarGutterWidth: number
  visualViewport: {
    width: number
    height: number
    offsetLeft: number
    offsetTop: number
    pageLeft: number
    pageTop: number
    scale: number
  } | null
  // ── (b) document context ────────────────────────────────────────────────
  documentElement: {
    transform: string
    zoom: string
    overflow: string
    overflowX: string
    overflowY: string
    writingMode: string
    direction: string
  }
  body: {
    transform: string
    zoom: string
    overflow: string
    overflowX: string
    overflowY: string
    scrollLeft: number
    scrollTop: number
  }
  // ── (c) overlay + target rects ──────────────────────────────────────────
  overlayRoot: DOMRect | null
  target: DOMRect | null
  /** Pixel delta:|target.{edge} - overlay.{edge}|(理想 < 1)*/
  deltaTopLeft: { top: number; left: number; width: number; height: number } | null
}

const OVERLAY_ID = '__ds_devmode_overlay__'

/** Pure function — capture current diagnostic snapshot. */
export function captureGeometryDiagnostic(targetEl?: Element | null): GeometryDiagnostic {
  const html = document.documentElement
  const body = document.body
  const htmlCs = window.getComputedStyle(html)
  const bodyCs = window.getComputedStyle(body)

  // 2026-05-13 codex V3 fix:diagnostic 必量真正 outline child rect(addon overlay 內的紫色 outline div)
  // 而非 overlay root(fixed inset:0 = viewport,delta 永遠 0,毫無意義)。
  // outline child 是 overlay root 的第一個 absolute-positioned <div>(per `overlay.ts:338-343`
  // `position:absolute;left:${rect.left-1}px;top:${rect.top-1}px;width:${rect.width}px;height:${rect.height}px`)。
  const overlayRoot = (document.getElementById(OVERLAY_ID) as HTMLElement | null)
  const outlineEl = overlayRoot
    ? overlayRoot.querySelector<HTMLDivElement>(':scope > div[style*="border"]')
    : null
  const overlayRect = outlineEl ? outlineEl.getBoundingClientRect() : null
  const targetRect = targetEl ? targetEl.getBoundingClientRect() : null

  let deltaTopLeft: GeometryDiagnostic['deltaTopLeft'] = null
  if (overlayRect && targetRect) {
    // Outline 視覺 2px border + offset -1 →在 width/height 比 target 多 4px
    // (per overlay.ts left/top: rect.left-1, width: rect.width, box-sizing:content-box)。
    // 對齊判斷:overlay.left ≈ target.left - 1,overlay.width ≈ target.width + 4,所以 delta 算「rectified」。
    deltaTopLeft = {
      top: Math.abs(targetRect.top - (overlayRect.top + 1)),
      left: Math.abs(targetRect.left - (overlayRect.left + 1)),
      width: Math.abs(targetRect.width - (overlayRect.width - 4)),
      height: Math.abs(targetRect.height - (overlayRect.height - 4)),
    }
  }

  return {
    ts: new Date().toISOString(),
    devicePixelRatio: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: html.clientWidth,
    clientHeight: html.clientHeight,
    scrollbarGutterWidth: window.innerWidth - html.clientWidth,
    visualViewport: window.visualViewport
      ? {
          width: window.visualViewport.width,
          height: window.visualViewport.height,
          offsetLeft: window.visualViewport.offsetLeft,
          offsetTop: window.visualViewport.offsetTop,
          pageLeft: window.visualViewport.pageLeft,
          pageTop: window.visualViewport.pageTop,
          scale: window.visualViewport.scale,
        }
      : null,
    documentElement: {
      transform: htmlCs.transform,
      zoom: htmlCs.zoom,
      overflow: htmlCs.overflow,
      overflowX: htmlCs.overflowX,
      overflowY: htmlCs.overflowY,
      writingMode: htmlCs.writingMode,
      direction: htmlCs.direction,
    },
    body: {
      transform: bodyCs.transform,
      zoom: bodyCs.zoom,
      overflow: bodyCs.overflow,
      overflowX: bodyCs.overflowX,
      overflowY: bodyCs.overflowY,
      scrollLeft: body.scrollLeft,
      scrollTop: body.scrollTop,
    },
    overlayRoot: overlayRect,
    target: targetRect,
    deltaTopLeft,
  }
}

/**
 * Expose diagnostic globally(Playwright test 抓 `window.__ds_devmode_diagnostic(targetSelector)`)。
 * 在 preview.ts import side-effect 後可用。
 */
declare global {
  interface Window {
    __ds_devmode_diagnostic?: (selector?: string) => GeometryDiagnostic
  }
}

export function installGeometryDiagnosticGlobal(): void {
  if (typeof window === 'undefined') return
  window.__ds_devmode_diagnostic = (selector?: string) => {
    const target = selector ? document.querySelector(selector) : null
    return captureGeometryDiagnostic(target)
  }
}

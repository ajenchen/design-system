/**
 * Redline overlay rendered inside the canvas iframe document.
 * Built imperatively (no React) — cheap + no iframe bundling concerns.
 *
 * Visual idiom mix(2026-04-25):
 * - Element badge + 18×12 size gate → 對齊 **Chrome `tool_highlight.ts`**(實際 source
 *   verified:`drawElementTitle` arrow-width + arrowInset 同源)。
 * - Distance line + T-cap + extension lines + red label → **Sketch / Figma / CAD redline 派**
 *   (Chrome 沒 inter-element distance 測量功能,inspector_overlay 無此 component)。
 * - Padding/margin per-side 數字 → **不畫於 canvas**(Chrome 只畫色塊,per-side 數字僅
 *   在 panel — 我們同 idiom)。
 *
 * Panel canonical:任何 value 都能在 Panel 看到 — 4-rect anatomy(margin/border/padding/
 * content + position 5 層,Chrome `MetricsSidebarPane.ts` 同源)/ 4 邊 padding / margin /
 * distancesToParent / Author CSS。
 *
 * 落地規則:
 * - Property badge:rect.width < BADGE_MIN_W OR rect.height < BADGE_MIN_H → suppress。
 * - Distance label:line length < LABEL_MIN_LINE → 不畫數字,只畫 line + T-cap。
 * - Compact label style(font 10px / padding 1px 4px / halo 1px)— 比 11px+halo 2px 省 ~10px
 *   寬度,小距離 fit 範圍擴大。
 */
const OVERLAY_ID = '__ds_devmode_overlay__'

// Threshold constants(對齊 Chrome inspector_overlay/tool_highlight.ts)
const BADGE_MIN_W = 18  // Chrome 同值:arrowWidth + 2 * arrowInset
const BADGE_MIN_H = 12  // 我們 redline 派 minimum;< 12 連 outline 視覺都太小,badge 多餘
const LABEL_MIN_LINE = 8  // compact label(font 10px + pad 1x4 + halo 1px)實測寬 ~14px,8px 線可放下

interface DrawOptions {
  element: Element
  mode: 'live' | 'pin'
  label?: string
  /** Figma-style sibling distance:pin mode hover 到其他元素時畫 edge-to-edge gap */
  sibling?: Element | null
}

// Labels-hidden state — toggled via `H` key(對齊 Chrome `Ctrl+hold` idiom 暫時清空 redline
// 數字看視覺對齊)。Module-level state 跨 element re-pin 持續。
let labelsHidden = false
export function toggleLabels(): boolean {
  labelsHidden = !labelsHidden
  const root = document.getElementById(OVERLAY_ID)
  if (root) root.setAttribute('data-labels-hidden', String(labelsHidden))
  return labelsHidden
}
export function getLabelsHidden(): boolean { return labelsHidden }

const ensureRoot = (): HTMLElement => {
  let root = document.getElementById(OVERLAY_ID) as HTMLElement | null
  if (root) return root
  root = document.createElement('div')
  root.id = OVERLAY_ID
  root.style.cssText = `
    position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
    font: 11px -apple-system, 'SF Pro Text', system-ui, sans-serif;
  `
  if (labelsHidden) root.setAttribute('data-labels-hidden', 'true')
  document.body.appendChild(root)
  // CSS rule:`H` 鍵切到 hidden 時 fade 全 redline 數字 label(class `__ds-label`),保留
  //   line + outline + hatch。inject 一次即可,後續 ensureRoot 不重複插。
  const STYLE_ID = '__ds_devmode_overlay_style__'
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `#${OVERLAY_ID}[data-labels-hidden="true"] .__ds-label { display: none !important; }`
    document.head.appendChild(style)
  }
  return root
}

const makeDiv = (cssText: string, text?: string) => {
  const d = document.createElement('div')
  d.style.cssText = cssText
  if (text != null) d.textContent = text
  return d
}

// Visibility halo — 2px white shadow ring around elements ensures redlines /
// outlines remain readable on any bg(white / dark / busy / colored)。
// World-class 對照:Chrome ruler / Figma annotation / Photoshop guides 3+。
const HALO_LABEL = '0 0 0 1px #fff, 0 1px 3px rgba(0,0,0,0.35)'
const HALO_OUTLINE = '0 0 0 2px rgba(255,255,255,0.85), 0 0 0 4px rgba(0,0,0,0.15)'

const distanceLabel = (value: number, left: string, top: string, transform: string) => {
  // White-bg + red-text(2026-04-25 v4)— 對齊 addon-measure canvas-rendered 派
  //(canvas fillRect 形成 opaque bg 自然遮 line,我們 DOM 同效果)。
  // 為什麼不純文字 Figma 派:純文字無 bg,redline 紅 line 穿過 label 中心,文字看似
  // 被「1-3」切割(line color = text color)。Figma 用獨立 SVG 分層才避免衝突,
  // DOM 場景白 bg + 紅字最省視覺體積又不衝突。
  // 寬度:font 10 + padding 0×3 = ~13-15px(兩位數),比舊 ~14px 微減,字體更醒目。
  const d = makeDiv(
    `position:absolute;left:${left};top:${top};transform:${transform};
     background:#fff;color:#EC4436;padding:0 3px;border-radius:2px;
     font-weight:700;font-size:10px;line-height:1.4;
     box-shadow:0 0 0 1px rgba(236,68,54,0.35);
     white-space:nowrap;z-index:1;`,
    String(Math.round(value)),
  )
  d.className = '__ds-label'
  return d
}

// Distance line — 2px solid + white halo box-shadow(取代 dashed 1px,visibility 強化)
// 1px dashed 在 retina + busy bg 幾乎看不見;2px solid + halo 任何 bg 上都清楚。
const redLine = (cssText: string) =>
  makeDiv(
    `position:absolute;background:#EC4436;
     box-shadow:0 0 0 1px rgba(255,255,255,0.85);
     ${cssText}`,
  )

/**
 * T-cap(短 perpendicular line)在 distance line 兩端,讓起終點 unambiguous。
 * World-class:Figma / Sketch / Zeplin / Adobe XD / CAD 5+ 家共識。
 *
 * Horizontal distance line(width=W,height=2px):兩端各加 vertical 短 stub
 * Vertical distance line(width=2px,height=H):兩端各加 horizontal 短 stub
 *
 * cap-length = 8px(視覺平衡,不擋元素也不太短)
 */
const T_CAP = 8

const tCapVertical = (centerX: number, centerY: number) =>
  makeDiv(
    `position:absolute;left:${centerX - 1}px;top:${centerY - T_CAP / 2}px;
     width:2px;height:${T_CAP}px;background:#EC4436;
     box-shadow:0 0 0 1px rgba(255,255,255,0.85);pointer-events:none;`,
  )

const tCapHorizontal = (centerX: number, centerY: number) =>
  makeDiv(
    `position:absolute;left:${centerX - T_CAP / 2}px;top:${centerY - 1}px;
     width:${T_CAP}px;height:2px;background:#EC4436;
     box-shadow:0 0 0 1px rgba(255,255,255,0.85);pointer-events:none;`,
  )

/**
 * Dimension extension line(從元素邊延伸的短 perpendicular line)。
 * CAD / drafting / Chrome DevTools 慣例,讓「測量從哪元素邊出發」一目了然。
 * 比 distance line 更細(1px,半透明)避免 noise,但仍 visible halo。
 */
const EXTENSION_LEN = 6
const extensionLine = (cssText: string) =>
  makeDiv(
    `position:absolute;background:rgba(236,68,54,0.5);
     box-shadow:0 0 0 1px rgba(255,255,255,0.7);
     ${cssText}`,
  )

const paddingHatch = (left: number, top: number, width: number, height: number) => {
  if (width <= 0 || height <= 0) return null
  return makeDiv(
    `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;
     background:repeating-linear-gradient(-45deg,rgba(147,196,125,0.55) 0 4px,rgba(147,196,125,0.2) 4px 8px);
     pointer-events:none;`,
  )
}

export function clearOverlay() {
  const root = document.getElementById(OVERLAY_ID)
  if (root) root.remove()
}

/**
 * Sibling-to-sibling edge-to-edge 距離計算 + 繪製(Figma-style)。
 *
 * 4 種空間關係:
 * - B 在 A 右邊(B.left ≥ A.right) → horizontal gap = B.left - A.right
 * - B 在 A 左邊(B.right ≤ A.left) → horizontal gap = A.left - B.right
 * - B 在 A 下方(B.top ≥ A.bottom) → vertical gap = B.top - A.bottom
 * - B 在 A 上方(B.bottom ≤ A.top) → vertical gap = A.top - B.bottom
 *
 * 兩軸獨立計算,可能都畫(diagonal)或只一軸(aligned)或都不畫(overlap / contain)。
 */
function drawSiblingDistance(root: HTMLElement, a: DOMRect, b: DOMRect) {
  // sibling outline(青 cyan,跟主元素 purple 對比,Figma 慣例)
  root.appendChild(
    makeDiv(
      `position:absolute;left:${b.left - 1}px;top:${b.top - 1}px;
       width:${b.width}px;height:${b.height}px;
       border:2px solid #00A8B3;box-shadow:0 0 0 2px rgba(255,255,255,0.85), 0 0 0 4px rgba(0,168,179,0.25);
       box-sizing:content-box;pointer-events:none;`,
    ),
  )

  // Horizontal axis(左 / 右)— T-caps + extension lines + main line + label
  if (b.left >= a.right) {
    // B 在 A 右邊
    const gap = b.left - a.right
    if (gap >= 1) {
      const yTop = Math.max(a.top, b.top)
      const yBot = Math.min(a.bottom, b.bottom)
      const y = yTop <= yBot ? (yTop + yBot) / 2 : (a.top + a.bottom + b.top + b.bottom) / 4
      // Main horizontal line
      root.appendChild(redLine(`left:${a.right}px;top:${y}px;width:${gap}px;height:2px;`))
      // T-caps at both endpoints
      root.appendChild(tCapVertical(a.right, y))
      root.appendChild(tCapVertical(b.left, y))
      // Extension lines from element edges(若 measurement y 不在 element vertical 範圍內才畫)
      if (y < a.top || y > a.bottom) {
        const eyTop = Math.min(a.bottom, y)
        const eyBot = Math.max(a.bottom, y)
        root.appendChild(extensionLine(`left:${a.right - 1}px;top:${eyTop}px;width:2px;height:${eyBot - eyTop}px;`))
      }
      if (y < b.top || y > b.bottom) {
        const eyTop = Math.min(b.top, y)
        const eyBot = Math.max(b.top, y)
        root.appendChild(extensionLine(`left:${b.left - 1}px;top:${eyTop}px;width:2px;height:${eyBot - eyTop}px;`))
      }
      if (gap >= LABEL_MIN_LINE) {
        root.appendChild(distanceLabel(gap, `${a.right + gap / 2}px`, `${y}px`, 'translate(-50%,-50%)'))
      }
    }
  } else if (b.right <= a.left) {
    // B 在 A 左邊
    const gap = a.left - b.right
    if (gap >= 1) {
      const yTop = Math.max(a.top, b.top)
      const yBot = Math.min(a.bottom, b.bottom)
      const y = yTop <= yBot ? (yTop + yBot) / 2 : (a.top + a.bottom + b.top + b.bottom) / 4
      root.appendChild(redLine(`left:${b.right}px;top:${y}px;width:${gap}px;height:2px;`))
      root.appendChild(tCapVertical(b.right, y))
      root.appendChild(tCapVertical(a.left, y))
      if (y < a.top || y > a.bottom) {
        const eyTop = Math.min(a.top, y)
        const eyBot = Math.max(a.top, y)
        root.appendChild(extensionLine(`left:${a.left - 1}px;top:${eyTop}px;width:2px;height:${eyBot - eyTop}px;`))
      }
      if (y < b.top || y > b.bottom) {
        const eyTop = Math.min(b.bottom, y)
        const eyBot = Math.max(b.bottom, y)
        root.appendChild(extensionLine(`left:${b.right - 1}px;top:${eyTop}px;width:2px;height:${eyBot - eyTop}px;`))
      }
      if (gap >= LABEL_MIN_LINE) {
        root.appendChild(distanceLabel(gap, `${b.right + gap / 2}px`, `${y}px`, 'translate(-50%,-50%)'))
      }
    }
  }

  // Vertical axis(上 / 下)— T-caps + extension lines + main line + label
  if (b.top >= a.bottom) {
    // B 在 A 下方
    const gap = b.top - a.bottom
    if (gap >= 1) {
      const xLeft = Math.max(a.left, b.left)
      const xRight = Math.min(a.right, b.right)
      const x = xLeft <= xRight ? (xLeft + xRight) / 2 : (a.left + a.right + b.left + b.right) / 4
      root.appendChild(
        makeDiv(
          `position:absolute;left:${x}px;top:${a.bottom}px;width:2px;height:${gap}px;
           background:#EC4436;box-shadow:0 0 0 1px rgba(255,255,255,0.85);pointer-events:none;`,
        ),
      )
      root.appendChild(tCapHorizontal(x, a.bottom))
      root.appendChild(tCapHorizontal(x, b.top))
      if (x < a.left || x > a.right) {
        const exLeft = Math.min(a.right, x)
        const exRight = Math.max(a.right, x)
        root.appendChild(extensionLine(`left:${exLeft}px;top:${a.bottom - 1}px;height:2px;width:${exRight - exLeft}px;`))
      }
      if (x < b.left || x > b.right) {
        const exLeft = Math.min(b.left, x)
        const exRight = Math.max(b.left, x)
        root.appendChild(extensionLine(`left:${exLeft}px;top:${b.top - 1}px;height:2px;width:${exRight - exLeft}px;`))
      }
      if (gap >= LABEL_MIN_LINE) {
        root.appendChild(distanceLabel(gap, `${x}px`, `${a.bottom + gap / 2}px`, 'translate(-50%,-50%)'))
      }
    }
  } else if (b.bottom <= a.top) {
    // B 在 A 上方
    const gap = a.top - b.bottom
    if (gap >= 1) {
      const xLeft = Math.max(a.left, b.left)
      const xRight = Math.min(a.right, b.right)
      const x = xLeft <= xRight ? (xLeft + xRight) / 2 : (a.left + a.right + b.left + b.right) / 4
      root.appendChild(
        makeDiv(
          `position:absolute;left:${x}px;top:${b.bottom}px;width:2px;height:${gap}px;
           background:#EC4436;box-shadow:0 0 0 1px rgba(255,255,255,0.85);pointer-events:none;`,
        ),
      )
      root.appendChild(tCapHorizontal(x, b.bottom))
      root.appendChild(tCapHorizontal(x, a.top))
      if (x < a.left || x > a.right) {
        const exLeft = Math.min(a.left, x)
        const exRight = Math.max(a.left, x)
        root.appendChild(extensionLine(`left:${exLeft}px;top:${a.top - 1}px;height:2px;width:${exRight - exLeft}px;`))
      }
      if (x < b.left || x > b.right) {
        const exLeft = Math.min(b.right, x)
        const exRight = Math.max(b.right, x)
        root.appendChild(extensionLine(`left:${exLeft}px;top:${b.bottom - 1}px;height:2px;width:${exRight - exLeft}px;`))
      }
      if (gap >= LABEL_MIN_LINE) {
        root.appendChild(distanceLabel(gap, `${x}px`, `${b.bottom + gap / 2}px`, 'translate(-50%,-50%)'))
      }
    }
  }
}

export function drawOverlay({ element, mode, label, sibling }: DrawOptions) {
  clearOverlay()
  const root = ensureRoot()
  root.dataset.mode = mode

  const rect = element.getBoundingClientRect()
  const siblingRect = sibling && sibling !== element ? sibling.getBoundingClientRect() : null
  // 當 sibling 存在時,不畫 parent distance(避免視覺混亂),專注 A↔B 測量
  const parentEl = siblingRect ? null : element.parentElement
  const parentRaw = parentEl?.getBoundingClientRect() ?? null
  const parentCs = parentEl ? getComputedStyle(parentEl) : null
  // Parent's CONTENT AREA edges(2026-04-25 v2):redline 終點到 parent's 內側,
  // 距離 = 元件 CSS margin / position offset(對齊 Figma idiom + 產品定位「看見 CSS」)。
  const parent = parentRaw && parentCs ? {
    left: parentRaw.left + (parseFloat(parentCs.borderLeftWidth) || 0) + (parseFloat(parentCs.paddingLeft) || 0),
    top: parentRaw.top + (parseFloat(parentCs.borderTopWidth) || 0) + (parseFloat(parentCs.paddingTop) || 0),
    right: parentRaw.right - (parseFloat(parentCs.borderRightWidth) || 0) - (parseFloat(parentCs.paddingRight) || 0),
    bottom: parentRaw.bottom - (parseFloat(parentCs.borderBottomWidth) || 0) - (parseFloat(parentCs.paddingBottom) || 0),
  } : null
  const cs = getComputedStyle(element)
  const pad = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  }

  // 1. Purple outline around element
  const outline = makeDiv(
    `position:absolute;left:${rect.left - 1}px;top:${rect.top - 1}px;
     width:${rect.width}px;height:${rect.height}px;
     border:2px solid #B668FF;box-shadow:0 0 0 2px rgba(255,255,255,0.85), 0 0 0 4px rgba(182,104,255,0.25);
     box-sizing:content-box;`,
  )
  root.appendChild(outline)

  // 2. Padding hatching (4 sides, non-overlapping)
  if (pad.top > 0) {
    const n = paddingHatch(rect.left, rect.top, rect.width, pad.top)
    if (n) root.appendChild(n)
  }
  if (pad.bottom > 0) {
    const n = paddingHatch(rect.left, rect.bottom - pad.bottom, rect.width, pad.bottom)
    if (n) root.appendChild(n)
  }
  if (pad.left > 0) {
    const n = paddingHatch(rect.left, rect.top + pad.top, pad.left, rect.height - pad.top - pad.bottom)
    if (n) root.appendChild(n)
  }
  if (pad.right > 0) {
    const n = paddingHatch(
      rect.right - pad.right,
      rect.top + pad.top,
      pad.right,
      rect.height - pad.top - pad.bottom,
    )
    if (n) root.appendChild(n)
  }

  // (Padding 數字 label 不畫 — Chrome idiom:per-side padding 只在 panel anatomy box 顯示,
  //  canvas 留 hatch 色塊作 visual hint。Panel.tsx AnatomyBox 已含 4 邊 padding 數值。)

  // 3. Distance to parent (red lines + T-caps + labels)
  if (parent) {
    // vertical line through element center to top/bottom
    const cx = rect.left + rect.width / 2
    // top
    if (rect.top > parent.top) {
      const dist = rect.top - parent.top
      root.appendChild(redLine(`left:${cx}px;top:${parent.top}px;width:2px;height:${dist}px;`))
      root.appendChild(tCapHorizontal(cx, parent.top))
      root.appendChild(tCapHorizontal(cx, rect.top))
      if (dist >= LABEL_MIN_LINE) {
        root.appendChild(
          distanceLabel(dist, `${cx}px`, `${parent.top + dist / 2}px`, 'translate(-50%,-50%)'),
        )
      }
    }
    // bottom
    if (rect.bottom < parent.bottom) {
      const dist = parent.bottom - rect.bottom
      root.appendChild(redLine(`left:${cx}px;top:${rect.bottom}px;width:2px;height:${dist}px;`))
      root.appendChild(tCapHorizontal(cx, rect.bottom))
      root.appendChild(tCapHorizontal(cx, parent.bottom))
      if (dist >= LABEL_MIN_LINE) {
        root.appendChild(
          distanceLabel(dist, `${cx}px`, `${rect.bottom + dist / 2}px`, 'translate(-50%,-50%)'),
        )
      }
    }
    const cy = rect.top + rect.height / 2
    // left
    if (rect.left > parent.left) {
      const dist = rect.left - parent.left
      root.appendChild(redLine(`left:${parent.left}px;top:${cy}px;width:${dist}px;height:2px;`))
      root.appendChild(tCapVertical(parent.left, cy))
      root.appendChild(tCapVertical(rect.left, cy))
      if (dist >= LABEL_MIN_LINE) {
        root.appendChild(
          distanceLabel(dist, `${parent.left + dist / 2}px`, `${cy}px`, 'translate(-50%,-50%)'),
        )
      }
    }
    // right
    if (rect.right < parent.right) {
      const dist = parent.right - rect.right
      root.appendChild(redLine(`left:${rect.right}px;top:${cy}px;width:${dist}px;height:2px;`))
      root.appendChild(tCapVertical(rect.right, cy))
      root.appendChild(tCapVertical(parent.right, cy))
      if (dist >= LABEL_MIN_LINE) {
        root.appendChild(
          distanceLabel(dist, `${rect.right + dist / 2}px`, `${cy}px`, 'translate(-50%,-50%)'),
        )
      }
    }
    // Parent content area outline(2026-04-25 v2)— 對齊 Figma idiom:redline 終點 = 此邊界。
    // 不畫 parent outer border + padding(避免 user 誤以為 distance 算到 outer);只畫 content
    // edge dashed line 標記「distance 量到這條線」。
    root.appendChild(
      makeDiv(
        `position:absolute;left:${parent.left}px;top:${parent.top}px;
         width:${parent.right - parent.left}px;height:${parent.bottom - parent.top}px;
         border:1px dashed rgba(182,104,255,0.4);pointer-events:none;box-sizing:border-box;`,
      ),
    )
  }

  // 3b. Sibling distance(Figma-style,只在 sibling 存在時畫)
  if (siblingRect) {
    drawSiblingDistance(root, rect, siblingRect)
  }

  // 4. Property badge(默認 top,若太靠頂邊切換到 bottom 防 clip)
  // 對齊 Chrome inspector_overlay/tool_highlight.ts:元件過小(< BADGE_MIN_W × BADGE_MIN_H)
  // → 整個 badge suppress(避免 badge 比 element 還大造成「badge 吃掉 element」)。
  // 此情況 user 可看 panel 的 Element 段落讀 selector / 尺寸。
  if (label && rect.width >= BADGE_MIN_W && rect.height >= BADGE_MIN_H) {
    const badgeAbove = rect.top - 24 >= 4
    const badgeTop = badgeAbove ? rect.top - 24 : rect.bottom + 4
    const badge = makeDiv(
      // 對齊 Chrome `tool_highlight.css` `.section-name` font 10 + `.tooltip-content`
      // radius 3 + 整體 compact 風;color 紫 #B668FF 是 redline 派 pinned-element identity。
      `position:absolute;left:${rect.left}px;top:${badgeTop}px;
       background:#B668FF;color:#fff;padding:2px 7px;border-radius:3px;
       font-size:10px;font-weight:500;display:inline-flex;align-items:center;gap:3px;
       box-shadow:0 2px 6px rgba(0,0,0,0.2);pointer-events:none;white-space:nowrap;`,
      label,
    )
    badge.className = '__ds-label'
    // diamond icon — 7×7 對齊 badge 10px font scale(原 8×8 比 font 大 1px,輕微比例違和)
    const icon = makeDiv(
      `width:7px;height:7px;background:#fff;transform:rotate(45deg);display:inline-block;margin-right:2px;`,
    )
    badge.prepend(icon)
    root.appendChild(badge)
  }
}

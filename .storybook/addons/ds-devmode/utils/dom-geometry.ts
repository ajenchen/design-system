import type { InspectPayload } from '../constants'

const pxFromStyle = (s: string) => {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

export function measureElement(el: Element): InspectPayload {
  const cs = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  const parent = el.parentElement
  const pr = parent ? parent.getBoundingClientRect() : null
  const parentCs = parent ? getComputedStyle(parent) : null

  const padding = {
    top: pxFromStyle(cs.paddingTop),
    right: pxFromStyle(cs.paddingRight),
    bottom: pxFromStyle(cs.paddingBottom),
    left: pxFromStyle(cs.paddingLeft),
  }
  const margin = {
    top: pxFromStyle(cs.marginTop),
    right: pxFromStyle(cs.marginRight),
    bottom: pxFromStyle(cs.marginBottom),
    left: pxFromStyle(cs.marginLeft),
  }
  const border = {
    top: pxFromStyle(cs.borderTopWidth),
    right: pxFromStyle(cs.borderRightWidth),
    bottom: pxFromStyle(cs.borderBottomWidth),
    left: pxFromStyle(cs.borderLeftWidth),
  }
  const position = {
    type: cs.position,
    top: cs.top,
    right: cs.right,
    bottom: cs.bottom,
    left: cs.left,
  }

  // Distance to parent's CONTENT area(2026-04-25 v2 — Figma / Sketch / Zeplin idiom):
  //   element.boundingRect.left - (parent.boundingRect.left + parent.border-left + parent.padding-left)
  // 等同元件 CSS 的 margin-left / position-offset-left,redline tool 直接顯 CSS 實際值,
  // 對齊產品定位「看見 CSS」。原 raw boundingRect(outer-to-outer)是視覺 gap,跟 CSS
  // 屬性不直接對應,user 看了不知道怎麼複製。
  const distancesToParent = pr && parentCs
    ? {
        top: Math.round(r.top - pr.top - pxFromStyle(parentCs.borderTopWidth) - pxFromStyle(parentCs.paddingTop)),
        right: Math.round(pr.right - r.right - pxFromStyle(parentCs.borderRightWidth) - pxFromStyle(parentCs.paddingRight)),
        bottom: Math.round(pr.bottom - r.bottom - pxFromStyle(parentCs.borderBottomWidth) - pxFromStyle(parentCs.paddingBottom)),
        left: Math.round(r.left - pr.left - pxFromStyle(parentCs.borderLeftWidth) - pxFromStyle(parentCs.paddingLeft)),
      }
    : null

  return {
    tag: el.tagName.toLowerCase(),
    className: typeof el.className === 'string' ? el.className : (el as HTMLElement).getAttribute?.('class') ?? '',
    id: el.id || '',
    rect: { x: r.left, y: r.top, width: r.width, height: r.height },
    parentRect: pr ? { x: pr.left, y: pr.top, width: pr.width, height: pr.height } : null,
    distancesToParent,
    padding,
    margin,
    border,
    position,
    computed: {}, // filled in Stage 2
    tokenUsage: [], // filled in Stage 2
  }
}

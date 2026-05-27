/**
 * Canvas-side entry. Runs inside the Storybook iframe.
 * Listens for mode changes, binds DOM listeners, emits inspect payload,
 * renders redline overlay.
 */
import { addons } from '@storybook/preview-api'
import { measureElement } from './utils/dom-geometry'
import { extractComputed } from './utils/computed-style'
import { annotateWithTokens, extractSourceVars, extractAllAuthorDecls } from './utils/token-reverse-lookup'
import { drawOverlay, clearOverlay, toggleLabels } from './utils/overlay'
import { EVENTS, type DevmodeMode, type ForceState, type InspectPayload } from './constants'

let mode: DevmodeMode = 'off'
let pinnedEl: Element | null = null
let hoverEl: Element | null = null
/** pin 模式下的 sibling hover target(Figma-style distance measurement) */
let siblingHoverEl: Element | null = null

/**
 * Pseudo-class force-state(2026-04-25):**Inspired by** Chrome DevTools「Toggle Element State」UX。
 *
 * **真實機制 vs 本 addon 實作**(2026-05-13 codex R6 V2 verify):
 * - Chrome DevTools 用 CDP `CSS.forcePseudoState`(Chromium source `CSSModel.ts forcePseudoState`)
 *   經 backend `invoke_forcePseudoState` 真 force browser pseudo-class,所有 selector(`:has()` /
 *   `:is()` / descendant)都精準 trigger
 * - 本 addon 因 storybook iframe 無 CDP 訪問權,改用 fallback:walk `document.styleSheets`,
 *   找 selector 含 `:hover/:focus/:active` 的 rules,把 declarations inline-apply 到 pinned element
 *
 * **Known limitations**(consumer 看 Panel warning badge):
 * 1. **`:has()`/`:is()`/`:not()` descendant chain 不準** — 例如 `.card:has(:hover)` 語意是「descendant
 *    hovered」,inline-apply 不能 trigger ancestor effect
 * 2. **Descendant selector child rules 不會傳遞** — 例如 `.btn:hover .icon` 的 `.icon` declarations
 *    無法被 child 收到(本 fallback 只 apply 到 pinned el 自己)
 * 3. **Specificity 不等於真實 cascade** — inline style 永遠 win 過 stylesheet rules,可能蓋掉本不該蓋的
 *
 * **真機制 R6 future work(2026-05-13 codex propose)**:parser-aware selector rewrite —
 * inject `<style>` 把 `.btn:hover` → `.btn[data-ds-devmode-force~="hover"]` preserve full structure,
 * 配合 `data-ds-devmode-force` attribute 模擬。但這需 CSS selector parser(`postcss-selector-parser`
 * or 手刻 FSM),且仍不能 handle `:has()` 真語意。**目前接受 inline fallback + Panel warning badge**。
 */
let forceState: ForceState = 'none'

// 2026-05-13 R6 v1 actual mechanism(per codex V2 verdict + user「省工不是理由」拍板):
// 改用 stylesheet selector rewriter,**preserve full selector structure**(per codex「正確 rewrite 是
// 保留原 selector 結構,把 pseudo-class token 替換成 attribute」):
//   `.btn:hover` → `.btn[data-ds-devmode-force~="hover"]`
//   `.btn:hover .icon` → `.btn[data-ds-devmode-force~="hover"] .icon`(descendant 保留)
// 配合 pinned element `setAttribute('data-ds-devmode-force', 'hover')` activate。
// 取代前 inline-style mutate(只 apply pinned el 自己,descendant 不會收;且 specificity inline always win)。
//
// **Unsupported**(per codex limitation):`:has()` / `:is(:hover)` / `:not(:hover)` — semantic 不能簡單 token replace。
// Skip 含此 patterns 的 rule + console.warn。

const PSEUDO_STATE_STYLESHEET_ID = '__ds_devmode_pseudo_stylesheet__'
const PSEUDO_STATE_ATTR = 'data-ds-devmode-force'

const ensurePseudoStylesheet = (): HTMLStyleElement => {
  let style = document.getElementById(PSEUDO_STATE_STYLESHEET_ID) as HTMLStyleElement | null
  if (style) return style
  style = document.createElement('style')
  style.id = PSEUDO_STATE_STYLESHEET_ID
  document.head.appendChild(style)
  return style
}

let pseudoStylesheetBuilt = false

const rewriteSelectorForState = (sel: string, state: 'hover' | 'focus' | 'active'): string | null => {
  const pseudo = `:${state}`
  // Skip unsupported logical selectors(per codex V2 verdict)
  if (sel.includes(`:has(`) || sel.includes(`:is(`)) return null
  if (sel.includes(`:not(`) && sel.includes(pseudo)) {
    // 簡化:若 :not() 含 pseudo,skip(語意是 NOT hovered,rewrite 會反語意)
    if (new RegExp(`:not\\([^)]*${pseudo}`).test(sel)) return null
  }
  if (!sel.includes(pseudo)) return null
  // Word boundary 避免誤 match(CSS pseudo 後接 ` `, `.`, `>`, `:`, `,`, `[`, end)。
  // 2026-05-13 codex Q4 round 2 fix:擴 ident-continuation guard 含 non-ASCII(U+00A0-U+FFFF)。
  // CSS Selectors L4 grammar 允許 identifiers 含 non-ASCII + escaped characters。
  // 原 `(?![\\-a-zA-Z0-9_])` 漏 non-ASCII;`(?![-_a-zA-Z0-9\\u00A0-\\uFFFF])` 涵蓋大部分 ident-continuation。
  // Note:仍非 perfect parser(漏 CSS-escape sequences `\\xx`),production-grade rewrite 需 postcss-selector-parser。
  const regex = new RegExp(`${pseudo}(?![-_a-zA-Z0-9\\u00A0-\\uFFFF])`, 'g')
  return sel.replace(regex, `[${PSEUDO_STATE_ATTR}~="${state}"]`)
}

const buildPseudoStylesheet = (): void => {
  const style = ensurePseudoStylesheet()
  const out: string[] = []
  const states: Array<'hover' | 'focus' | 'active'> = ['hover', 'focus', 'active']
  let skippedUnsupported = 0
  const walk = (rules: CSSRuleList | undefined, mediaWrap: string | null) => {
    if (!rules) return
    for (const rule of Array.from(rules)) {
      // @media / @supports / @container — preserve grouping wrapper(per codex V2 verdict)
      if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule || (typeof CSSContainerRule !== 'undefined' && rule instanceof CSSContainerRule)) {
        const wrap = `@${rule.constructor.name.replace('CSS', '').replace('Rule', '').toLowerCase()} ${('conditionText' in rule ? rule.conditionText : '')}`
        walk(rule.cssRules, wrap)
        continue
      }
      if (!(rule instanceof CSSStyleRule)) continue
      const sel = rule.selectorText
      if (!sel) continue
      for (const state of states) {
        const rewritten = rewriteSelectorForState(sel, state)
        if (rewritten == null) {
          if (sel.includes(`:${state}`)) skippedUnsupported++
          continue
        }
        const body = rule.style.cssText
        if (!body) continue
        const ruleText = `${rewritten} { ${body} }`
        out.push(mediaWrap ? `${mediaWrap} { ${ruleText} }` : ruleText)
      }
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    try { walk(sheet.cssRules, null) } catch { /* CORS-blocked stylesheet */ }
  }
  style.textContent = out.join('\n')
  pseudoStylesheetBuilt = true
  if (skippedUnsupported > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[ds-devmode] R6 v1 pseudo-state stylesheet:跳過 ${skippedUnsupported} 個含 :has()/:is()/:not() 的不支援 rule。Chrome DevTools 用 CDP forcePseudoState 才能精準 — 本 addon 為 inspired fallback。`)
  }
}

const applyForceState = (state: ForceState) => {
  if (!pinnedEl || !(pinnedEl instanceof HTMLElement)) return
  // Cleanup legacy inline-style approach(backward compat)
  if (pinnedEl.dataset.dsDevmodePrevStyle !== undefined) {
    pinnedEl.style.cssText = pinnedEl.dataset.dsDevmodePrevStyle
    delete pinnedEl.dataset.dsDevmodePrevStyle
  }
  pinnedEl.removeAttribute('data-ds-devmode-forced')
  if (state === 'none') {
    pinnedEl.removeAttribute(PSEUDO_STATE_ATTR)
    return
  }
  if (!pseudoStylesheetBuilt) buildPseudoStylesheet()
  pinnedEl.setAttribute(PSEUDO_STATE_ATTR, state)
}

/**
 * Touch device detection(2026-04-25 mobile 支援):
 * - 觸控裝置上 hover 不 fire,Live 模式無效;改 default tap-to-pin UX
 * - 從 hover events 第一次觸發起計次,搭配 navigator 偵測
 */
const isTouchDevice = (): boolean => {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(hover: none)').matches
  )
}

const channel = addons.getChannel()

const isInspectableTarget = (t: EventTarget | null): t is Element => {
  if (!(t instanceof Element)) return false
  if (t.closest('#__ds_devmode_overlay__')) return false
  // skip storybook root wrappers
  if (t.id === 'storybook-root') return false
  return true
}

const build = (el: Element): InspectPayload => {
  const geom = measureElement(el)
  const computed = extractComputed(el)
  const merged: Record<string, string> = { ...computed.layout, ...computed.style }
  // Source-first(2026-04-25):author 在 stylesheet / inline style 寫的 var() 直接抓
  const sourceVars = extractSourceVars(el)
  // Reverse-lookup 降為 fallback hint(只在無 source var 時 candidates 用)
  const candidates = annotateWithTokens(merged)
  // Merge:source(authoritative)優先,reverse-lookup 補無 source 的 property
  const tokenUsage = Object.keys(merged).map(prop => {
    const src = sourceVars.get(prop)
    if (src) {
      // Author 寫了 token(可信)
      return {
        property: prop,
        raw: src.rawValue,
        tokens: src.tokens,
        resolved: src.resolved,
        source: 'author' as const,
      }
    }
    const cand = candidates.find(c => c.property === prop)
    if (cand) {
      // Reverse-lookup candidates(speculative,標明)
      return {
        property: prop,
        raw: cand.raw,
        tokens: cand.tokens,
        resolved: cand.resolved,
        source: 'speculative' as const,
      }
    }
    return null
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  // 完整 author CSS(2026-04-25):每個 author-written declaration 配 resolved 值
  const allAuthorDecls = extractAllAuthorDecls(el)
  const fullCs = getComputedStyle(el)
  const authorCss: InspectPayload['authorCss'] = []
  for (const [prop, decl] of allAuthorDecls) {
    authorCss.push({
      property: prop,
      rawValue: decl.rawValue,
      resolved: fullCs.getPropertyValue(prop).trim() || decl.rawValue,
      tokens: decl.tokens,
      fromSelector: decl.fromSelector,
    })
  }
  // Sort:含 token 的 author tokens 先,其餘 plain value 後;property name alphabetical 內排
  authorCss.sort((a, b) => {
    if (a.tokens.length && !b.tokens.length) return -1
    if (!a.tokens.length && b.tokens.length) return 1
    return a.property.localeCompare(b.property)
  })

  // Auto-layout context(2026-04-25):flex / grid container 才填
  const csForLayout = getComputedStyle(el)
  const display = csForLayout.display
  let autoLayout: InspectPayload['autoLayout'] = null
  if (display === 'flex' || display === 'inline-flex') {
    autoLayout = {
      display: 'flex',
      flexDirection: csForLayout.flexDirection,
      gap: csForLayout.gap,
      rowGap: csForLayout.rowGap,
      columnGap: csForLayout.columnGap,
      justifyContent: csForLayout.justifyContent,
      alignItems: csForLayout.alignItems,
      flexWrap: csForLayout.flexWrap,
    }
  } else if (display === 'grid' || display === 'inline-grid') {
    autoLayout = {
      display: 'grid',
      gap: csForLayout.gap,
      rowGap: csForLayout.rowGap,
      columnGap: csForLayout.columnGap,
      justifyContent: csForLayout.justifyContent,
      alignItems: csForLayout.alignItems,
      gridTemplateColumns: csForLayout.gridTemplateColumns,
      gridTemplateRows: csForLayout.gridTemplateRows,
    }
  }

  // Element breadcrumb chain(2026-04-25):從 storybook-root 父鏈到 element
  const breadcrumb: InspectPayload['breadcrumb'] = []
  let cur: Element | null = el
  while (cur && cur.id !== 'storybook-root' && cur !== document.body) {
    breadcrumb.unshift({
      tag: cur.tagName.toLowerCase(),
      id: cur.id || '',
      className: typeof cur.className === 'string' ? cur.className : (cur.className as SVGAnimatedString | undefined)?.baseVal ?? '',
    })
    cur = cur.parentElement
  }

  return {
    ...geom,
    computed: merged,
    tokenUsage,
    breadcrumb,
    autoLayout,
    authorCss,
    siblingDistance: null,
  }
}

/** Sibling distance helper(對齊 overlay.ts drawSiblingDistance 兩軸獨立邏輯) */
const computeSiblingDistance = (
  a: DOMRect,
  b: DOMRect,
): { horizontal: number | null; vertical: number | null } | null => {
  if (a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom) return null  // overlap
  let h: number | null = null
  let v: number | null = null
  if (b.left >= a.right) h = b.left - a.right
  else if (b.right <= a.left) h = a.left - b.right
  if (b.top >= a.bottom) v = b.top - a.bottom
  else if (b.bottom <= a.top) v = a.top - b.bottom
  if (h === null && v === null) return null
  return { horizontal: h, vertical: v }
}

const emit = (el: Element, sibling: Element | null = null) => {
  // Defensive:storybook 切 story 會 unmount 舊 subtree → pinnedEl detached。
  // detached element 的 getBoundingClientRect 全 0 + matches() 拋錯,直接清空 overlay 並
  // 重置 pin state(否則 panel 顯 0 × 0 的 ghost,user 困惑)。
  if (!el.isConnected) {
    if (pinnedEl === el) pinnedEl = null
    if (siblingHoverEl === el) siblingHoverEl = null
    if (hoverEl === el) hoverEl = null
    clearOverlay()
    return
  }
  const payload = build(el)
  if (sibling && sibling.isConnected && sibling !== el) {
    payload.siblingDistance = computeSiblingDistance(el.getBoundingClientRect(), sibling.getBoundingClientRect())
  }
  channel.emit(EVENTS.INSPECT, payload)
  drawOverlay({
    element: el,
    mode: mode === 'pin' ? 'pin' : 'live',
    label: payload.id ? `#${payload.id}` : payload.className ? `.${String(payload.className).split(/\s+/)[0]}` : payload.tag,
    sibling: sibling && sibling.isConnected ? sibling : null,
  })
}

const onMouseOver = (e: MouseEvent) => {
  if (!isInspectableTarget(e.target)) return
  const target = e.target as Element

  if (mode === 'live') {
    if (hoverEl === target) return
    hoverEl = target
    emit(hoverEl)
    return
  }

  // Pin mode:hover 其他元素時畫 sibling distance(Figma-style)
  if (mode === 'pin' && pinnedEl) {
    // Skip self / 不是 document body 層的 target 才畫
    if (target === pinnedEl) return
    // 避免 sibling 是 pinned 的祖先 / 後代(overlap 情況 Figma 也不畫 distance)
    if (pinnedEl.contains(target) || target.contains(pinnedEl)) {
      if (siblingHoverEl) {
        siblingHoverEl = null
        emit(pinnedEl)
      }
      return
    }
    if (siblingHoverEl === target) return
    siblingHoverEl = target
    emit(pinnedEl, siblingHoverEl)
  }
}

const onClick = (e: MouseEvent) => {
  if (mode === 'off') return
  if (!isInspectableTarget(e.target)) return
  e.preventDefault()
  e.stopPropagation()
  pinnedEl = e.target as Element
  mode = 'pin'
  channel.emit(EVENTS.TOGGLE, mode)
  emit(pinnedEl)
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!target) return false
  const el = target as HTMLElement
  if (!el.tagName) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (el.isContentEditable) return true
  return false
}

const onKey = (e: KeyboardEvent) => {
  // Alt+I toggles inspect
  if (e.altKey && (e.key === 'i' || e.key === 'I')) {
    e.preventDefault()
    const next: DevmodeMode = mode === 'off' ? (isTouchDevice() ? 'pin' : 'live') : 'off'
    setMode(next)
  }
  // Esc clears pin
  if (e.key === 'Escape' && mode === 'pin') {
    pinnedEl = null
    setMode(isTouchDevice() ? 'off' : 'live')
  }
  // `H` toggles redline labels(對齊 Chrome `Ctrl+hold` idiom — 暫清 label 看視覺對齊)。
  // 只在 inspect mode active 且 user 不在 input field 才響應(避免打字撞鍵)。
  if ((e.key === 'h' || e.key === 'H') && mode !== 'off' && !e.altKey && !e.metaKey && !e.ctrlKey
      && !isTypingTarget(e.target)) {
    e.preventDefault()
    toggleLabels()
  }
  // Arrow keys walk DOM tree(when pinned;Chrome DevTools idiom)
  if (mode === 'pin' && pinnedEl) {
    let next: Element | null = null
    if (e.key === 'ArrowUp') {
      // Parent
      next = pinnedEl.parentElement
      if (next?.id === 'storybook-root') next = null  // 不超過 storybook root
    } else if (e.key === 'ArrowDown') {
      // First child
      next = pinnedEl.firstElementChild
    } else if (e.key === 'ArrowLeft') {
      // Previous sibling
      next = pinnedEl.previousElementSibling
    } else if (e.key === 'ArrowRight') {
      // Next sibling
      next = pinnedEl.nextElementSibling
    }
    if (next) {
      e.preventDefault()
      pinnedEl = next
      siblingHoverEl = null
      emit(pinnedEl)
    }
  }
}

const bind = () => {
  // Touch device: skip mouseover binding(hover doesn't fire on touch),
  // 仍綁 click 為 tap-to-pin。Click event 在 touch 上會自動 synthesize 從 tap 來。
  if (!isTouchDevice()) {
    document.addEventListener('mouseover', onMouseOver, true)
  }
  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', onKey, true)
}

const unbind = () => {
  document.removeEventListener('mouseover', onMouseOver, true)
  document.removeEventListener('click', onClick, true)
  document.removeEventListener('keydown', onKey, true)
}

const setMode = (next: DevmodeMode) => {
  mode = next
  channel.emit(EVENTS.TOGGLE, next)
  if (next === 'off') {
    clearOverlay()
    pinnedEl = null
    hoverEl = null
    siblingHoverEl = null
    channel.emit(EVENTS.CLEAR)
    unbind()
  } else {
    bind()
    siblingHoverEl = null
    if (next === 'live' && hoverEl) emit(hoverEl)
    if (next === 'pin' && pinnedEl) emit(pinnedEl)
  }
}

// Listen to manager → preview mode changes
channel.on(EVENTS.TOGGLE, (next: DevmodeMode) => {
  if (next !== mode) setMode(next)
})

channel.on(EVENTS.CLEAR, () => {
  if (pinnedEl) applyForceState('none')  // restore inline style before unpin
  pinnedEl = null
  hoverEl = null
  siblingHoverEl = null
  forceState = 'none'
  clearOverlay()
})

channel.on(EVENTS.FORCE_STATE, (state: ForceState) => {
  forceState = state
  applyForceState(state)
  if (pinnedEl) emit(pinnedEl, siblingHoverEl)  // re-emit to reflect new computed
})

// R6 v3 hot map(2026-05-13,user「沒理由不做」+「人話真原因 = 我 conservative defer」拍板做完):
// Panel emit `HOTMAP_HIGHLIGHT` token name → preview 用 `findElementsUsingToken` 找 + paint outline。
// 共用 overlay root pattern(fixed inset:0 viewport overlay)。`HOTMAP_CLEAR` 清掉。
const HOTMAP_OUTLINE_CLASS = '__ds_devmode_hotmap_outline'
const clearHotmap = () => {
  document.querySelectorAll(`.${HOTMAP_OUTLINE_CLASS}`).forEach(el => el.remove())
}
channel.on(EVENTS.HOTMAP_HIGHLIGHT, (tokenName: string) => {
  clearHotmap()
  if (typeof window.__ds_devmode_hotmap !== 'function') return
  const elements = window.__ds_devmode_hotmap(tokenName)
  if (elements.length === 0) return
  let overlayRoot = document.getElementById('__ds_devmode_overlay__')
  if (!overlayRoot) {
    overlayRoot = document.createElement('div')
    overlayRoot.id = '__ds_devmode_overlay__'
    overlayRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
    document.body.appendChild(overlayRoot)
  }
  for (const el of elements) {
    const rect = el.getBoundingClientRect()
    const outline = document.createElement('div')
    outline.className = HOTMAP_OUTLINE_CLASS
    outline.style.cssText = `position:absolute;left:${rect.left - 1}px;top:${rect.top - 1}px;width:${rect.width}px;height:${rect.height}px;border:2px solid #00A8B3;background:rgba(0,168,179,0.08);pointer-events:none;box-sizing:content-box`
    overlayRoot.appendChild(outline)
  }
})
channel.on(EVENTS.HOTMAP_CLEAR, () => { clearHotmap() })

// Storybook addon Top 3 #1(2026-05-12 codex Q1 verdict):暴露 geometry diagnostic 全域
// 給 Playwright DPR matrix test 抓 — `window.__ds_devmode_diagnostic(selector?)`。
import { installGeometryDiagnosticGlobal } from './utils/geometry-diagnostic'
import { installDriftGlobal } from './utils/token-drift-detector'
installGeometryDiagnosticGlobal()
// R6 v3(2026-05-13):token drift detector + hot map global helpers,給 Panel UI + Playwright runtime test 抓。
installDriftGlobal()

// R6 v1 test helper(2026-05-13,per user (b) 拍板「繼續 debug 1-2 hr」):
// Expose internal `applyForceState` + `pinnedEl` setter for Playwright runtime verify
// (cross-frame addon channel + onClick capture-phase listener 在 headless / synthetic mouse 下
// 不穩定觸發,直接 setter 跳過 onClick + test mechanism core flow:stylesheet build + attr apply)。
declare global {
  interface Window {
    __ds_devmode_test_apply_force_state?: (selector: string, state: 'none' | 'hover' | 'focus' | 'active') => boolean
  }
}
// 2026-05-13 codex Q6 fix:gate test helper behind localStorage flag 避免 production preview unconditional expose
// Playwright test 跑前 set `localStorage.__ds_devmode_test_mode = 'on'`;production user 不 set → helper noop。
if (typeof window !== 'undefined') {
  window.__ds_devmode_test_apply_force_state = (selector: string, state) => {
    try {
      if (window.localStorage.getItem('__ds_devmode_test_mode') !== 'on') {
        // eslint-disable-next-line no-console
        console.warn('[ds-devmode] test helper requires localStorage.__ds_devmode_test_mode = "on"')
        return false
      }
    } catch { return false }
    const el = document.querySelector(selector)
    if (!(el instanceof HTMLElement)) return false
    pinnedEl = el  // module-scope variable直接 set
    applyForceState(state)
    return true
  }
}

// Keep overlay accurate on scroll / resize(含 sibling distance 同步)
window.addEventListener('scroll', () => {
  if (mode === 'pin' && pinnedEl) emit(pinnedEl, siblingHoverEl)
  else if (mode === 'live' && hoverEl) emit(hoverEl)
}, true)
window.addEventListener('resize', () => {
  if (mode === 'pin' && pinnedEl) emit(pinnedEl, siblingHoverEl)
  else if (mode === 'live' && hoverEl) emit(hoverEl)
})

const LAYOUT_PROPS = [
  'display',
  'position',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  // Physical longhand padding
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  // Logical padding(2026-05-21 加 per codex M31 Layer C — Tailwind v4 預設輸出 logical
  // shorthand,未含這些 whitelist 會讓 tokenUsage 漏掉以 CSS variable 驅動的 px / py utilities)
  'padding-inline',
  'padding-inline-start',
  'padding-inline-end',
  'padding-block',
  'padding-block-start',
  'padding-block-end',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  // Logical margin
  'margin-inline',
  'margin-inline-start',
  'margin-inline-end',
  'margin-block',
  'margin-block-start',
  'margin-block-end',
  // Logical inset(位置)
  'inset',
  'inset-inline',
  'inset-block',
  'inset-inline-start',
  'inset-inline-end',
  'inset-block-start',
  'inset-block-end',
  'flex',
  'flex-direction',
  'flex-wrap',
  'gap',
  'row-gap',
  'column-gap',
  'justify-content',
  'align-items',
  'align-self',
  'grid-template-columns',
  'grid-template-rows',
  'grid-column',
  'grid-row',
] as const

const STYLE_PROPS = [
  'color',
  'background',
  'background-color',
  'background-image',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-width',
  'border-style',
  'border-color',
  'border-radius',
  'box-shadow',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
] as const

const DEFAULTS: Record<string, string | RegExp> = {
  margin: '0px',
  'margin-top': '0px',
  'margin-right': '0px',
  'margin-bottom': '0px',
  'margin-left': '0px',
  padding: '0px',
  'padding-top': '0px',
  'padding-right': '0px',
  'padding-bottom': '0px',
  'padding-left': '0px',
  gap: /^(normal|0px)$/,
  'row-gap': /^(normal|0px)$/,
  'column-gap': /^(normal|0px)$/,
  'border-radius': '0px',
  'border-width': '0px',
  'box-shadow': 'none',
  opacity: '1',
  'background-color': 'rgba(0, 0, 0, 0)',
  'background-image': 'none',
  'text-align': 'start',
  'text-transform': 'none',
  'letter-spacing': 'normal',
  'min-width': /^(auto|0px)$/,
  'min-height': /^(auto|0px)$/,
  'max-width': 'none',
  'max-height': 'none',
}

const isDefault = (prop: string, value: string) => {
  const d = DEFAULTS[prop]
  if (!d) return false
  if (typeof d === 'string') return value === d
  return d.test(value)
}

const pickMeaningful = (props: readonly string[], cs: CSSStyleDeclaration) => {
  const out: Record<string, string> = {}
  for (const p of props) {
    const v = cs.getPropertyValue(p).trim()
    if (!v) continue
    if (isDefault(p, v)) continue
    out[p] = v
  }
  return out
}

export interface ComputedGroups {
  layout: Record<string, string>
  style: Record<string, string>
}

export function extractComputed(el: Element): ComputedGroups {
  const cs = getComputedStyle(el)
  return {
    layout: pickMeaningful(LAYOUT_PROPS, cs),
    style: pickMeaningful(STYLE_PROPS, cs),
  }
}

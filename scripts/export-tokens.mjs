/**
 * CSS Tokens → Tokens Studio JSON
 *
 * 從 CSS token 檔案中的數學公式計算出實際色值，
 * 輸出為 Tokens Studio (DTCG) 格式的 JSON，
 * 供 Figma Variables 同步使用。
 *
 * CSS 維持 source of truth，此 JSON 為衍生產物。
 *
 * Usage: node scripts/export-tokens.mjs
 * Output: tokens/figma-tokens.json
 */

import { formatHex, formatHex8 } from 'culori'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, '..', 'tokens')
const OUTPUT_FILE = join(OUTPUT_DIR, 'figma-tokens.json')

// ─── oklch helpers ──────────────────────────────────────────────────────────

function oklchToHex(l, c, h, alpha = 1) {
  const color = { mode: 'oklch', l, c, h }
  if (alpha < 1) {
    color.alpha = alpha
    return formatHex8(color)
  }
  return formatHex(color)
}

function clamp(v, min = 0, max = 1) {
  return Math.min(max, Math.max(min, v))
}

// ─── Scale formulas (mirror CSS relative color math) ────────────────────────

const LIGHT_SCALE = {
  1:  { l: (l) => l + (1 - l) * 0.90, cx: 0.14 },
  2:  { l: (l) => l + (1 - l) * 0.75, cx: 0.22 },
  3:  { l: (l) => l + (1 - l) * 0.58, cx: 0.45 },
  4:  { l: (l) => l + (1 - l) * 0.40, cx: 0.75 },
  5:  { l: (l) => l + (1 - l) * 0.20, cx: 0.90 },
  7:  { l: (l) => l * 0.82,           cx: 0.93 },
  8:  { l: (l) => l * 0.62,           cx: 0.82 },
  9:  { l: (l) => l * 0.44,           cx: 0.65 },
  10: { l: (l) => l * 0.28,           cx: 0.48 },
}

const DARK_SCALE = {
  1:  { l: (l) => l * 0.18,           cx: 0.48 },
  2:  { l: (l) => l * 0.28,           cx: 0.65 },
  3:  { l: (l) => l * 0.44,           cx: 0.82 },
  4:  { l: (l) => l * 0.62,           cx: 0.93 },
  5:  { l: (l) => l * 0.82,           cx: 0.98 },
  7:  { l: (l) => l + (1 - l) * 0.20, cx: 0.88 },
  8:  { l: (l) => l + (1 - l) * 0.40, cx: 0.65 },
  9:  { l: (l) => l + (1 - l) * 0.58, cx: 0.35 },
  10: { l: (l) => l + (1 - l) * 0.75, cx: 0.14 },
}

function generateScale(base6, scale) {
  const { l, c, h } = base6
  const result = {}
  for (const [step, formula] of Object.entries(scale)) {
    result[step] = oklchToHex(
      clamp(formula.l(l)),
      clamp(c * formula.cx, 0, 0.4),
      h
    )
  }
  result[6] = oklchToHex(l, c, h)
  return result
}

// ─── Color definitions (from primitives.css) ────────────────────────────────

const HUES_LIGHT = {
  blue:         { l: 0.54, c: 0.22, h: 258 },
  'deep-orange': { l: 0.58, c: 0.19, h: 38 },
  orange:       { l: 0.73, c: 0.17, h: 57 },
  amber:        { l: 0.79, c: 0.16, h: 76 },
  yellow:       { l: 0.87, c: 0.17, h: 90 },
  lime:         { l: 0.81, c: 0.20, h: 122 },
  green:        { l: 0.70, c: 0.23, h: 142 },
  turquoise:    { l: 0.64, c: 0.09, h: 196 },
  indigo:       { l: 0.52, c: 0.26, h: 265 },
  purple:       { l: 0.52, c: 0.20, h: 294 },
  magenta:      { l: 0.57, c: 0.24, h: 342 },
  red:          { l: 0.46, c: 0.22, h: 25 },
}

const HUES_DARK = {
  blue:         { l: 0.60, c: 0.22, h: 258 },
  'deep-orange': { l: 0.63, c: 0.18, h: 38 },
  orange:       { l: 0.76, c: 0.16, h: 57 },
  amber:        { l: 0.82, c: 0.15, h: 76 },
  yellow:       { l: 0.89, c: 0.17, h: 90 },
  lime:         { l: 0.84, c: 0.19, h: 122 },
  green:        { l: 0.73, c: 0.23, h: 142 },
  turquoise:    { l: 0.57, c: 0.10, h: 225 },
  indigo:       { l: 0.57, c: 0.25, h: 265 },
  purple:       { l: 0.57, c: 0.19, h: 294 },
  magenta:      { l: 0.62, c: 0.23, h: 342 },
  red:          { l: 0.51, c: 0.21, h: 25 },
}

// ─── Static alpha tokens ────────────────────────────────────────────────────

const BLACK_ALPHAS = [0.02, 0.04, 0.06, 0.09, 0.15, 0.25, 0.37, 0.45, 0.65, 0.85, 0.98]
const WHITE_ALPHAS = [0.04, 0.08, 0.12, 0.15, 0.20, 0.30, 0.37, 0.45, 0.85, 0.98]

// Neutral alpha mapping: step → alpha token
const NEUTRAL_LIGHT_ALPHA = {
  1: 0.02, 2: 0.04, 3: 0.06, 4: 0.09, 5: 0.15, 6: 0.25, 7: 0.45, 8: 0.85, 9: 0.98,
}
const NEUTRAL_DARK_ALPHA = {
  1: 0.04, 2: 0.08, 3: 0.12, 4: 0.15, 5: 0.20, 6: 0.37, 7: 0.45, 8: 0.85, 9: 0.98,
}

// Neutral opaque values
const NEUTRAL_LIGHT_OPAQUE = {
  1: 0.98, 2: 0.96, 3: 0.94, 4: 0.91, 5: 0.85, 6: 0.78, 7: 0.55, 8: 0.36, 9: 0.18,
}
const NEUTRAL_DARK_OPAQUE = {
  1: 0.06, 2: 0.10, 3: 0.15, 4: 0.19, 5: 0.25, 6: 0.37, 7: 0.49, 8: 0.87, 9: 0.98,
}

// ─── Build token structure ──────────────────────────────────────────────────

function tok(value, type = 'color') {
  return { $value: value, $type: type }
}

function buildAlphaTokens() {
  const black = {}
  for (const a of BLACK_ALPHAS) {
    const key = `a${String(Math.round(a * 100)).padStart(2, '0')}`
    black[key] = tok(oklchToHex(0, 0, 0, a))
  }
  const white = {}
  for (const a of WHITE_ALPHAS) {
    const key = `a${String(Math.round(a * 100)).padStart(2, '0')}`
    white[key] = tok(oklchToHex(1, 0, 0, a))
  }
  return { black, white }
}

function buildNeutral(opaqueMap, alphaMap) {
  const result = {}
  for (const [step, l] of Object.entries(opaqueMap)) {
    result[step] = tok(oklchToHex(l, 0, 0))
  }
  // alpha variants
  const alpha = {}
  for (const [step, a] of Object.entries(alphaMap)) {
    // light = black alpha, dark = white alpha
    const isLight = opaqueMap[1] > 0.5
    alpha[step] = tok(isLight
      ? oklchToHex(0, 0, 0, a)
      : oklchToHex(1, 0, 0, a)
    )
  }
  return { opaque: result, alpha }
}

function buildHueScales(hues, scale) {
  const result = {}
  for (const [name, base6] of Object.entries(hues)) {
    result[name] = {}
    const steps = generateScale(base6, scale)
    for (const [step, hex] of Object.entries(steps)) {
      result[name][step] = tok(hex)
    }
  }
  return result
}

function buildElevation(isLight) {
  const tokens = isLight
    ? {
        '100':       { shadow: '0 8px 16px', alpha: 0.02 },
        '100-hover': { shadow: '0 8px 16px', alpha: 0.04 },
        '200':       { shadow: '0 16px 32px', alpha: 0.04 },
        '200-hover': { shadow: '0 16px 32px', alpha: 0.06 },
      }
    : {
        '100':       { shadow: '0 8px 16px', alpha: 0.37 },
        '100-hover': { shadow: '0 8px 16px', alpha: 0.45 },
        '200':       { shadow: '0 16px 32px', alpha: 0.45 },
        '200-hover': { shadow: '0 16px 32px', alpha: 0.65 },
      }

  const result = {}
  for (const [name, def] of Object.entries(tokens)) {
    const [, y, blur] = def.shadow.split(' ')
    result[name] = tok({
      x: '0',
      y,
      blur,
      spread: '0',
      color: oklchToHex(0, 0, 0, def.alpha),
      type: 'dropShadow',
    }, 'boxShadow')
  }
  return result
}

// ─── Semantic tokens (references use Tokens Studio {path} syntax) ───────────

function buildSemantic(mode) {
  const p = mode === 'light' ? 'primitive/light' : 'primitive/dark'
  const ref = (path) => `{${p}.${path}}`
  const refStatic = (path) => `{primitive/static.${path}}`

  const surface = mode === 'light'
    ? {
        canvas:          tok('#ffffff'),
        surface:         tok('#ffffff'),
        'surface-raised': tok('#ffffff'),
        overlay:         tok(refStatic('black.a45')),
        tooltip:         tok(ref('neutral.opaque.9')),
      }
    : {
        canvas:          tok(ref('neutral.opaque.1')),
        surface:         tok(refStatic('white.a08')),
        'surface-raised': tok(ref('neutral.opaque.3')),
        overlay:         tok(refStatic('black.a65')),
        tooltip:         tok(ref('neutral.opaque.4')),
      }

  const text = {
    foreground:    tok(ref('neutral.alpha.9')),
    'fg-secondary': tok(ref('neutral.alpha.8')),
    'fg-muted':    tok(ref('neutral.alpha.7')),
    'fg-disabled': tok(ref('neutral.alpha.6')),
  }

  const primary = mode === 'light'
    ? {
        primary:        tok(ref('blue.6')),
        'primary-hover': tok(ref('blue.5')),
        'primary-active': tok(ref('blue.7')),
        'primary-subtle': tok(ref('blue.1')),
      }
    : {
        primary:        tok(ref('blue.6')),
        'primary-hover': tok(ref('blue.7')),
        'primary-active': tok(ref('blue.5')),
        'primary-subtle': tok(ref('blue.1')),
      }

  const error = mode === 'light'
    ? {
        error:        tok(ref('deep-orange.6')),
        'error-hover': tok(ref('deep-orange.5')),
        'error-active': tok(ref('deep-orange.7')),
        'error-subtle': tok(ref('deep-orange.1')),
      }
    : {
        error:        tok(ref('deep-orange.6')),
        'error-hover': tok(ref('deep-orange.7')),
        'error-active': tok(ref('deep-orange.5')),
        'error-subtle': tok(ref('deep-orange.1')),
      }

  const success = mode === 'light'
    ? {
        success:        tok(ref('green.6')),
        'success-hover': tok(ref('green.5')),
        'success-active': tok(ref('green.7')),
        'success-subtle': tok(ref('green.1')),
      }
    : {
        success:        tok(ref('green.6')),
        'success-hover': tok(ref('green.7')),
        'success-active': tok(ref('green.5')),
        'success-subtle': tok(ref('green.1')),
      }

  const warning = mode === 'light'
    ? {
        warning:            tok(ref('yellow.6')),
        'warning-hover':    tok(ref('yellow.5')),
        'warning-active':   tok(ref('yellow.7')),
        'warning-subtle':   tok(ref('yellow.1')),
        'warning-foreground': tok(refStatic('black.a98')),
      }
    : {
        warning:            tok(ref('yellow.6')),
        'warning-hover':    tok(ref('yellow.7')),
        'warning-active':   tok(ref('yellow.5')),
        'warning-subtle':   tok(ref('yellow.1')),
        'warning-foreground': tok(refStatic('black.a98')),
      }

  const border = {
    border:  tok(ref('neutral.alpha.5')),
    divider: tok(ref('neutral.alpha.4')),
    ring:    tok('{semantic/' + mode + '.primary}'),
  }

  const interaction = {
    'neutral-hover':    tok(ref('neutral.alpha.1')),
    'neutral-selected': tok(ref('neutral.alpha.2')),
    'bg-disabled':      tok(ref('neutral.alpha.2')),
  }

  const notification = {
    notification: tok(ref('deep-orange.6')),
  }

  const brand = {
    brand: tok('#DF3232'),
  }

  return {
    ...surface,
    ...text,
    ...primary,
    ...error,
    ...success,
    ...warning,
    ...border,
    ...interaction,
    ...notification,
    ...brand,
  }
}

// ─── Typography ─────────────────────────────────────────────────────────────

function buildTypography() {
  const font = 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif'

  const styles = {
    h1:       { fontSize: '48', lineHeight: '1.3' },
    h2:       { fontSize: '32', lineHeight: '1.3' },
    h3:       { fontSize: '24', lineHeight: '1.3' },
    h4:       { fontSize: '20', lineHeight: '1.3' },
    h5:       { fontSize: '16', lineHeight: '1.3' },
    h6:       { fontSize: '14', lineHeight: '1.3' },
    'body-lg': { fontSize: '16', lineHeight: '1.5' },
    body:     { fontSize: '14', lineHeight: '1.5' },
    caption:  { fontSize: '12', lineHeight: '1.3' },
    footnote: { fontSize: '10', lineHeight: '1.3' },
  }

  const result = {}
  for (const [name, style] of Object.entries(styles)) {
    result[name] = tok({
      fontFamily: font,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      fontWeight: '400',
    }, 'typography')
  }
  // Also export individual font size tokens for component use
  result['font-size'] = {}
  for (const [name, style] of Object.entries(styles)) {
    result['font-size'][name] = tok(style.fontSize + 'px', 'fontSizes')
  }
  return result
}

// ─── Spacing / Size ─────────────────────────────────────────────────────────

function buildUiSize(mode) {
  const md = {
    'height-64': '64', 'height-56': '56', 'height-48': '48', 'height-40': '40',
    'height-36': '36', 'height-32': '32', 'height-28': '28',
    'space-8': '8', 'space-6': '6', 'space-4': '4', 'space-2': '2',
  }
  const lg = {
    'height-64': '72', 'height-56': '64', 'height-48': '56', 'height-40': '48',
    'height-36': '40', 'height-32': '36', 'height-28': '32',
    'space-8': '10', 'space-6': '8', 'space-4': '6', 'space-2': '4',
  }
  const values = mode === 'md' ? md : lg
  const result = {}
  for (const [name, value] of Object.entries(values)) {
    result[name] = tok(value + 'px', 'sizing')
  }
  return result
}

function buildLayoutSpace(mode) {
  const md = { loose: '16', tight: '12', bottom: '48' }
  const lg = { loose: '24', tight: '16', bottom: '48' }
  const values = mode === 'md' ? md : lg
  const result = {}
  for (const [name, value] of Object.entries(values)) {
    result[name] = tok(value + 'px', 'spacing')
  }
  return result
}

// ─── Radius ─────────────────────────────────────────────────────────────────

function buildRadius() {
  return {
    sm:   tok('4px', 'borderRadius'),
    md:   tok('4px', 'borderRadius'),
    lg:   tok('8px', 'borderRadius'),
    full: tok('9999px', 'borderRadius'),
  }
}

// ─── Opacity ────────────────────────────────────────────────────────────────

function buildOpacity() {
  return {
    disabled: tok('0.45', 'opacity'),
  }
}

// ─── Assemble ───────────────────────────────────────────────────────────────

function build() {
  const alphas = buildAlphaTokens()

  const tokenSets = {
    // Static tokens (don't change between themes)
    'primitive/static': {
      black: alphas.black,
      white: alphas.white,
      brand: tok('#DF3232'),
    },

    // Light mode primitives
    'primitive/light': {
      neutral: buildNeutral(NEUTRAL_LIGHT_OPAQUE, NEUTRAL_LIGHT_ALPHA),
      ...buildHueScales(HUES_LIGHT, LIGHT_SCALE),
      elevation: buildElevation(true),
    },

    // Dark mode primitives
    'primitive/dark': {
      neutral: buildNeutral(NEUTRAL_DARK_OPAQUE, NEUTRAL_DARK_ALPHA),
      ...buildHueScales(HUES_DARK, DARK_SCALE),
      elevation: buildElevation(false),
    },

    // Semantic tokens
    'semantic/light': buildSemantic('light'),
    'semantic/dark': buildSemantic('dark'),

    // Typography (theme-independent)
    typography: buildTypography(),

    // Density: md
    'density/md': {
      'ui-size': buildUiSize('md'),
      'layout-space': buildLayoutSpace('md'),
    },

    // Density: lg
    'density/lg': {
      'ui-size': buildUiSize('lg'),
      'layout-space': buildLayoutSpace('lg'),
    },

    // Shared
    radius: buildRadius(),
    opacity: buildOpacity(),
  }

  // Tokens Studio $themes — maps token sets to Figma Variable collection modes.
  // Token sets with the same "group" become modes of the same Figma collection.
  const themes = [
    {
      id: 'light',
      name: 'light',
      group: 'Theme',
      selectedTokenSets: {
        'primitive/static': 'enabled',
        'primitive/light': 'enabled',
        'primitive/dark': 'disabled',
        'semantic/light': 'enabled',
        'semantic/dark': 'disabled',
        typography: 'enabled',
        'density/md': 'enabled',
        'density/lg': 'disabled',
        radius: 'enabled',
        opacity: 'enabled',
      },
    },
    {
      id: 'dark',
      name: 'dark',
      group: 'Theme',
      selectedTokenSets: {
        'primitive/static': 'enabled',
        'primitive/light': 'disabled',
        'primitive/dark': 'enabled',
        'semantic/light': 'disabled',
        'semantic/dark': 'enabled',
        typography: 'enabled',
        'density/md': 'enabled',
        'density/lg': 'disabled',
        radius: 'enabled',
        opacity: 'enabled',
      },
    },
    {
      id: 'density-md',
      name: 'md',
      group: 'Density',
      selectedTokenSets: {
        'density/md': 'enabled',
        'density/lg': 'disabled',
      },
    },
    {
      id: 'density-lg',
      name: 'lg',
      group: 'Density',
      selectedTokenSets: {
        'density/md': 'disabled',
        'density/lg': 'enabled',
      },
    },
  ]

  const metadata = {
    tokenSetOrder: [
      'primitive/static',
      'primitive/light',
      'primitive/dark',
      'semantic/light',
      'semantic/dark',
      'typography',
      'density/md',
      'density/lg',
      'radius',
      'opacity',
    ],
  }

  return {
    ...tokenSets,
    $themes: themes,
    $metadata: metadata,
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

const tokens = build()
mkdirSync(OUTPUT_DIR, { recursive: true })
writeFileSync(OUTPUT_FILE, JSON.stringify(tokens, null, 2) + '\n')

// Stats
const countTokens = (obj) => {
  let count = 0
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && '$value' in v) count++
    else if (v && typeof v === 'object') count += countTokens(v)
  }
  return count
}

console.log(`✓ Exported ${countTokens(tokens)} tokens → ${OUTPUT_FILE}`)

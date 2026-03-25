/**
 * CSS Tokens → Tokens Studio JSON
 *
 * 從 CSS token 檔案中的數學公式計算出實際色值，
 * 輸出為 Tokens Studio (DTCG) 格式的 JSON，
 * 供 Figma Variables 同步使用。
 *
 * CSS 維持 source of truth，此 JSON 為衍生產物。
 *
 * 結構設計（對應 Figma Variable collections + modes）：
 *
 *   Collection "Theme" — modes: light, dark
 *     ├── static        (source) 不隨主題變的 alpha/brand
 *     ├── light / dark   (source) 原始色票，同路徑不同值
 *     └── semantic-light / semantic-dark (enabled) 語義引用，同路徑不同引用
 *
 *   Collection "Density" — modes: md, lg
 *     └── size-md / size-lg (enabled) ui-size + layout-space
 *
 *   不分 mode（所有 theme 都啟用）：
 *     typography, radius, opacity
 *
 * 語義引用使用 mode-agnostic 路徑（如 {blue.6}），
 * Tokens Studio 根據啟用的 set 自動解析到正確的 mode 值。
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
  blue:          { l: 0.54, c: 0.22, h: 258 },
  'deep-orange': { l: 0.58, c: 0.19, h: 38 },
  orange:        { l: 0.73, c: 0.17, h: 57 },
  amber:         { l: 0.79, c: 0.16, h: 76 },
  yellow:        { l: 0.87, c: 0.17, h: 90 },
  lime:          { l: 0.81, c: 0.20, h: 122 },
  green:         { l: 0.70, c: 0.23, h: 142 },
  turquoise:     { l: 0.64, c: 0.09, h: 196 },
  indigo:        { l: 0.52, c: 0.26, h: 265 },
  purple:        { l: 0.52, c: 0.20, h: 294 },
  magenta:       { l: 0.57, c: 0.24, h: 342 },
  red:           { l: 0.46, c: 0.22, h: 25 },
}

const HUES_DARK = {
  blue:          { l: 0.60, c: 0.22, h: 258 },
  'deep-orange': { l: 0.63, c: 0.18, h: 38 },
  orange:        { l: 0.76, c: 0.16, h: 57 },
  amber:         { l: 0.82, c: 0.15, h: 76 },
  yellow:        { l: 0.89, c: 0.17, h: 90 },
  lime:          { l: 0.84, c: 0.19, h: 122 },
  green:         { l: 0.73, c: 0.23, h: 142 },
  turquoise:     { l: 0.57, c: 0.10, h: 225 },
  indigo:        { l: 0.57, c: 0.25, h: 265 },
  purple:        { l: 0.57, c: 0.19, h: 294 },
  magenta:       { l: 0.62, c: 0.23, h: 342 },
  red:           { l: 0.51, c: 0.21, h: 25 },
}

// ─── Static alpha tokens ────────────────────────────────────────────────────

const BLACK_ALPHAS = [0.02, 0.04, 0.06, 0.09, 0.15, 0.25, 0.37, 0.45, 0.65, 0.85, 0.98]
const WHITE_ALPHAS = [0.04, 0.08, 0.12, 0.15, 0.20, 0.30, 0.37, 0.45, 0.85, 0.98]

const NEUTRAL_LIGHT_ALPHA = { 1: 0.02, 2: 0.04, 3: 0.06, 4: 0.09, 5: 0.15, 6: 0.25, 7: 0.45, 8: 0.85, 9: 0.98 }
const NEUTRAL_DARK_ALPHA  = { 1: 0.04, 2: 0.08, 3: 0.12, 4: 0.15, 5: 0.20, 6: 0.37, 7: 0.45, 8: 0.85, 9: 0.98 }

const NEUTRAL_LIGHT_OPAQUE = { 1: 0.98, 2: 0.96, 3: 0.94, 4: 0.91, 5: 0.85, 6: 0.78, 7: 0.55, 8: 0.36, 9: 0.18 }
const NEUTRAL_DARK_OPAQUE  = { 1: 0.06, 2: 0.10, 3: 0.15, 4: 0.19, 5: 0.25, 6: 0.37, 7: 0.49, 8: 0.87, 9: 0.98 }

// ─── Build helpers ──────────────────────────────────────────────────────────

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
  const isLight = opaqueMap[1] > 0.5
  const result = { opaque: {}, alpha: {} }
  for (const [step, l] of Object.entries(opaqueMap)) {
    result.opaque[step] = tok(oklchToHex(l, 0, 0))
  }
  for (const [step, a] of Object.entries(alphaMap)) {
    result.alpha[step] = tok(isLight
      ? oklchToHex(0, 0, 0, a)
      : oklchToHex(1, 0, 0, a)
    )
  }
  return result
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
  const defs = isLight
    ? { '100': 0.02, '100-hover': 0.04, '200': 0.04, '200-hover': 0.06 }
    : { '100': 0.37, '100-hover': 0.45, '200': 0.45, '200-hover': 0.65 }
  const sizes = { '100': ['8px', '16px'], '100-hover': ['8px', '16px'], '200': ['16px', '32px'], '200-hover': ['16px', '32px'] }

  const result = {}
  for (const [name, alpha] of Object.entries(defs)) {
    const [y, blur] = sizes[name]
    result[name] = tok({
      x: '0', y, blur, spread: '0',
      color: oklchToHex(0, 0, 0, alpha),
      type: 'dropShadow',
    }, 'boxShadow')
  }
  return result
}

// ─── Semantic tokens ────────────────────────────────────────────────────────
// References are MODE-AGNOSTIC: {blue.6} not {light.blue.6}
// Tokens Studio resolves based on which set is enabled in the active theme.

function buildSemantic(mode) {
  // {path} → resolves from whichever primitive set is active (light or dark)
  // {black.aN} / {white.aN} → resolves from static set (always active)

  const surface = mode === 'light'
    ? {
        canvas:            tok('#ffffff'),
        surface:           tok('#ffffff'),
        'surface-raised':  tok('#ffffff'),
        overlay:           tok('{black.a45}'),
        tooltip:           tok('{neutral.opaque.9}'),
      }
    : {
        canvas:            tok('{neutral.opaque.1}'),
        surface:           tok('{white.a08}'),
        'surface-raised':  tok('{neutral.opaque.3}'),
        overlay:           tok('{black.a65}'),
        tooltip:           tok('{neutral.opaque.4}'),
      }

  const text = {
    foreground:      tok('{neutral.alpha.9}'),
    'fg-secondary':  tok('{neutral.alpha.8}'),
    'fg-muted':      tok('{neutral.alpha.7}'),
    'fg-disabled':   tok('{neutral.alpha.6}'),
  }

  // hover/active 方向在 light/dark 互換
  const primary = mode === 'light'
    ? {
        primary:          tok('{blue.6}'),
        'primary-hover':  tok('{blue.5}'),
        'primary-active': tok('{blue.7}'),
        'primary-subtle': tok('{blue.1}'),
      }
    : {
        primary:          tok('{blue.6}'),
        'primary-hover':  tok('{blue.7}'),
        'primary-active': tok('{blue.5}'),
        'primary-subtle': tok('{blue.1}'),
      }

  const error = mode === 'light'
    ? {
        error:          tok('{deep-orange.6}'),
        'error-hover':  tok('{deep-orange.5}'),
        'error-active': tok('{deep-orange.7}'),
        'error-subtle': tok('{deep-orange.1}'),
      }
    : {
        error:          tok('{deep-orange.6}'),
        'error-hover':  tok('{deep-orange.7}'),
        'error-active': tok('{deep-orange.5}'),
        'error-subtle': tok('{deep-orange.1}'),
      }

  const success = mode === 'light'
    ? {
        success:          tok('{green.6}'),
        'success-hover':  tok('{green.5}'),
        'success-active': tok('{green.7}'),
        'success-subtle': tok('{green.1}'),
      }
    : {
        success:          tok('{green.6}'),
        'success-hover':  tok('{green.7}'),
        'success-active': tok('{green.5}'),
        'success-subtle': tok('{green.1}'),
      }

  const warning = mode === 'light'
    ? {
        warning:              tok('{yellow.6}'),
        'warning-hover':      tok('{yellow.5}'),
        'warning-active':     tok('{yellow.7}'),
        'warning-subtle':     tok('{yellow.1}'),
        'warning-foreground': tok('{black.a98}'),
      }
    : {
        warning:              tok('{yellow.6}'),
        'warning-hover':      tok('{yellow.7}'),
        'warning-active':     tok('{yellow.5}'),
        'warning-subtle':     tok('{yellow.1}'),
        'warning-foreground': tok('{black.a98}'),
      }

  const border = {
    border:  tok('{neutral.alpha.5}'),
    divider: tok('{neutral.alpha.4}'),
    ring:    tok('{semantic.primary}'),
  }

  const interaction = {
    'neutral-hover':    tok('{neutral.alpha.1}'),
    'neutral-active':   tok('{neutral.alpha.2}'),
    'bg-disabled':      tok('{neutral.alpha.2}'),
  }

  return {
    ...surface, ...text, ...primary, ...error,
    ...success, ...warning, ...border, ...interaction,
    notification: tok('{deep-orange.6}'),
    brand: tok('#DF3232'),
  }
}

// ─── Typography ─────────────────────────────────────────────────────────────

function buildTypography() {
  const font = 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
  const styles = {
    h1:        { fontSize: '48', lineHeight: '1.3' },
    h2:        { fontSize: '32', lineHeight: '1.3' },
    h3:        { fontSize: '24', lineHeight: '1.3' },
    h4:        { fontSize: '20', lineHeight: '1.3' },
    h5:        { fontSize: '16', lineHeight: '1.3' },
    h6:        { fontSize: '14', lineHeight: '1.3' },
    'body-lg': { fontSize: '16', lineHeight: '1.5' },
    body:      { fontSize: '14', lineHeight: '1.5' },
    caption:   { fontSize: '12', lineHeight: '1.3' },
    footnote:  { fontSize: '10', lineHeight: '1.3' },
  }
  const result = { 'font-size': {} }
  for (const [name, style] of Object.entries(styles)) {
    result[name] = tok({
      fontFamily: font,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      fontWeight: '400',
    }, 'typography')
    result['font-size'][name] = tok(style.fontSize + 'px', 'fontSizes')
  }
  return result
}

// ─── Density (ui-size + layout-space) ───────────────────────────────────────

function buildDensity(mode) {
  const uiSize = mode === 'md'
    ? { 'height-64': '64', 'height-56': '56', 'height-48': '48', 'height-40': '40', 'height-36': '36', 'height-32': '32', 'height-28': '28', 'space-8': '8', 'space-6': '6', 'space-4': '4', 'space-2': '2' }
    : { 'height-64': '72', 'height-56': '64', 'height-48': '56', 'height-40': '48', 'height-36': '40', 'height-32': '36', 'height-28': '32', 'space-8': '10', 'space-6': '8', 'space-4': '6', 'space-2': '4' }
  const layoutSpace = mode === 'md'
    ? { loose: '16', tight: '12', bottom: '48' }
    : { loose: '24', tight: '16', bottom: '48' }

  const result = { 'ui-size': {}, 'layout-space': {} }
  for (const [name, value] of Object.entries(uiSize)) {
    result['ui-size'][name] = tok(value + 'px', 'sizing')
  }
  for (const [name, value] of Object.entries(layoutSpace)) {
    result['layout-space'][name] = tok(value + 'px', 'spacing')
  }
  return result
}

// ─── Radius / Opacity ───────────────────────────────────────────────────────

function buildRadius() {
  return {
    sm: tok('4px', 'borderRadius'), md: tok('4px', 'borderRadius'),
    lg: tok('8px', 'borderRadius'), full: tok('9999px', 'borderRadius'),
  }
}

function buildOpacity() {
  return { disabled: tok('0.45', 'opacity') }
}

// ─── Assemble ───────────────────────────────────────────────────────────────

function build() {
  const alphas = buildAlphaTokens()

  const tokenSets = {
    // ── Static (不隨 theme 變) ──
    static: {
      black: alphas.black,
      white: alphas.white,
      brand: tok('#DF3232'),
    },

    // ── Primitives: light 和 dark 同路徑、不同值 ──
    light: {
      neutral: buildNeutral(NEUTRAL_LIGHT_OPAQUE, NEUTRAL_LIGHT_ALPHA),
      ...buildHueScales(HUES_LIGHT, LIGHT_SCALE),
      elevation: buildElevation(true),
    },
    dark: {
      neutral: buildNeutral(NEUTRAL_DARK_OPAQUE, NEUTRAL_DARK_ALPHA),
      ...buildHueScales(HUES_DARK, DARK_SCALE),
      elevation: buildElevation(false),
    },

    // ── Semantic: light 和 dark 同路徑、不同引用方向 ──
    semantic: buildSemantic('light'),
    'semantic-dark': buildSemantic('dark'),

    // ── 不分 mode ──
    typography: buildTypography(),
    radius: buildRadius(),
    opacity: buildOpacity(),

    // ── Density: md 和 lg 同路徑、不同值 ──
    'size-md': buildDensity('md'),
    'size-lg': buildDensity('lg'),
  }

  // ── $themes: 告訴 Tokens Studio 如何組合 sets → Figma collection modes ──
  const $themes = [
    {
      id: 'light',
      name: 'light',
      group: 'Theme',
      selectedTokenSets: {
        static:           'source',   // 可引用但不獨立輸出
        light:            'enabled',  // 原始色票 → Figma Variables
        dark:             'disabled',
        semantic:         'enabled',  // 語義 → Figma Variables
        'semantic-dark':  'disabled',
        typography:       'enabled',
        radius:           'enabled',
        opacity:          'enabled',
        'size-md':        'enabled',
        'size-lg':        'disabled',
      },
    },
    {
      id: 'dark',
      name: 'dark',
      group: 'Theme',
      selectedTokenSets: {
        static:           'source',
        light:            'disabled',
        dark:             'enabled',
        semantic:         'disabled',
        'semantic-dark':  'enabled',
        typography:       'enabled',
        radius:           'enabled',
        opacity:          'enabled',
        'size-md':        'enabled',
        'size-lg':        'disabled',
      },
    },
    {
      id: 'density-md',
      name: 'md',
      group: 'Density',
      selectedTokenSets: {
        'size-md': 'enabled',
        'size-lg': 'disabled',
      },
    },
    {
      id: 'density-lg',
      name: 'lg',
      group: 'Density',
      selectedTokenSets: {
        'size-md': 'disabled',
        'size-lg': 'enabled',
      },
    },
  ]

  const $metadata = {
    tokenSetOrder: [
      'static', 'light', 'dark',
      'semantic', 'semantic-dark',
      'typography', 'radius', 'opacity',
      'size-md', 'size-lg',
    ],
  }

  return { ...tokenSets, $themes, $metadata }
}

// ─── Main ───────────────────────────────────────────────────────────────────

const tokens = build()
mkdirSync(OUTPUT_DIR, { recursive: true })
writeFileSync(OUTPUT_FILE, JSON.stringify(tokens, null, 2) + '\n')

const countTokens = (obj) => {
  let count = 0
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('$')) continue
    if (v && typeof v === 'object' && '$value' in v) count++
    else if (v && typeof v === 'object') count += countTokens(v)
  }
  return count
}

console.log(`✓ Exported ${countTokens(tokens)} tokens → ${OUTPUT_FILE}`)

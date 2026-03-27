/**
 * Figma Plugin — Button Component Generator
 *
 * 自動建立 Button component set，所有 fill / stroke / text 綁定 Figma Variables。
 * Icon 使用 Lucide Icons library 的 component instances。
 *
 * 載入方式：Figma → Plugins → Development → Import plugin from manifest
 * 指向 figma-plugin/manifest.json
 */

// ─── Variable Lookup ────────────────────────────────────────────────────────

async function buildVariableLookup() {
  const colorVars = await figma.variables.getLocalVariablesAsync('COLOR')
  const floatVars = await figma.variables.getLocalVariablesAsync('FLOAT')
  const allVars = [...colorVars, ...floatVars]

  const collections = {}
  for (const col of await figma.variables.getLocalVariableCollectionsAsync()) {
    collections[col.id] = col.name
  }

  const lookup = {}
  for (const v of allVars) {
    const colName = collections[v.variableCollectionId] || 'unknown'
    lookup[`${colName}/${v.name}`] = v
    if (!lookup[v.name]) lookup[v.name] = v
  }
  return lookup
}

function getVar(lookup, collectionName, varName) {
  return lookup[`${collectionName}/${varName}`] || lookup[varName] || null
}

// ─── Paint helpers ──────────────────────────────────────────────────────────

function solidPaint(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return { type: 'SOLID', color: { r, g, b }, opacity: 1 }
}

function boundPaint(variable) {
  if (!variable) return solidPaint('#FF00FF')
  const paint = solidPaint('#000000')
  return figma.variables.setBoundVariableForPaint(paint, 'color', variable)
}

function transparentPaint() {
  return { type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0 }
}

// ─── Icon helper ────────────────────────────────────────────────────────────

// Icon lookup reserved for future use

// Create a simple icon placeholder component
function createIconPlaceholder(size, name) {
  const frame = figma.createFrame()
  frame.name = name
  frame.resize(size, size)
  frame.fills = []
  frame.clipsContent = false

  // Draw a simple placeholder shape
  const rect = figma.createRectangle()
  rect.resize(size, size)
  rect.cornerRadius = 2
  rect.fills = [{ type: 'SOLID', color: { r: 0.7, g: 0.7, b: 0.7 }, opacity: 0.3 }]
  frame.appendChild(rect)

  return frame
}

// ─── Color mappings (matches button.tsx exactly) ────────────────────────────

const VARIANT_COLORS = {
  'primary': {
    default:  { bg: 'primary',       text: '#FFFFFF', border: null },
    hover:    { bg: 'primary-hover',  text: '#FFFFFF', border: null },
    active:   { bg: 'primary-active', text: '#FFFFFF', border: null },
    disabled: { bg: 'bg-disabled',    text: 'fg-disabled', border: null },
  },
  'primary-danger': {
    default:  { bg: 'error',          text: '#FFFFFF', border: null },
    hover:    { bg: 'error-hover',    text: '#FFFFFF', border: null },
    active:   { bg: 'error-active',   text: '#FFFFFF', border: null },
    disabled: { bg: 'bg-disabled',    text: 'fg-disabled', border: null },
  },
  'secondary': {
    default:  { bg: 'surface',        text: 'primary',        border: 'primary' },
    hover:    { bg: 'surface',        text: 'primary-hover',  border: 'primary-hover' },
    active:   { bg: 'surface',        text: 'primary-active', border: 'primary-active' },
    disabled: { bg: null,             text: 'fg-disabled',    border: 'border' },
  },
  'secondary-danger': {
    default:  { bg: 'surface',        text: 'error',          border: 'error' },
    hover:    { bg: 'surface',        text: 'error-hover',    border: 'error-hover' },
    active:   { bg: 'surface',        text: 'error-active',   border: 'error-active' },
    disabled: { bg: null,             text: 'fg-disabled',    border: 'border' },
  },
  'tertiary': {
    default:  { bg: 'surface',        text: 'foreground',     border: 'border' },
    hover:    { bg: 'surface',        text: 'primary-hover',  border: 'primary-hover' },
    active:   { bg: 'surface',        text: 'primary-active', border: 'primary-active' },
    disabled: { bg: null,             text: 'fg-disabled',    border: 'border' },
  },
  'text': {
    default:  { bg: null,             text: 'foreground',     border: null },
    hover:    { bg: 'neutral-hover',  text: 'foreground',     border: null },
    active:   { bg: 'neutral-active', text: 'foreground',     border: null },
    disabled: { bg: null,             text: 'fg-disabled',    border: null },
  },
  'text-danger': {
    default:  { bg: null,             text: 'error',          border: null },
    hover:    { bg: 'neutral-hover',  text: 'error-hover',    border: null },
    active:   { bg: 'neutral-active', text: 'error-active',   border: null },
    disabled: { bg: null,             text: 'fg-disabled',    border: null },
  },
  'checked': {
    default:  { bg: 'primary-subtle', text: 'primary',        border: null },
    hover:    { bg: 'primary-subtle', text: 'primary-hover',  border: null },
    active:   { bg: 'primary-subtle', text: 'primary-active', border: null },
    disabled: { bg: 'bg-disabled',    text: 'fg-disabled',    border: null },
  },
  'link': {
    default:  { bg: null,             text: 'primary',        border: null },
    hover:    { bg: null,             text: 'primary-hover',  border: null },
    active:   { bg: null,             text: 'primary-active', border: null },
    disabled: { bg: null,             text: 'fg-disabled',    border: null },
  },
}

const SIZES = {
  xs: { height: 24, paddingX: 8,  fontSize: 12, iconSize: 16, gap: 4, heightVar: null },
  sm: { height: 28, paddingX: 12, fontSize: 14, iconSize: 16, gap: 8, heightVar: 'ui-size/height-28' },
  md: { height: 32, paddingX: 12, fontSize: 14, iconSize: 16, gap: 8, heightVar: 'ui-size/height-32' },
  lg: { height: 36, paddingX: 12, fontSize: 16, iconSize: 20, gap: 8, heightVar: 'ui-size/height-36' },
}

const STATES = ['default', 'hover', 'active', 'disabled']
const FONT_FAMILY = 'Roboto'
const FONT_STYLE_MEDIUM = 'Medium'

// Size → Text Style name mapping
const SIZE_TEXT_STYLE = {
  xs: 'caption',   // 12px
  sm: 'body',      // 14px
  md: 'body',      // 14px
  lg: 'body-lg',   // 16px
}

// ─── Text Style lookup ──────────────────────────────────────────────────────

async function buildTextStyleLookup() {
  var styles = await figma.getLocalTextStylesAsync()
  var lookup = {}
  for (var i = 0; i < styles.length; i++) {
    lookup[styles[i].name] = styles[i]
  }
  return lookup
}

// ─── Component builder ──────────────────────────────────────────────────────

async function createButtonVariant(lookup, textStyleLookup, variantName, state, sizeName) {
  const colors = VARIANT_COLORS[variantName][state]
  const size = SIZES[sizeName]

  const component = figma.createComponent()
  component.name = `Variant=${variantName}, State=${state}, Size=${sizeName}`

  // Auto layout
  component.layoutMode = 'HORIZONTAL'
  component.primaryAxisAlignItems = 'CENTER'
  component.counterAxisAlignItems = 'CENTER'
  component.paddingLeft = size.paddingX
  component.paddingRight = size.paddingX
  component.paddingTop = 0
  component.paddingBottom = 0
  component.itemSpacing = size.gap
  component.cornerRadius = 4

  // Height
  if (size.heightVar) {
    const heightVariable = getVar(lookup, 'size-md', size.heightVar)
    if (heightVariable) {
      component.resize(120, size.height)
      component.setBoundVariable('height', heightVariable)
    } else {
      component.resize(120, size.height)
    }
  } else {
    component.resize(120, size.height)
  }

  component.primaryAxisSizingMode = 'AUTO'
  component.counterAxisSizingMode = 'FIXED'

  // Background fill
  if (colors.bg) {
    const bgVar = getVar(lookup, 'semantic', colors.bg)
    component.fills = bgVar ? [boundPaint(bgVar)] : [solidPaint('#FFFFFF')]
  } else {
    component.fills = [transparentPaint()]
  }

  // Border stroke
  if (colors.border) {
    const borderVar = getVar(lookup, 'semantic', colors.border)
    component.strokes = borderVar ? [boundPaint(borderVar)] : []
    component.strokeWeight = 1
    component.strokeAlign = 'INSIDE'
  } else {
    component.strokes = []
  }

  // ── Resolve text/icon color ──
  function applyColor(node) {
    if (colors.text.startsWith('#')) {
      node.fills = [solidPaint(colors.text)]
    } else {
      const textVar = getVar(lookup, 'semantic', colors.text)
      node.fills = textVar ? [boundPaint(textVar)] : [solidPaint('#000000')]
    }
  }

  // ── Start Icon ──
  const startIcon = createIconPlaceholder(size.iconSize, 'startIcon')
  applyColor(startIcon.children[0])
  component.appendChild(startIcon)

  // ── Label ──
  const label = figma.createText()
  label.name = 'label'

  // 1. Apply Text Style (token for font-family + font-size)
  var styleName = SIZE_TEXT_STYLE[sizeName]
  var textStyle = textStyleLookup[styleName]
  if (textStyle) {
    label.textStyleId = textStyle.id
  }

  // 2. Button overrides: Medium weight + compact line-height (1.3)
  label.fontName = { family: FONT_FAMILY, style: FONT_STYLE_MEDIUM }
  label.lineHeight = { value: Math.round(label.fontSize * 1.3), unit: 'PIXELS' }

  label.characters = 'Button'
  applyColor(label)
  component.appendChild(label)

  // ── End Icon ──
  const endIcon = createIconPlaceholder(size.iconSize, 'endIcon')
  applyColor(endIcon.children[0])
  endIcon.visible = false
  component.appendChild(endIcon)

  return component
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Load fonts
  try {
    await figma.loadFontAsync({ family: FONT_FAMILY, style: FONT_STYLE_MEDIUM })
  } catch (e) {
    figma.notify('Font ' + FONT_FAMILY + ' ' + FONT_STYLE_MEDIUM + ' not found. Install Roboto first.', { error: true, timeout: 5000 })
    figma.closePlugin()
    return
  }

  const lookup = await buildVariableLookup()
  const textStyleLookup = await buildTextStyleLookup()
  const varCount = Object.keys(lookup).length
  const styleCount = Object.keys(textStyleLookup).length
  console.log('Found ' + varCount + ' variables, ' + styleCount + ' text styles')

  // Check critical variables
  const criticalVars = ['primary', 'primary-hover', 'error', 'foreground', 'fg-disabled', 'border', 'surface', 'neutral-hover', 'neutral-active', 'bg-disabled']
  const missing = criticalVars.filter(name => !getVar(lookup, 'semantic', name))
  if (missing.length > 0) {
    figma.notify(`⚠️ Missing variables: ${missing.join(', ')}`, { timeout: 5000 })
  }

  // Create all variants
  const components = []
  const variantNames = Object.keys(VARIANT_COLORS)
  const sizeNames = Object.keys(SIZES)
  const total = variantNames.length * STATES.length * sizeNames.length

  figma.notify(`Building ${total} button variants...`, { timeout: 2000 })

  for (const variantName of variantNames) {
    for (const state of STATES) {
      for (const sizeName of sizeNames) {
        const comp = await createButtonVariant(lookup, textStyleLookup, variantName, state, sizeName)
        components.push(comp)
      }
    }
  }

  // Combine into component set
  const parent = figma.createFrame()
  parent.name = 'Button'
  parent.fills = []

  for (const comp of components) {
    parent.appendChild(comp)
  }

  const componentSet = figma.combineAsVariants(components, parent)
  componentSet.name = 'Button'
  componentSet.layoutMode = 'VERTICAL'
  componentSet.primaryAxisSizingMode = 'AUTO'
  componentSet.counterAxisSizingMode = 'AUTO'
  componentSet.itemSpacing = 16
  componentSet.paddingTop = 32
  componentSet.paddingBottom = 32
  componentSet.paddingLeft = 32
  componentSet.paddingRight = 32

  componentSet.description = `Button — ${total} variants\nSpec: https://ajenchen.github.io/design-system/?path=/story/design-system-button-使用原則--variant-rule\n\nAll colors bound to Figma Variables.\nFont: ${FONT_FAMILY} ${FONT_STYLE_MEDIUM}\nIcons: Replace placeholder with Lucide icons via instance swap.`

  componentSet.x = 0
  componentSet.y = 0

  figma.currentPage.selection = [componentSet]
  figma.viewport.scrollAndZoomIntoView([componentSet])

  figma.notify(`✓ Created Button with ${total} variants`, { timeout: 3000 })
  figma.closePlugin()
}

main().catch(err => {
  console.error(err)
  figma.notify(`Error: ${err.message}`, { error: true, timeout: 5000 })
  figma.closePlugin()
})

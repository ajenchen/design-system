#!/usr/bin/env node
// Canonical static TypeScript analyzers used by the TSX governance hooks.
// The helper resolves TypeScript from the governed project so consumers use
// their pinned parser dependency instead of a provider-specific installation.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const [mode, ...extra] = process.argv.slice(2)
const modes = new Set([
  'header-with-tabs-border',
  'app-shell-primary-header',
  'chrome-header-handcraft',
])
if (extra.length !== 0 || !modes.has(mode)) process.exit(2)

const requireFromProject = createRequire(resolve(process.cwd(), 'package.json'))
const ts = requireFromProject('typescript')
const source = readFileSync(0, 'utf8')

const hasLeadingLineEscape = (marker) => {
  let offset = source.charCodeAt(0) === 0xfeff ? 1 : 0
  while (offset < source.length) {
    while (offset < source.length && /\s/.test(source[offset])) offset += 1
    if (source.startsWith('//', offset)) {
      const end = source.indexOf('\n', offset)
      const lineEnd = end < 0 ? source.length : end
      const line = source.slice(offset, lineEnd)
      const match = line.match(new RegExp(`^//\\s*@${marker}:\\s*(\\S(?:.*\\S)?)\\s*$`))
      if (match) return true
      offset = lineEnd + (end < 0 ? 0 : 1)
      continue
    }
    if (source.startsWith('/*', offset)) {
      const end = source.indexOf('*/', offset + 2)
      if (end < 0) return false
      offset = end + 2
      continue
    }
    return false
  }
  return false
}

const sourceFile = ts.createSourceFile(
  'governance.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
)
if (sourceFile.parseDiagnostics.length) process.exit(3)

const openingOf = (node) => (
  ts.isJsxElement(node)
    ? node.openingElement
    : ts.isJsxSelfClosingElement(node) ? node : null
)

function analyzeHeaderWithTabsBorder() {
  if (hasLeadingLineEscape('header-withtabs-allow')) {
    process.stdout.write('ESCAPE')
    return
  }

  const nameText = (tag) => {
    const text = tag.getText(sourceFile)
    return text.includes('.') ? text.slice(text.lastIndexOf('.') + 1) : text
  }
  const isHeader = (opening) => {
    const name = nameText(opening.tagName)
    return name === 'Header' || /^[A-Z][A-Za-z]*Header$/.test(name)
  }
  const isTabs = (opening) => (
    ['Tabs', 'TabsList', 'TabsTrigger'].includes(nameText(opening.tagName))
  )
  const hasTrueWithTabs = (opening) => {
    const properties = opening.attributes.properties
    const items = properties.filter((property) => (
      ts.isJsxAttribute(property) && property.name.getText(sourceFile) === 'withTabs'
    ))
    if (items.length !== 1) return false
    const item = items[0]
    const itemIndex = properties.indexOf(item)
    if (properties.slice(itemIndex + 1).some(ts.isJsxSpreadAttribute)) return false
    if (!item.initializer) return true
    return (
      ts.isJsxExpression(item.initializer)
      && item.initializer.expression?.kind === ts.SyntaxKind.TrueKeyword
    )
  }
  const containsTabs = (header) => {
    let found = false
    const visit = (node) => {
      if (node !== header) {
        const opening = openingOf(node)
        if (opening && isHeader(opening)) return
        if (opening && isTabs(opening)) found = true
      }
      if (!found) ts.forEachChild(node, visit)
    }
    ts.forEachChild(header, visit)
    return found
  }

  let applicable = 0
  let violations = 0
  const visit = (node) => {
    const opening = openingOf(node)
    if (opening && isHeader(opening) && containsTabs(node)) {
      applicable += 1
      if (!hasTrueWithTabs(opening)) violations += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  process.stdout.write(`${applicable}|${violations}`)
}

function analyzeAppShellPrimaryHeader() {
  if (hasLeadingLineEscape('app-shell-primary-header-allow')) {
    process.stdout.write('ESCAPE')
    return
  }

  const tagText = (tag) => tag.getText(sourceFile)
  const named = (tag, name) => {
    const text = tagText(tag)
    return text === name || text.endsWith(`.${name}`)
  }
  const effectiveAttribute = (opening, name) => {
    const properties = opening.attributes.properties
    for (let index = properties.length - 1; index >= 0; index -= 1) {
      const item = properties[index]
      if (ts.isJsxSpreadAttribute(item)) return { known: false, item: null }
      if (ts.isJsxAttribute(item) && item.name.getText(sourceFile) === name) {
        return { known: true, item }
      }
    }
    return { known: true, item: null }
  }
  const unwrap = (expression) => {
    let current = expression
    while (ts.isParenthesizedExpression(current)) current = current.expression
    return current
  }
  const staticString = (expression) => {
    const current = unwrap(expression)
    if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
      return { known: true, value: current.text }
    }
    if (
      ts.isBinaryExpression(current)
      && current.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const left = staticString(current.left)
      const right = staticString(current.right)
      if (left.known && right.known) return { known: true, value: left.value + right.value }
    }
    return { known: false, value: '' }
  }
  const staticLayout = (opening) => {
    const resolved = effectiveAttribute(opening, 'layout')
    if (!resolved.known || !resolved.item || !resolved.item.initializer) {
      return { known: resolved.known, value: '' }
    }
    if (ts.isStringLiteral(resolved.item.initializer)) {
      return { known: true, value: resolved.item.initializer.text }
    }
    if (!ts.isJsxExpression(resolved.item.initializer) || !resolved.item.initializer.expression) {
      return { known: false, value: '' }
    }
    return staticString(resolved.item.initializer.expression)
  }
  const globalHeaderMissing = (opening) => {
    const resolved = effectiveAttribute(opening, 'globalHeader')
    if (!resolved.known) return false
    if (!resolved.item) return true
    if (!resolved.item.initializer) return false
    if (ts.isStringLiteral(resolved.item.initializer)) return false
    if (!ts.isJsxExpression(resolved.item.initializer) || !resolved.item.initializer.expression) {
      return true
    }
    const expression = unwrap(resolved.item.initializer.expression)
    if (
      expression.kind === ts.SyntaxKind.NullKeyword
      || expression.kind === ts.SyntaxKind.FalseKeyword
      || (ts.isIdentifier(expression) && expression.text === 'undefined')
    ) return true
    if (
      ts.isVoidExpression(expression)
      && ts.isNumericLiteral(unwrap(expression.expression))
      && unwrap(expression.expression).text === '0'
    ) return true
    return false
  }
  const positiveIsMobile = (expression) => {
    const current = unwrap(expression)
    return ts.isIdentifier(current) && current.text === 'isMobile'
  }
  const isWithin = (node, container) => (
    node.pos >= container.pos && node.end <= container.end
  )
  const isNestedAppShell = (node) => {
    const opening = openingOf(node)
    return Boolean(opening && named(opening.tagName, 'AppShell'))
  }
  const mobileGuarded = (node, boundary) => {
    for (let current = node.parent; current && current !== boundary; current = current.parent) {
      if (
        ts.isBinaryExpression(current)
        && current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        && positiveIsMobile(current.left)
        && isWithin(node, current.right)
      ) return true
      if (
        ts.isConditionalExpression(current)
        && positiveIsMobile(current.condition)
        && isWithin(node, current.whenTrue)
      ) return true
    }
    return false
  }

  let v1 = 0
  let v2 = 0
  let v3 = 0
  const inspectAppShell = (appShell) => {
    const opening = openingOf(appShell)
    if (!opening || !named(opening.tagName, 'AppShell')) return
    const layout = staticLayout(opening)
    if (!layout.known || layout.value !== 'primary-header') return
    if (globalHeaderMissing(opening)) v1 += 1
    const visitDescendant = (node) => {
      if (node !== appShell) {
        if (isNestedAppShell(node)) return
        const childOpening = openingOf(node)
        if (
          childOpening
          && named(childOpening.tagName, 'SidebarHeader')
          && !mobileGuarded(node, appShell)
        ) v2 += 1
        if (childOpening && named(childOpening.tagName, 'SidebarFooter')) v3 += 1
      }
      ts.forEachChild(node, visitDescendant)
    }
    ts.forEachChild(appShell, visitDescendant)
  }
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) inspectAppShell(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  process.stdout.write(`${v1}|${v2}|${v3}`)
}

function analyzeChromeHeaderHandcraft() {
  if (hasLeadingLineEscape('chrome-header-handcraft-allow')) {
    process.stdout.write('ESCAPE')
    return
  }

  const variables = new Map()
  const indexVariables = (node) => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      const name = node.name.text
      variables.set(name, variables.has(name) ? null : node.initializer)
    }
    ts.forEachChild(node, indexVariables)
  }
  indexVariables(sourceFile)

  const unwrap = (expression) => {
    let current = expression
    while (
      ts.isParenthesizedExpression(current)
      || ts.isAsExpression(current)
      || ts.isTypeAssertionExpression(current)
      || ts.isNonNullExpression(current)
      || ts.isSatisfiesExpression(current)
    ) current = current.expression
    return current
  }
  const fragments = (expression, seen = new Set()) => {
    const current = unwrap(expression)
    if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
      return [current.text]
    }
    if (ts.isTemplateExpression(current)) {
      return [
        current.head.text,
        ...current.templateSpans.flatMap((span) => [
          ...fragments(span.expression, new Set(seen)),
          span.literal.text,
        ]),
      ]
    }
    if (
      ts.isIdentifier(current)
      && variables.has(current.text)
      && variables.get(current.text)
      && !seen.has(current.text)
    ) {
      const nextSeen = new Set(seen)
      nextSeen.add(current.text)
      return fragments(variables.get(current.text), nextSeen)
    }
    if (ts.isBinaryExpression(current)) {
      if (current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        return fragments(current.right, new Set(seen))
      }
      if (current.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        return [
          ...fragments(current.left, new Set(seen)),
          ...fragments(current.right, new Set(seen)),
        ]
      }
      return []
    }
    if (ts.isConditionalExpression(current)) {
      return [
        ...fragments(current.whenTrue, new Set(seen)),
        ...fragments(current.whenFalse, new Set(seen)),
      ]
    }
    if (ts.isCallExpression(current)) {
      const calleeFragments = (
        ts.isIdentifier(current.expression)
        && variables.has(current.expression.text)
        && variables.get(current.expression.text)
        && !seen.has(current.expression.text)
      )
        ? (() => {
            const nextSeen = new Set(seen)
            nextSeen.add(current.expression.text)
            return fragments(variables.get(current.expression.text), nextSeen)
          })()
        : []
      return [
        ...calleeFragments,
        ...current.arguments.flatMap((argument) => fragments(argument, new Set(seen))),
      ]
    }
    if (ts.isArrayLiteralExpression(current)) {
      return current.elements.flatMap((element) => fragments(element, new Set(seen)))
    }
    if (ts.isObjectLiteralExpression(current)) {
      return current.properties.flatMap((property) => {
        if (ts.isPropertyAssignment(property)) {
          const name = property.name
          const nameFragments = (
            ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)
          )
            ? [name.text]
            : ts.isIdentifier(name) ? [name.text] : []
          return [
            ...nameFragments,
            ...fragments(property.initializer, new Set(seen)),
          ]
        }
        return []
      })
    }
    return []
  }
  const effectiveClassName = (opening) => {
    const properties = opening.attributes.properties
    for (let index = properties.length - 1; index >= 0; index -= 1) {
      const item = properties[index]
      if (ts.isJsxSpreadAttribute(item)) return null
      if (ts.isJsxAttribute(item) && item.name.getText(sourceFile) === 'className') return item
    }
    return null
  }
  const tokensFor = (attribute) => {
    if (!attribute || !attribute.initializer) return new Set()
    let values = []
    if (ts.isStringLiteral(attribute.initializer)) values = [attribute.initializer.text]
    else if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
      values = fragments(attribute.initializer.expression)
    }
    return new Set(values.flatMap((value) => value.split(/\s+/)).filter(Boolean))
  }
  const signature = [
    'h-[var(--chrome-header-height)]',
    'border-b',
    'border-divider',
  ]
  let hit = false
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      const tokens = tokensFor(effectiveClassName(opening))
      if (signature.every((token) => tokens.has(token))) hit = true
    }
    if (!hit) ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  process.stdout.write(hit ? 'HIT' : 'CLEAN')
}

if (mode === 'header-with-tabs-border') analyzeHeaderWithTabsBorder()
else if (mode === 'app-shell-primary-header') analyzeAppShellPrimaryHeader()
else analyzeChromeHeaderHandcraft()

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
  'item-list-gap',
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
  if (hasLeadingLineEscape('header-tabs-slot-allow')) {
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
  // 只認這個 header 自己 opening 上的 tabsSlot(JsxAttribute → JsxAttributes → opening);
  // 別的元素上叫 tabsSlot 的屬性不是合法位置。
  const isOwnTabsSlot = (node, headerOpening) => (
    ts.isJsxAttribute(node)
    && node.name.getText(sourceFile) === 'tabsSlot'
    && node.parent?.parent === headerOpening
  )
  // 掃 header 底下(不進巢狀 header —— 它自己判)找 Tabs;skipSlot = true 時跳過 header 自己的 tabsSlot 值。
  const findTabs = (header, headerOpening, skipSlot) => {
    let found = false
    const visit = (node) => {
      if (found) return
      if (skipSlot && isOwnTabsSlot(node, headerOpening)) return
      const opening = openingOf(node)
      if (opening && isHeader(opening)) return
      if (opening && isTabs(opening)) { found = true; return }
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(header, visit)
    return found
  }

  let applicable = 0
  let violations = 0
  const visit = (node) => {
    const opening = openingOf(node)
    if (opening && isHeader(opening) && findTabs(node, opening, false)) {
      applicable += 1
      if (findTabs(node, opening, true)) violations += 1
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
  // 正向「這一份畫在 Menu 浮層裡」條件(2026-10-15 起;app-shell.spec.md 兩條「浮層精修」= 只補在浮層那一份,
  // sidebar.spec.md「同一份內容、畫兩份」):`useSidebarSurface() === 'overlay'`(或反過來寫),或檔內 const 識別字、
  // 初始值就是這個判斷式(或是 `useSidebarSurface()` 本身、再拿去比 'overlay')。只認內容、不認名字(M37)。
  // 不再豁免:2026-10-14 版的 `<x>.menu === 'overlay'`(讀整個 Menu 的 `useAppShell().display.menu`,兩份同時成立 →
  // 被蓋住的細列那一份也長出標頭,2026-10-15 r1b 複驗 F4)與「名叫 menuIsOverlay」(名字不保證內容);
  // 2026-10-14 前的 `isMobile`(768 斷點)隨斷點退場。
  const constInitializers = new Map()
  const indexConsts = (node) => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      const name = node.name.text
      constInitializers.set(name, constInitializers.has(name) ? null : node.initializer)
    }
    ts.forEachChild(node, indexConsts)
  }
  indexConsts(sourceFile)
  const constValue = (node) => {
    const current = unwrap(node)
    return ts.isIdentifier(current) ? constInitializers.get(current.text) ?? null : null
  }
  const isOverlayLiteral = (node) => ts.isStringLiteral(unwrap(node)) && unwrap(node).text === 'overlay'
  const isSurfaceCall = (node) => {
    const current = unwrap(node)
    if (!ts.isCallExpression(current)) return false
    const callee = unwrap(current.expression)
    return (ts.isIdentifier(callee) && callee.text === 'useSidebarSurface')
      || (ts.isPropertyAccessExpression(callee) && callee.name.text === 'useSidebarSurface')
  }
  const isSurfaceValue = (node) => {
    if (isSurfaceCall(node)) return true
    const init = constValue(node)
    return Boolean(init && isSurfaceCall(init))
  }
  const isSurfaceOverlayComparison = (node) => {
    const current = unwrap(node)
    return ts.isBinaryExpression(current)
      && current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
      && ((isSurfaceValue(current.left) && isOverlayLiteral(current.right)) || (isOverlayLiteral(current.left) && isSurfaceValue(current.right)))
  }
  const positiveMenuOverlay = (expression) => {
    if (isSurfaceOverlayComparison(expression)) return true
    const init = constValue(expression)
    return Boolean(init && isSurfaceOverlayComparison(init))
  }
  const isWithin = (node, container) => (
    node.pos >= container.pos && node.end <= container.end
  )
  const isNestedAppShell = (node) => {
    const opening = openingOf(node)
    return Boolean(opening && named(opening.tagName, 'AppShell'))
  }
  const menuOverlayGuarded = (node, boundary) => {
    for (let current = node.parent; current && current !== boundary; current = current.parent) {
      if (
        ts.isBinaryExpression(current)
        && current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        && positiveMenuOverlay(current.left)
        && isWithin(node, current.right)
      ) return true
      if (
        ts.isConditionalExpression(current)
        && positiveMenuOverlay(current.condition)
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
          && !menuOverlayGuarded(node, appShell)
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

// FileItem 清單的外層(list wrapper)—— `check_item_list_gap.sh` 的量法。
// SSOT:components/FileItem/file-item.spec.md「List wrapper canonical」(gap 表)+「List wrapper 本身不加視覺」;
// 規則的原理在 patterns/element-anatomy/item-anatomy.spec.md「連續 item 貼邊合法性」(原 meta-patterns M16)。
// 外層 = FileItem 往上第一個 JSX 元素;中間只穿過 `{…}`、括號、條件式、`&&`、Fragment 與 `.map` / `.flatMap` 的 callback
// (穿過 callback = 這一筆會重複出現)。FileItem 寫在別的函式裡(例:renderRow 再被呼叫)→ 認不出外層,不判。
// 每個外層各自判,一行一筆:I = 認出的外層、E = 該外層有豁免標記、V = 違規(hook 只看 V);外層開頭那一行或緊接上一行有
// `@item-list-gap-allow: <理由>` → 只放行這一個外層;檔頭 leading line comment 同一標記 → 整檔放行。
function analyzeItemListGap() {
  if (hasLeadingLineEscape('item-list-gap-allow')) {
    process.stdout.write('ESCAPE')
    return
  }

  const lines = source.split('\n')
  const lineOf = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line
  const tagName = (opening) => {
    const text = opening.tagName.getText(sourceFile)
    return text.includes('.') ? text.slice(text.lastIndexOf('.') + 1) : text
  }
  const isFileItem = (opening) => tagName(opening) === 'FileItem'
  const isFragmentTag = (opening) => tagName(opening) === 'Fragment'
  const unwrap = (expression) => {
    let current = expression
    while (
      ts.isParenthesizedExpression(current)
      || ts.isAsExpression(current)
      || ts.isNonNullExpression(current)
      || ts.isSatisfiesExpression(current)
    ) current = current.expression
    return current
  }

  // 一個 JSX 元素底下「直接」排列的 FileItem(穿過透明的運算式節點,不進其他 JSX 元素)。
  const collect = (node, repeated, out) => {
    if (!node) return
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = openingOf(node)
      if (isFileItem(opening)) { out.push({ opening, repeated }); return }
      if (ts.isJsxElement(node) && isFragmentTag(opening)) {
        for (const child of node.children) collect(child, repeated, out)
      }
      return
    }
    if (ts.isJsxFragment(node)) {
      for (const child of node.children) collect(child, repeated, out)
      return
    }
    if (ts.isJsxExpression(node)) { collect(node.expression, repeated, out); return }
    const current = unwrap(node)
    if (current !== node) { collect(current, repeated, out); return }
    if (ts.isConditionalExpression(node)) {
      collect(node.whenTrue, repeated, out)
      collect(node.whenFalse, repeated, out)
      return
    }
    if (ts.isBinaryExpression(node)) {
      const kind = node.operatorToken.kind
      if (kind === ts.SyntaxKind.AmpersandAmpersandToken) collect(node.right, repeated, out)
      else if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken) {
        collect(node.left, repeated, out)
        collect(node.right, repeated, out)
      }
      return
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) collect(element, repeated, out)
      return
    }
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ['map', 'flatMap'].includes(node.expression.name.text)
    ) {
      const callback = node.arguments[0] && unwrap(node.arguments[0])
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        if (ts.isBlock(callback.body)) {
          const visitReturns = (statement) => {
            if (ts.isReturnStatement(statement)) { collect(statement.expression, true, out); return }
            if (ts.isFunctionLike(statement)) return
            ts.forEachChild(statement, visitReturns)
          }
          ts.forEachChild(callback.body, visitReturns)
        } else {
          collect(callback.body, true, out)
        }
      }
    }
  }

  const constInitializers = new Map()
  const indexConsts = (node) => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      const name = node.name.text
      constInitializers.set(name, constInitializers.has(name) ? null : node.initializer)
    }
    ts.forEachChild(node, indexConsts)
  }
  indexConsts(sourceFile)

  // className 能靜態讀出的字串片段(字串、template、cn(…) 引數、條件式兩邊、`&&` 右邊、檔內 const)。
  // 讀不出的部分 = 不知道;不知道就不判 gap(不猜)。
  const fragments = (expression, seen) => {
    const current = unwrap(expression)
    if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
      return { known: true, values: [current.text] }
    }
    if (ts.isTemplateExpression(current)) {
      const parts = [current.head.text]
      let known = true
      for (const span of current.templateSpans) {
        const inner = fragments(span.expression, seen)
        known = known && inner.known
        parts.push(...inner.values, span.literal.text)
      }
      return { known, values: parts }
    }
    if (ts.isIdentifier(current)) {
      const init = constInitializers.get(current.text)
      if (init && !seen.has(current.text)) {
        const nextSeen = new Set(seen)
        nextSeen.add(current.text)
        return fragments(init, nextSeen)
      }
      return { known: false, values: [] }
    }
    if (ts.isConditionalExpression(current)) {
      const a = fragments(current.whenTrue, seen)
      const b = fragments(current.whenFalse, seen)
      return { known: a.known && b.known, values: [...a.values, ...b.values] }
    }
    if (ts.isBinaryExpression(current)) {
      const kind = current.operatorToken.kind
      if (kind === ts.SyntaxKind.AmpersandAmpersandToken) return fragments(current.right, seen)
      if (kind === ts.SyntaxKind.PlusToken || kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken) {
        const a = fragments(current.left, seen)
        const b = fragments(current.right, seen)
        return { known: a.known && b.known, values: [...a.values, ...b.values] }
      }
      return { known: false, values: [] }
    }
    if (ts.isCallExpression(current)) {
      let known = true
      const values = []
      for (const argument of current.arguments) {
        const inner = fragments(argument, seen)
        known = known && inner.known
        values.push(...inner.values)
      }
      return { known, values }
    }
    if (ts.isArrayLiteralExpression(current)) {
      let known = true
      const values = []
      for (const element of current.elements) {
        const inner = fragments(element, seen)
        known = known && inner.known
        values.push(...inner.values)
      }
      return { known, values }
    }
    if (
      current.kind === ts.SyntaxKind.FalseKeyword
      || current.kind === ts.SyntaxKind.NullKeyword
      || (ts.isIdentifier(current) && current.text === 'undefined')
    ) return { known: true, values: [] }
    return { known: false, values: [] }
  }

  // 最後一個同名屬性生效;它之後(或沒有它時)有 spread → 不知道。
  const effectiveAttribute = (opening, name) => {
    const properties = opening.attributes.properties
    for (let index = properties.length - 1; index >= 0; index -= 1) {
      const item = properties[index]
      if (ts.isJsxSpreadAttribute(item)) return { known: false, item: null }
      if (ts.isJsxAttribute(item) && item.name.getText(sourceFile) === name) return { known: true, item }
    }
    return { known: true, item: null }
  }
  const attributeFragments = (opening, name) => {
    const resolved = effectiveAttribute(opening, name)
    if (!resolved.known) return { known: false, values: [] }
    if (!resolved.item) return { known: true, values: [], absent: true }
    const init = resolved.item.initializer
    if (!init) return { known: false, values: [] }
    if (ts.isStringLiteral(init)) return { known: true, values: [init.text] }
    if (ts.isJsxExpression(init) && init.expression) return fragments(init.expression, new Set())
    return { known: false, values: [] }
  }
  // FileItem 的 mode / surface:沒寫 = 預設(file-item.tsx:mode='compact'、surface='form');
  // 讀不出(變數、spread 蓋過)= null。
  const literalProp = (opening, name, fallback) => {
    const resolved = effectiveAttribute(opening, name)
    if (resolved.known && !resolved.item) {
      // 沒有這個屬性:前面有 spread 也可能帶進來 → 不知道
      const hasSpread = opening.attributes.properties.some((item) => ts.isJsxSpreadAttribute(item))
      return hasSpread ? null : fallback
    }
    const read = attributeFragments(opening, name)
    if (!read.known || read.values.length !== 1) return null
    return read.values[0]
  }

  const baseOf = (token) => {
    const bracket = token.indexOf('[')
    const head = bracket < 0 ? token : token.slice(0, bracket)
    const colon = head.lastIndexOf(':')
    const base = colon < 0 ? token : token.slice(colon + 1)
    return base.replace(/^!/, '').replace(/!$/, '')
  }
  const isFrame = (base) => (
    base === 'border'
    || /^border-(?:[xytblrse](?:-\d+)?|[1-9]\d*)$/.test(base)
    || (/^rounded(?:-|$)/.test(base) && base !== 'rounded-none')
    || base === 'overflow-hidden'
  )
  // 垂直間距(px);gap-x 是橫向,不算。讀不出值的(var(…))記 'var'。
  const gapValue = (base) => {
    let match = base.match(/^(?:gap|gap-y|space-y)-(\d+(?:\.\d+)?)$/)
    if (match) return Number(match[1]) * 4
    if (/^(?:gap|gap-y|space-y)-px$/.test(base)) return 1
    match = base.match(/^(?:gap|gap-y|space-y)-\[(\d+(?:\.\d+)?)(px|rem)\]$/)
    if (match) return match[2] === 'rem' ? Number(match[1]) * 16 : Number(match[1])
    if (/^(?:gap|gap-y|space-y)-\[/.test(base)) return 'var'
    return null
  }
  // 冒號後要有理由:拿掉註解收尾(`*/`、`*/}`)後還有字才算
  const hasReason = (text) => {
    const match = (text || '').match(/@item-list-gap-allow:(.*)$/)
    return Boolean(match && match[1].replace(/\*\/\s*\}?\s*$/, '').trim())
  }
  const escapedAt = (lineIndex) => {
    if (hasReason(lines[lineIndex])) return true
    const previous = (lines[lineIndex - 1] || '').trim()
    return /^(?:\/\/|\{\s*\/\*|\/\*)/.test(previous) && hasReason(previous)
  }
  const PX_TO_CLASS = { 4: 'gap-1', 8: 'gap-2' }

  const results = []
  const visit = (node) => {
    if (ts.isJsxElement(node)) {
      const opening = node.openingElement
      if (!isFileItem(opening) && !isFragmentTag(opening)) {
        const items = []
        for (const child of node.children) collect(child, false, items)
        const weight = items.reduce((sum, item) => sum + (item.repeated ? 2 : 1), 0)
        if (weight >= 2) inspect(node, opening, items)
      }
    }
    ts.forEachChild(node, visit)
  }

  const inspect = (node, opening, items) => {
    const lineIndex = lineOf(opening)
    if (escapedAt(lineIndex)) {
      results.push(`E\t${lineIndex + 1}\t${tagName(opening)}`)
      return
    }
    // 每個認出來的外層都記一行 I(量具真的有在量的證據;hook 只看 V)
    results.push(`I\t${lineIndex + 1}\t${tagName(opening)}`)
    const className = attributeFragments(opening, 'className')
    const isDomTag = /^[a-z]/.test(opening.tagName.getText(sourceFile))
    // 元件當外層又沒給 className:版面由元件自己決定,這裡讀不到 → 不判
    if (!className.known || (className.absent && !isDomTag)) return
    const tokens = className.values.flatMap((value) => value.split(/\s+/)).filter(Boolean)
    const bases = tokens.map(baseOf)
    const key = (kind) => `${kind}|${opening.getText(sourceFile).replace(/\s+/g, ' ')}`
    const where = `${lineIndex + 1}\t${tagName(opening)}`

    const frame = [...new Set(bases.filter(isFrame))]
    if (frame.length) {
      results.push(`V\t${where}\tframe\t${frame.join(' ')}\t${key('frame')}`)
    }

    const surfaces = items.map((item) => literalProp(item.opening, 'surface', 'form'))
    const modes = items.map((item) => literalProp(item.opening, 'mode', 'compact'))
    if (surfaces.some((value) => value !== 'form' && value !== 'upload-manager')) return
    const values = bases.map(gapValue).filter((value) => value !== null)
    if (surfaces.every((value) => value === 'upload-manager')) {
      const positive = values.filter((value) => value === 'var' || value > 0)
      if (positive.length) {
        results.push(`V\t${where}\tgap\tupload-manager 列間要 gap-0(有 ${positive.join('/')}px)\t${key('gap-um')}`)
      }
      return
    }
    if (!surfaces.every((value) => value === 'form')) return
    // 混合 → 取最保守(item-anatomy.spec.md 公式 3);讀不出 mode 的 → rich 8 或 compact 4 都接受
    const knownModes = modes.filter((value) => value === 'rich' || value === 'compact')
    const unknownMode = modes.some((value) => value !== 'rich' && value !== 'compact')
    let required
    if (knownModes.includes('rich')) required = [8]
    else if (unknownMode) required = [4, 8]
    else required = [4]
    if (!values.some((value) => required.includes(value))) {
      const want = required.map((px) => `${PX_TO_CLASS[px]}(${px}px)`).join(' 或 ')
      const have = values.length ? values.map((value) => `${value}px`).join('/') : '沒有 gap'
      results.push(`V\t${where}\tgap\t要 ${want},現在 ${have}\t${key('gap-form')}`)
    }
  }

  visit(sourceFile)
  process.stdout.write(results.length ? `${results.join('\n')}\n` : '')
}

if (mode === 'header-with-tabs-border') analyzeHeaderWithTabsBorder()
else if (mode === 'app-shell-primary-header') analyzeAppShellPrimaryHeader()
else if (mode === 'item-list-gap') analyzeItemListGap()
else analyzeChromeHeaderHandcraft()

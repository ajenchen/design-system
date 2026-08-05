#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const expected = new Map([
  ['packages/design-system/src/patterns/element-anatomy/item-anatomy.stories.tsx', ['InlineActionHoverState']],
  ['packages/design-system/src/components/FileUpload/file-upload.stories.tsx', ['RemoveHoverState', 'FileListRemoveFocusContract']],
  ['packages/design-system/src/components/PeoplePicker/people-picker.stories.tsx', ['MultiRemoveFocusContract', 'StackRemoveOverlayProbe']],
  ['packages/design-system/src/components/TreeView/tree-view.stories.tsx', ['ActionHoverState']],
  ['packages/design-system/src/components/DropdownMenu/dropdown-menu.stories.tsx', ['OpenSnapshot', 'ItemHover']],
  ['packages/design-system/src/components/Sidebar/sidebar.stories.tsx', ['ActionHoverState']],
  ['packages/design-system/src/components/FileViewer/file-viewer.stories.tsx', ['OpenSnapshot']],
  ['packages/design-system/src/components/Popover/popover.stories.tsx', ['OpenSnapshot']],
  ['packages/design-system/src/components/DataTable/data-table.stories.tsx', ['NestedRowsExpanderHoverState', 'RoadmapPerfBudget']],
  ['packages/design-system/src/components/Dialog/dialog.stories.tsx', ['OpenSnapshot']],
  ['packages/design-system/src/components/Tag/tag.stories.tsx', ['DismissHoverState']],
  ['packages/design-system/src/components/Button/button.stories.tsx', ['DismissHoverState', 'HoverFocusState', 'TooltipVisible']],
  ['packages/design-system/src/components/Sheet/sheet.stories.tsx', ['OpenSnapshot']],
  ['apps/template/src/AllDsComponents.stories.tsx', ['ImportSmoke']],
  ['apps/template/src/CompositionFidelityReplica.stories.tsx', ['IconOnlyReplica']],
])

function unwrap(node) {
  let current = node
  while (current && (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current))) current = current.expression
  return current
}

function propertyName(node) {
  return node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) ? node.name.text : null
}

function exportedStoryTags(file) {
  const source = readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const result = new Map()
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !statement.modifiers?.some(item => item.kind === ts.SyntaxKind.ExportKeyword)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue
      const object = unwrap(declaration.initializer)
      if (!object || !ts.isObjectLiteralExpression(object)) continue
      const tagsProperty = object.properties.find(item => ts.isPropertyAssignment(item) && propertyName(item) === 'tags')
      const tagsArray = tagsProperty && unwrap(tagsProperty.initializer)
      const tags = tagsArray && ts.isArrayLiteralExpression(tagsArray)
        ? tagsArray.elements.filter(ts.isStringLiteral).map(item => item.text)
        : []
      result.set(declaration.name.text, tags)
    }
  }
  return { source, stories: result }
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (path.endsWith('.stories.tsx')) yield path
  }
}

const failures = []
let expectedCount = 0
for (const [relativeFile, exports] of expected) {
  const file = join(root, relativeFile)
  const { stories } = exportedStoryTags(file)
  for (const exportName of exports) {
    expectedCount += 1
    const tags = stories.get(exportName)
    if (!tags) failures.push(`${relativeFile}#${exportName}: export missing`)
    else if (JSON.stringify(tags) !== JSON.stringify(['test-only'])) {
      failures.push(`${relativeFile}#${exportName}: tags=${JSON.stringify(tags)}; expected ["test-only"]`)
    }
  }
}

for (const directory of ['packages/design-system/src', 'apps/template/src']) {
  for (const file of walk(join(root, directory))) {
    const { source, stories } = exportedStoryTags(file)
    if (/tags:\s*\[[^\]]*['"]!autodocs['"]/.test(source)) {
      failures.push(`${relative(root, file)}: !autodocs must not hide technical probes`)
    }
    for (const [exportName, tags] of stories) {
      if (tags.includes('test-only') && tags.some(tag => tag === '!dev' || tag === '!test')) {
        failures.push(`${relative(root, file)}#${exportName}: test-only story removed from index/test runner`)
      }
    }
  }
}

const appStory = readFileSync(join(root, 'apps/template/src/App.stories.tsx'), 'utf8')
if (/tags:\s*\[[^\]]*['"]autodocs['"]/.test(appStory)) failures.push('App.stories.tsx: template category must keep autodocs disabled')

const allComponents = readFileSync(join(root, 'apps/template/src/AllDsComponents.stories.tsx'), 'utf8')
if (/62\/62/.test(allComponents)) failures.push('AllDsComponents.stories.tsx: stale hard-coded component count remains')

const preview = readFileSync(join(root, 'packages/storybook-config/preview.tsx'), 'utf8')
if (!/stories:\s*\{[\s\S]*filter:[\s\S]*!story\.tags\?\.includes\('test-only'\)/.test(preview)) {
  failures.push('shared preview: Autodocs test-only filter missing')
}

const manager = readFileSync(join(root, 'packages/storybook-config/addons/ds-devmode/manager.tsx'), 'utf8')
if (!/sidebar:\s*\{[\s\S]*filters:[\s\S]*!item\.tags\?\.includes\('test-only'\)/.test(manager)) {
  failures.push('shared manager: sidebar test-only filter missing')
}

if (failures.length) {
  console.error(`Storybook test-only semantics FAIL (${failures.length})`)
  failures.forEach(failure => console.error(`  - ${failure}`))
  process.exit(1)
}

console.log(`Storybook test-only semantics PASS (${expectedCount} technical probes keep index/direct URLs; hidden from sidebar + Autodocs)`)

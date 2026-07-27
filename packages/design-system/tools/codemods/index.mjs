import { lstatSync, readdirSync } from 'node:fs'
import { extname, relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import {
  SHA256_PATTERN,
  applyAtomicOperations,
  canonicalRoot,
  compareUtf8Bytes,
  exactKeys,
  portablePath,
  readStableFile,
  sha256,
  stableStringify,
} from '../shared/safe-filesystem.mjs'

export const CODEMOD_TOOL_VERSION = '1.0.0'
export const BETA_84_MIGRATION_ID = 'beta.84-breaking-api'
const PROPOSAL_KIND = 'qijenchen-design-system-codemod-proposal'
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.mts', '.cjs', '.cts'])
const EXCLUDED_DIRECTORIES = new Set([
  '.git', '.next', '.parcel-cache', '.turbo', '.visual-candidates', 'build', 'coverage', 'dist',
  'node_modules', 'storybook-static', 'tmp',
])
const COMPONENT_RULES = Object.freeze({
  BulkActionBar: { old: 'onClear', next: 'onClearSelection', rule: 'bulk-action-bar-on-clear-selection' },
  ButtonGroup: { old: 'direction', next: 'orientation', rule: 'button-group-orientation' },
  DescriptionList: { old: 'direction', next: 'orientation', rule: 'description-list-orientation' },
})
const FIELD_CONTROLS = new Set([
  'Checkbox', 'Combobox', 'DatePicker', 'DatePickerRange', 'Field', 'Input', 'LinkInput',
  'NumberInput', 'PeoplePicker', 'RadioGroup', 'Select', 'Switch', 'Textarea', 'TimePicker',
])
const RELEVANT_COMPONENTS = new Set([...Object.keys(COMPONENT_RULES), ...FIELD_CONTROLS, 'DataTable'])
const fatalUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })

function fail(message) {
  throw new Error(`design-system codemod blocked:${message}`)
}

function dsModule(value) {
  return value === '@qijenchen/design-system' || value.startsWith('@qijenchen/design-system/components/')
}

function scriptKind(path) {
  const extension = extname(path).toLowerCase()
  if (extension === '.tsx') return ts.ScriptKind.TSX
  if (extension === '.jsx') return ts.ScriptKind.JSX
  if (['.js', '.mjs', '.cjs'].includes(extension)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function location(sourceFile, position) {
  const value = sourceFile.getLineAndCharacterOfPosition(position)
  return { line: value.line + 1, column: value.character + 1 }
}

function scanSourceFiles(root, sourceRoots) {
  const found = []
  const visit = (relativePath) => {
    const absolute = resolve(root, relativePath)
    const entries = readdirSync(absolute, { withFileTypes: true })
      .sort((a, b) => compareUtf8Bytes(a.name, b.name))
    for (const entry of entries) {
      const child = relativePath === '.' ? entry.name : `${relativePath}/${entry.name}`
      if (entry.isSymbolicLink()) fail(`source traversal crosses a symbolic link:${child}`)
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) visit(child)
        continue
      }
      if (!entry.isFile()) fail(`source traversal found an unsupported filesystem entry:${child}`)
      if (SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) found.push(child)
    }
  }
  for (const sourceRoot of sourceRoots) {
    const read = readStableFileOrDirectory(root, sourceRoot)
    if (read === 'directory') visit(sourceRoot)
    else if (SOURCE_EXTENSIONS.has(extname(sourceRoot).toLowerCase())) found.push(sourceRoot)
    else fail(`source root file has an unsupported extension:${sourceRoot}`)
  }
  return [...new Set(found)].sort(compareUtf8Bytes)
}

function readStableFileOrDirectory(root, relativePath) {
  const absolute = resolve(root, relativePath)
  const rel = relative(root, absolute)
  if (rel === '..' || rel.startsWith(`..${sep}`)) fail(`source root escapes repository:${relativePath}`)
  let cursor = root
  // Keep filesystem authority in the shared reader for files; directory topology is checked here.
  for (const segment of rel.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment)
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) fail(`source root crosses a symbolic link:${relativePath}`)
    if (cursor !== absolute && !info.isDirectory()) fail(`source root crosses a non-directory:${relativePath}`)
  }
  const info = lstatSync(absolute)
  if (info.isDirectory()) return 'directory'
  if (info.isFile() && info.nlink === 1) return 'file'
  fail(`source root must be a real directory or single-link regular file:${relativePath}`)
}

function renameLocations(fileName, source, position) {
  const snapshots = new Map([[fileName, ts.ScriptSnapshot.fromString(source)]])
  const host = {
    getCompilationSettings: () => ({
      allowJs: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ESNext,
    }),
    getScriptFileNames: () => [fileName],
    getScriptVersion: () => '1',
    getScriptSnapshot: (path) => {
      if (snapshots.has(path)) return snapshots.get(path)
      const body = ts.sys.readFile(path)
      return body === undefined ? undefined : ts.ScriptSnapshot.fromString(body)
    },
    getCurrentDirectory: () => process.cwd(),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  }
  const service = ts.createLanguageService(host)
  try {
    return service.findRenameLocations(fileName, position, false, false, true) ?? []
  } finally {
    service.dispose()
  }
}

function analyzeFile({ root, path, read }) {
  let source
  try {
    source = fatalUtf8.decode(read.bytes)
  } catch (error) {
    return { edits: [], blockers: [{ path, line: 1, column: 1, rule: 'utf8-source-required', message: error.message }] }
  }
  const absolute = resolve(root, path)
  const sourceFile = ts.createSourceFile(absolute, source, ts.ScriptTarget.Latest, true, scriptKind(path))
  const edits = []
  const blockers = []
  const directBindings = new Map()
  const namespaces = new Set()
  const unaliasedTypeImports = []
  const coveredOldTypePositions = new Set()

  const addBlocker = (node, rule, message) => {
    const position = node?.getStart?.(sourceFile) ?? 0
    blockers.push({ path, ...location(sourceFile, position), rule, message })
  }
  const addEdit = (start, end, from, to, rule) => {
    if (source.slice(start, end) !== from) fail(`${path}: AST token changed while planning ${rule}`)
    edits.push({ start, end, ...location(sourceFile, start), from, to, rule })
  }

  if (sourceFile.parseDiagnostics.length) {
    for (const diagnostic of sourceFile.parseDiagnostics) {
      addBlocker({ getStart: () => diagnostic.start ?? 0 }, 'syntax-error', ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '))
    }
    return { edits: [], blockers }
  }

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && dsModule(statement.moduleSpecifier.text)) {
      const clause = statement.importClause
      if (!clause) continue
      if (clause.name) addBlocker(clause.name, 'unsupported-default-import', 'the design-system package has no migration-safe default component binding')
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) namespaces.add(clause.namedBindings.name.text)
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const specifier of clause.namedBindings.elements) {
          const imported = (specifier.propertyName ?? specifier.name).text
          const local = specifier.name.text
          if (RELEVANT_COMPONENTS.has(imported)) directBindings.set(local, imported)
          if (imported !== 'DescriptionDirection') continue
          if (specifier.propertyName) {
            const start = specifier.propertyName.getStart(sourceFile)
            addEdit(start, start + 'DescriptionDirection'.length, 'DescriptionDirection', 'DescriptionListOrientation', 'description-direction-type')
            coveredOldTypePositions.add(start)
          } else {
            unaliasedTypeImports.push(specifier.name)
          }
        }
      }
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)
      && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) && dsModule(statement.moduleSpecifier.text)) {
      for (const specifier of statement.exportClause.elements) {
        const exported = (specifier.propertyName ?? specifier.name).text
        if (exported !== 'DescriptionDirection') continue
        const token = specifier.propertyName ?? specifier.name
        const start = token.getStart(sourceFile)
        addEdit(start, start + 'DescriptionDirection'.length, 'DescriptionDirection', 'DescriptionListOrientation', 'description-direction-type')
        coveredOldTypePositions.add(start)
      }
    }
  }

  if (unaliasedTypeImports.length > 1) {
    unaliasedTypeImports.forEach((node) => addBlocker(node, 'ambiguous-type-binding', 'multiple unaliased DescriptionDirection imports cannot be renamed safely'))
  } else if (unaliasedTypeImports.length === 1) {
    const node = unaliasedTypeImports[0]
    const conflicts = []
    const findNewName = (candidate) => {
      if (ts.isIdentifier(candidate) && candidate.text === 'DescriptionListOrientation') conflicts.push(candidate)
      ts.forEachChild(candidate, findNewName)
    }
    findNewName(sourceFile)
    if (conflicts.length) {
      addBlocker(node, 'type-name-conflict', 'DescriptionListOrientation already exists in this file; choose the local rename manually')
    } else {
      const locations = renameLocations(absolute, source, node.getStart(sourceFile))
        .filter((row) => row.fileName === absolute)
      if (!locations.length) addBlocker(node, 'ambiguous-type-binding', 'TypeScript could not prove the DescriptionDirection binding closure')
      for (const row of locations) {
        const { start, length } = row.textSpan
        if (source.slice(start, start + length) !== 'DescriptionDirection') {
          addBlocker(node, 'ambiguous-type-binding', 'TypeScript returned a non-exact DescriptionDirection rename token')
          continue
        }
        addEdit(start, start + length, 'DescriptionDirection', 'DescriptionListOrientation', 'description-direction-type')
        coveredOldTypePositions.add(start)
      }
    }
  }

  const jsxCanonical = (tag) => {
    if (ts.isIdentifier(tag)) return directBindings.get(tag.text) ?? null
    if (ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.expression) && namespaces.has(tag.expression.text)) {
      return RELEVANT_COMPONENTS.has(tag.name.text) ? tag.name.text : null
    }
    return null
  }
  const jsxLooksRelevant = (tag) => {
    if (ts.isIdentifier(tag)) return RELEVANT_COMPONENTS.has(tag.text)
    return ts.isPropertyAccessExpression(tag) && RELEVANT_COMPONENTS.has(tag.name.text)
  }
  const attributeByName = (attributes, name) => attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.text === name)
  const spreadAttribute = (attributes) => attributes.properties.find((item) => ts.isJsxSpreadAttribute(item))
  const literalDisplay = (initializer) => {
    if (!initializer) return null
    if (ts.isStringLiteral(initializer) && initializer.text === 'display') return initializer
    if (ts.isJsxExpression(initializer) && initializer.expression && ts.isStringLiteral(initializer.expression)
      && initializer.expression.text === 'display') return initializer.expression
    return null
  }
  const isCreateElementCall = (node) => {
    if (!ts.isCallExpression(node)) return false
    const callee = node.expression
    return (ts.isIdentifier(callee) && callee.text === 'createElement')
      || (ts.isPropertyAccessExpression(callee) && callee.name.text === 'createElement')
  }
  const isDirectRenderPosition = (node) => {
    const parent = node.parent
    if ((ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxClosingElement(parent))
      && parent.tagName === node) return true
    return isCreateElementCall(parent) && parent.arguments[0] === node
  }

  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const canonical = jsxCanonical(node.tagName)
      const attributes = node.attributes
      const rule = canonical ? COMPONENT_RULES[canonical] : null
      const spread = spreadAttribute(attributes)
      if (canonical && spread) {
        addBlocker(spread, 'component-props-spread-manual', `${canonical} JSX spread props may hide a beta.84 legacy API and require manual review`)
      }
      if (rule) {
        const legacy = attributeByName(attributes, rule.old)
        const next = attributeByName(attributes, rule.next)
        if (legacy && next) addBlocker(legacy, `${rule.rule}-conflict`, `both ${rule.old} and ${rule.next} are present`)
        else if (legacy) {
          const start = legacy.name.getStart(sourceFile)
          addEdit(start, start + rule.old.length, rule.old, rule.next, rule.rule)
        }
      }
      if (canonical && FIELD_CONTROLS.has(canonical)) {
        const mode = attributeByName(attributes, 'mode')
        const display = literalDisplay(mode?.initializer)
        if (display) {
          const start = display.getStart(sourceFile) + 1
          addEdit(start, start + 'display'.length, 'display', 'view', 'field-mode-view')
        } else if (mode?.initializer && /(?:^|[^A-Za-z])display(?:[^A-Za-z]|$)/.test(mode.initializer.getText(sourceFile))) {
          addBlocker(mode, 'field-mode-dynamic', 'a dynamic mode expression mentions display and requires manual semantic review')
        }
      }
      if (!canonical && jsxLooksRelevant(node.tagName)) {
        const possibleLegacy = [
          attributeByName(attributes, 'onClear'),
          attributeByName(attributes, 'direction'),
          attributeByName(attributes, 'mode'),
        ].filter(Boolean)
        if (possibleLegacy.length || spread) {
          addBlocker(node.tagName, 'unresolved-component-binding', 'legacy-looking JSX is not directly bound to @qijenchen/design-system; migrate the wrapper manually')
        }
      }
    }
    if (ts.isCallExpression(node)) {
      const canonical = isCreateElementCall(node) && node.arguments[0] ? jsxCanonical(node.arguments[0]) : null
      const props = canonical ? node.arguments[1] : null
      if (canonical && props && props.kind !== ts.SyntaxKind.NullKeyword) {
        if (!ts.isObjectLiteralExpression(props)) {
          addBlocker(props, 'react-create-element-props-manual', `${canonical} React.createElement props are dynamic and may hide a beta.84 legacy API`)
        } else {
          const relevantNames = new Set([
            ...(COMPONENT_RULES[canonical] ? [COMPONENT_RULES[canonical].old] : []),
            ...(FIELD_CONTROLS.has(canonical) ? ['mode'] : []),
          ])
          const legacy = props.properties.find((property) => {
            if (ts.isSpreadAssignment(property)) return true
            const name = property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
              ? property.name.text
              : null
            if (!relevantNames.has(name)) return false
            if (name !== 'mode') return true
            return !ts.isPropertyAssignment(property)
              || /(?:^|[^A-Za-z])display(?:[^A-Za-z]|$)/.test(property.initializer.getText(sourceFile))
          })
          if (legacy) {
            addBlocker(legacy, 'react-create-element-props-manual', `${canonical} React.createElement legacy/spread props are outside the safe JSX token transform`)
          }
        }
      }
    }
    if (ts.isIdentifier(node) && directBindings.has(node.text)) {
      const parent = node.parent
      const importBinding = ts.isImportSpecifier(parent)
      if (!importBinding && !isDirectRenderPosition(node)) {
        addBlocker(node, 'component-binding-escape-manual', `${node.text} escapes its direct design-system component binding; aliases/wrappers require manual migration review`)
      }
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && namespaces.has(node.expression.text)
      && RELEVANT_COMPONENTS.has(node.name.text) && !isDirectRenderPosition(node)) {
      addBlocker(node, 'component-binding-escape-manual', `${node.getText(sourceFile)} escapes its design-system namespace render binding; aliases/wrappers require manual migration review`)
    }
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && namespaces.has(node.expression.text)) {
      const member = node.argumentExpression && ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : null
      if (member === null || RELEVANT_COMPONENTS.has(member)) {
        addBlocker(node, 'component-binding-escape-manual', `${node.getText(sourceFile)} uses computed design-system component access; migrate the alias/wrapper manually`)
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)
      && node.initializer && ts.isIdentifier(node.initializer) && namespaces.has(node.initializer.text)) {
      for (const element of node.name.elements) {
        const member = element.propertyName && (ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName))
          ? element.propertyName.text
          : ts.isIdentifier(element.name) ? element.name.text : null
        if (member === null || RELEVANT_COMPONENTS.has(member)) {
          addBlocker(element, 'component-binding-escape-manual', `${node.initializer.text} component destructuring escapes direct migration binding; migrate the alias/wrapper manually`)
        }
      }
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'DescriptionDirection'
      && ts.isIdentifier(node.expression) && namespaces.has(node.expression.text)) {
      const start = node.name.getStart(sourceFile)
      addEdit(start, start + 'DescriptionDirection'.length, 'DescriptionDirection', 'DescriptionListOrientation', 'description-direction-type')
      coveredOldTypePositions.add(start)
    }
    if (ts.isQualifiedName(node) && node.right.text === 'DescriptionDirection'
      && ts.isIdentifier(node.left) && namespaces.has(node.left.text)) {
      const start = node.right.getStart(sourceFile)
      addEdit(start, start + 'DescriptionDirection'.length, 'DescriptionDirection', 'DescriptionListOrientation', 'description-direction-type')
      coveredOldTypePositions.add(start)
    }
    if (ts.isIdentifier(node) && node.text === 'DescriptionDirection'
      && !coveredOldTypePositions.has(node.getStart(sourceFile))) {
      const parent = node.parent
      const safelyHandledImport = ts.isImportSpecifier(parent) && parent.propertyName === node
      const safelyHandledExport = ts.isExportSpecifier(parent) && (parent.propertyName ?? parent.name) === node
      if (!safelyHandledImport && !safelyHandledExport) {
        addBlocker(node, 'unresolved-type-binding', 'DescriptionDirection is not proven to come from a direct design-system import')
      }
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'disabled') {
      const expression = node.expression
      const meta = ts.isIdentifier(expression) ? expression.text === 'meta'
        : ts.isPropertyAccessExpression(expression) && expression.name.text === 'meta'
      if (meta) addBlocker(node, 'datatable-meta-disabled-manual', 'DataTable meta.disabled has no mechanically verifiable replacement; upgrade this column manually')
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(sourceFile) === 'meta' && ts.isObjectLiteralExpression(node.initializer)) {
      const disabled = node.initializer.properties.find((item) => item.name?.getText(sourceFile) === 'disabled')
      if (disabled) addBlocker(disabled, 'datatable-meta-disabled-manual', 'DataTable meta.disabled object metadata requires manual semantic review')
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  const uniqueEdits = [...new Map(edits.map((edit) => [`${edit.start}:${edit.end}:${edit.to}`, edit])).values()]
    .sort((a, b) => a.start - b.start || a.end - b.end)
  for (let index = 1; index < uniqueEdits.length; index += 1) {
    if (uniqueEdits[index].start < uniqueEdits[index - 1].end) {
      addBlocker({ getStart: () => uniqueEdits[index].start }, 'overlapping-transform', 'two transforms overlap and cannot be applied safely')
    }
  }
  if (blockers.length) return { edits: [], blockers }
  return { edits: uniqueEdits, blockers: [] }
}

function applyTextEdits(source, edits, path) {
  let output = source
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    if (output.slice(edit.start, edit.end) !== edit.from) fail(`${path}: planned token no longer matches ${edit.rule}`)
    output = `${output.slice(0, edit.start)}${edit.to}${output.slice(edit.end)}`
  }
  return output
}

export function codemodProposalDigest(proposal) {
  const projection = structuredClone(proposal)
  delete projection.proposalDigest
  return sha256(stableStringify(projection))
}

function compareBlockers(left, right) {
  return compareUtf8Bytes(left.path, right.path)
    || left.line - right.line
    || left.column - right.column
    || compareUtf8Bytes(left.rule, right.rule)
    || compareUtf8Bytes(left.message, right.message)
}

export function planCodemod({ repoRoot = process.cwd(), sourceRoots = ['.'], migrationId = BETA_84_MIGRATION_ID } = {}) {
  if (migrationId !== BETA_84_MIGRATION_ID) fail(`unknown migration:${migrationId}`)
  const root = canonicalRoot(repoRoot, 'codemod repository root', fail)
  const roots = [...new Set(sourceRoots.map((item) => item === '.' ? '.' : portablePath(item, 'codemod source root', fail)))]
    .sort(compareUtf8Bytes)
  const paths = scanSourceFiles(root, roots)
  const inventory = []
  const files = []
  const blockers = []
  for (const path of paths) {
    const read = readStableFile(root, path, `codemod source ${path}`, fail)
    inventory.push({ path, sha256: read.sha256, bytes: read.size, mode: read.mode })
    const result = analyzeFile({ root, path, read })
    blockers.push(...result.blockers)
    if (!result.edits.length) continue
    const source = fatalUtf8.decode(read.bytes)
    const output = applyTextEdits(source, result.edits, path)
    const bytes = Buffer.from(output, 'utf8')
    files.push({
      path,
      beforeSha256: read.sha256,
      afterSha256: sha256(bytes),
      beforeBytes: read.size,
      afterBytes: bytes.length,
      mode: read.mode,
      edits: result.edits,
    })
  }
  const proposal = {
    schemaVersion: 1,
    kind: PROPOSAL_KIND,
    toolVersion: CODEMOD_TOOL_VERSION,
    typescriptVersion: ts.version,
    migrationId,
    sourceRoots: roots,
    inventory,
    files,
    blockers: blockers.sort(compareBlockers),
    proposalDigest: '',
  }
  proposal.proposalDigest = codemodProposalDigest(proposal)
  validateCodemodProposal(proposal)
  return proposal
}

export function validateCodemodProposal(proposal) {
  exactKeys(proposal, ['schemaVersion', 'kind', 'toolVersion', 'typescriptVersion', 'migrationId', 'sourceRoots', 'inventory', 'files', 'blockers', 'proposalDigest'], 'codemod proposal', fail)
  if (proposal.schemaVersion !== 1 || proposal.kind !== PROPOSAL_KIND || proposal.toolVersion !== CODEMOD_TOOL_VERSION
    || proposal.typescriptVersion !== ts.version
    || proposal.migrationId !== BETA_84_MIGRATION_ID || !SHA256_PATTERN.test(proposal.proposalDigest)
    || proposal.proposalDigest !== codemodProposalDigest(proposal)) fail('codemod proposal identity or digest is invalid')
  if (!Array.isArray(proposal.sourceRoots) || !proposal.sourceRoots.length
    || stableStringify(proposal.sourceRoots) !== stableStringify([...new Set(proposal.sourceRoots)].sort(compareUtf8Bytes))) fail('codemod sourceRoots are not a sorted closed set')
  proposal.sourceRoots.forEach((path) => { if (path !== '.') portablePath(path, 'codemod sourceRoot', fail) })
  if (!Array.isArray(proposal.inventory) || !Array.isArray(proposal.files) || !Array.isArray(proposal.blockers)) fail('codemod proposal arrays are missing')
  const inventoryPaths = []
  for (const row of proposal.inventory) {
    exactKeys(row, ['path', 'sha256', 'bytes', 'mode'], 'codemod inventory row', fail)
    portablePath(row.path, 'codemod inventory path', fail)
    if (!SHA256_PATTERN.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 0
      || !Number.isInteger(row.mode) || row.mode < 0 || row.mode > 0o777) fail(`codemod inventory row is invalid:${row.path}`)
    inventoryPaths.push(row.path)
  }
  if (stableStringify(inventoryPaths) !== stableStringify([...new Set(inventoryPaths)].sort(compareUtf8Bytes))) fail('codemod inventory paths are not unique and sorted')
  const plannedPaths = []
  for (const row of proposal.files) {
    exactKeys(row, ['path', 'beforeSha256', 'afterSha256', 'beforeBytes', 'afterBytes', 'mode', 'edits'], 'codemod file row', fail)
    portablePath(row.path, 'codemod file path', fail)
    if (!inventoryPaths.includes(row.path) || !SHA256_PATTERN.test(row.beforeSha256) || !SHA256_PATTERN.test(row.afterSha256)
      || row.beforeSha256 === row.afterSha256 || !Number.isSafeInteger(row.beforeBytes) || row.beforeBytes < 0
      || !Number.isSafeInteger(row.afterBytes) || row.afterBytes < 0 || !Number.isInteger(row.mode)
      || !Array.isArray(row.edits) || !row.edits.length) fail(`codemod file row is invalid:${row.path}`)
    plannedPaths.push(row.path)
    let priorEnd = -1
    for (const edit of row.edits) {
      exactKeys(edit, ['start', 'end', 'line', 'column', 'from', 'to', 'rule'], 'codemod edit', fail)
      if (!Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end) || edit.start < priorEnd || edit.end <= edit.start
        || !Number.isSafeInteger(edit.line) || edit.line < 1 || !Number.isSafeInteger(edit.column) || edit.column < 1
        || typeof edit.from !== 'string' || !edit.from || typeof edit.to !== 'string' || !edit.to || typeof edit.rule !== 'string' || !edit.rule) {
        fail(`codemod edit is invalid:${row.path}`)
      }
      priorEnd = edit.end
    }
  }
  if (stableStringify(plannedPaths) !== stableStringify([...new Set(plannedPaths)].sort(compareUtf8Bytes))) fail('codemod file paths are not unique and sorted')
  for (const blocker of proposal.blockers) {
    exactKeys(blocker, ['path', 'line', 'column', 'rule', 'message'], 'codemod blocker', fail)
    portablePath(blocker.path, 'codemod blocker path', fail)
    if (!Number.isSafeInteger(blocker.line) || blocker.line < 1 || !Number.isSafeInteger(blocker.column) || blocker.column < 1
      || typeof blocker.rule !== 'string' || !blocker.rule || typeof blocker.message !== 'string' || !blocker.message) fail('codemod blocker is invalid')
  }
  if (stableStringify(proposal.blockers) !== stableStringify([...proposal.blockers].sort(compareBlockers))) {
    fail('codemod blockers are not canonically sorted')
  }
  return true
}

function currentCodemodState({ root, proposal }) {
  const actualPaths = scanSourceFiles(root, proposal.sourceRoots)
  const expectedPaths = proposal.inventory.map((row) => row.path)
  if (stableStringify(actualPaths) !== stableStringify(expectedPaths)) fail('codemod source inventory gained, lost, or renamed a file after planning')
  const planned = new Map(proposal.files.map((row) => [row.path, row]))
  const states = []
  for (const expected of proposal.inventory) {
    const read = readStableFile(root, expected.path, `codemod check ${expected.path}`, fail)
    const change = planned.get(expected.path)
    if (!change) {
      if (read.sha256 !== expected.sha256 || read.size !== expected.bytes || read.mode !== expected.mode) fail(`unplanned source changed after codemod planning:${expected.path}`)
      continue
    }
    if (read.sha256 === change.beforeSha256 && read.size === change.beforeBytes) states.push('pending')
    else if (read.sha256 === change.afterSha256 && read.size === change.afterBytes) states.push('applied')
    else fail(`planned source has neither the before nor after image:${expected.path}`)
    if (read.mode !== change.mode) fail(`planned source mode changed:${expected.path}`)
  }
  if (new Set(states).size > 1) fail('codemod proposal is partially applied')
  return states[0] ?? 'no-changes'
}

export function checkCodemodProposal({ repoRoot = process.cwd(), proposal } = {}) {
  validateCodemodProposal(proposal)
  if (proposal.blockers.length) fail(`proposal has ${proposal.blockers.length} manual blocker(s)`)
  const root = canonicalRoot(repoRoot, 'codemod repository root', fail)
  const state = currentCodemodState({ root, proposal })
  if (state === 'pending') fail('codemod migration is planned but not applied')
  return { proposalDigest: proposal.proposalDigest, state, files: proposal.files.length }
}

export function applyCodemodProposal({
  repoRoot = process.cwd(),
  proposal,
  expectedProposalDigest,
  beforePublish = null,
} = {}) {
  validateCodemodProposal(proposal)
  if (!SHA256_PATTERN.test(expectedProposalDigest ?? '') || expectedProposalDigest !== proposal.proposalDigest) fail('explicit expected proposal digest is missing or mismatched')
  if (proposal.blockers.length) fail(`proposal has ${proposal.blockers.length} manual blocker(s)`)
  const root = canonicalRoot(repoRoot, 'codemod repository root', fail)
  const state = currentCodemodState({ root, proposal })
  if (state === 'applied' || state === 'no-changes') return { proposalDigest: proposal.proposalDigest, state, changed: 0 }
  const operations = proposal.files.map((row) => {
    const read = readStableFile(root, row.path, `codemod materialization ${row.path}`, fail)
    let source
    try { source = fatalUtf8.decode(read.bytes) } catch (error) { fail(`${row.path} is no longer valid UTF-8:${error.message}`) }
    const output = applyTextEdits(source, row.edits, row.path)
    const afterBytes = Buffer.from(output, 'utf8')
    if (sha256(afterBytes) !== row.afterSha256 || afterBytes.length !== row.afterBytes) fail(`codemod materialization differs from proposal:${row.path}`)
    return { action: 'replace', path: row.path, beforeSha256: row.beforeSha256, beforeMode: row.mode, afterSha256: row.afterSha256, afterBytes, mode: row.mode }
  })
  const result = applyAtomicOperations({
    root,
    operations,
    fail,
    lockName: '.qijenchen-ds-codemod.lock',
    beforePublish,
  })
  const checked = currentCodemodState({ root, proposal })
  if (checked !== 'applied') fail('codemod atomic readback did not reach the applied state')
  return { proposalDigest: proposal.proposalDigest, state: checked, changed: result.changed }
}

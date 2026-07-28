import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { compareUtf8Bytes } from './provider-lifecycle.mjs'

const RUNTIME_MODULE = /\.(?:cjs|js|mjs)$/

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function normalizeInventoryPath(value, label) {
  invariant(typeof value === 'string' && value.length > 0 && !isAbsolute(value) && !value.includes('\\') && !value.includes('\0'), `${label} must be a portable relative path`)
  const normalized = posix.normalize(value.replace(/^\.\//, ''))
  invariant(normalized !== '.' && normalized !== '..' && !normalized.startsWith('../'), `${label} escapes the delivery root:${value}`)
  return normalized
}

export function relativeRuntimeImports(source) {
  invariant(typeof source === 'string', 'runtime module source must be text')
  // Scan conservatively without deleting comments or regex literals. A prose example may add an
  // extra fail-closed edge, but executable import evidence must survive legal comments between
  // JavaScript tokens. Every separator alternative consumes at least one byte so the repeated
  // expression cannot loop on an empty match.
  const body = source
  const imports = []
  const separatorToken = String.raw`(?:\s+|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))`
  const separator = `(?:${separatorToken})*`
  const patterns = [
    { kind: 'esm', expression: new RegExp(String.raw`\bfrom${separator}['"]([^'"]+)['"]`, 'g') },
    { kind: 'esm', expression: new RegExp(String.raw`\bimport${separator}['"]([^'"]+)['"]`, 'g') },
    { kind: 'esm', expression: new RegExp(String.raw`\bimport${separator}\(${separator}['"]([^'"]+)['"]`, 'g') },
    {
      kind: 'cjs',
      expression: new RegExp(
        String.raw`\brequire(?:${separator}\.${separator}resolve)?${separator}\(${separator}['"]([^'"]+)['"]${separator}\)`,
        'g',
      ),
    },
  ]
  for (const { kind, expression } of patterns) {
    for (const match of body.matchAll(expression)) {
      if (match[1].startsWith('.')) imports.push({ kind, specifier: match[1] })
    }
  }
  return [...new Map(imports.map((item) => [`${item.kind}:${item.specifier}`, item])).values()]
    .sort((left, right) => compareUtf8Bytes(
      `${left.kind}:${left.specifier}`,
      `${right.kind}:${right.specifier}`,
    ))
}

export function runtimeDependencyCandidates(importer, dependency) {
  invariant(!dependency.specifier.includes('\\') && !dependency.specifier.includes('\0'), `runtime dependency uses a non-portable specifier:${importer} -> ${dependency.specifier}`)
  const clean = dependency.specifier.split(/[?#]/, 1)[0]
  const target = posix.normalize(posix.join(posix.dirname(importer), clean))
  invariant(target !== '..' && !target.startsWith('../') && !target.startsWith('/'), `runtime dependency escapes the delivery root:${importer} -> ${dependency.specifier}`)
  if (dependency.kind === 'esm') return { target, candidates: [target] }
  return {
    target,
    candidates: [target, `${target}.cjs`, `${target}.js`, `${target}.mjs`, `${target}/index.cjs`, `${target}/index.js`, `${target}/index.mjs`],
  }
}

export function assertRuntimeDependencyClosureEntries(entries, { label = 'runtime delivery', scanRoots = null } = {}) {
  const inventory = new Map()
  for (const [path, content] of entries instanceof Map ? entries : Object.entries(entries || {})) {
    const normalized = normalizeInventoryPath(path, `${label} inventory path`)
    invariant(!inventory.has(normalized), `${label} inventory has a duplicate path:${normalized}`)
    inventory.set(normalized, RUNTIME_MODULE.test(normalized)
      ? (Buffer.isBuffer(content) ? content.toString('utf8') : String(content))
      : null)
  }
  const roots = scanRoots === null
    ? null
    : scanRoots.map((path, index) => normalizeInventoryPath(path, `${label} scanRoots[${index}]`))
  const queue = [...inventory.keys()].filter((path) => (
    RUNTIME_MODULE.test(path)
    && (roots === null || roots.some((root) => path === root || path.startsWith(`${root}/`)))
  )).sort()
  const scanned = new Set()
  const edges = []
  const missing = []
  while (queue.length) {
    const importer = queue.shift()
    if (scanned.has(importer)) continue
    scanned.add(importer)
    for (const dependency of relativeRuntimeImports(inventory.get(importer))) {
      const resolution = runtimeDependencyCandidates(importer, dependency)
      const resolved = resolution.candidates.find((candidate) => inventory.has(candidate)) || null
      const edge = { importer, kind: dependency.kind, specifier: dependency.specifier, target: resolution.target, resolved }
      edges.push(edge)
      if (!resolved) missing.push(edge)
      else if (RUNTIME_MODULE.test(resolved) && !scanned.has(resolved)) queue.push(resolved)
    }
  }
  if (missing.length) {
    throw new Error(`${label} has missing relative runtime dependencies:${missing.map((edge) => `${edge.importer} -> ${edge.specifier} (${edge.target})`).join(', ')}`)
  }
  return {
    inventoryCount: inventory.size,
    runtimeModuleCount: scanned.size,
    runtimeModules: [...scanned].sort(),
    edgeCount: edges.length,
    edges,
  }
}

export function assertRuntimeDependencyClosureDirectory(root, options = {}) {
  const canonicalRoot = resolve(root)
  const info = lstatSync(canonicalRoot)
  invariant(info.isDirectory() && !info.isSymbolicLink(), `${options.label || 'runtime delivery'} root must be a real directory`)
  const entries = new Map()
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name)
      const child = lstatSync(absolute)
      const path = relative(canonicalRoot, absolute).split(sep).join('/')
      invariant(!child.isSymbolicLink(), `${options.label || 'runtime delivery'} contains a symbolic link:${path}`)
      if (child.isDirectory()) visit(absolute)
      else {
        invariant(child.isFile(), `${options.label || 'runtime delivery'} contains an unsupported entry:${path}`)
        entries.set(path, readFileSync(absolute))
      }
    }
  }
  visit(canonicalRoot)
  return assertRuntimeDependencyClosureEntries(entries, options)
}

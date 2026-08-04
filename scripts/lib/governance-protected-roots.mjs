import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  PRODUCT_TEMPLATE_PROJECTION_ROOT,
  productCommonProjectionDeclarations,
  productProviderProjectionDeclarations,
  repositoryProviderProjectionDeclarations,
} from './provider-projection-contract.mjs'
import {
  assertClosedGitLocalConfiguration,
  runClosedGit,
} from './closed-tool-execution.mjs'
const CLASSIFICATIONS = new Set(['canonical-source', 'generated-output', 'non-authority-exclusion'])
// Closed-baseline compatibility symlinks left behind by the retired
// control-plane genesis transition (baton §8.5); their authority trees live at
// infra/governance/baseline/visual/{targeted,curated}.
const GENESIS_TREE_TO_SYMLINK_OUTPUTS = new Set(['.claude/snapshots-baseline', 'snapshots-baseline'])

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function posix(value) { return value.split(sep).join('/') }

export function repositoryPath(value, label, { allowTrailingSlash = false } = {}) {
  invariant(typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes('\0') && !isAbsolute(value), `${label} must be a repository-relative POSIX path`)
  const trimmed = value.endsWith('/') ? value.slice(0, -1) : value
  invariant((allowTrailingSlash || trimmed === value) && trimmed && trimmed.split('/').every(segment => segment && segment !== '.' && segment !== '..'), `${label} contains an unsafe segment:${value}`)
  return trimmed
}

function contained(root, repositoryRelativePath, label) {
  const path = repositoryPath(repositoryRelativePath, label)
  const base = resolve(root)
  const absolute = resolve(base, path)
  const rel = relative(base, absolute)
  invariant(rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label} escapes or aliases the repository root:${path}`)
  return { path, absolute }
}

export function pathMatches(path, declaration) {
  const candidate = repositoryPath(path, 'observed build-graph path', { allowTrailingSlash: true })
  const declared = repositoryPath(declaration, 'build-graph declaration', { allowTrailingSlash: true })
  return declaration.endsWith('/') ? candidate === declared || candidate.startsWith(`${declared}/`) : candidate === declared
}

function under(path, root) { return path === root || path.startsWith(`${root}/`) }

function outputIntersectsEntry(output, entry, label = 'build-graph output declaration') {
  const outputPath = repositoryPath(output, label, { allowTrailingSlash: true })
  if (entry.match === 'file') return pathMatches(entry.path, output)
  return pathMatches(entry.path, output) || under(outputPath, entry.path)
}

function entryMatches(path, entry) {
  const matched = entry.match === 'file' ? path === entry.path : under(path, entry.path)
  return matched && !entry.excludes.some(excluded => under(path, excluded))
}

function pathEntryExists(path) {
  try { lstatSync(path); return true } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function assertProtectedAncestorsAreReal(root, protectedRoot) {
  const base = resolve(root)
  const rootInfo = lstatSync(base)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), 'protected-root repository root must be a real directory')
  const parts = protectedRoot.split('/')
  let cursor = base
  for (const part of parts.slice(0, -1)) {
    cursor = resolve(cursor, part)
    if (!pathEntryExists(cursor)) return
    const info = lstatSync(cursor)
    invariant(info.isDirectory() && !info.isSymbolicLink(), `protected root crosses a non-directory or symbolic-link ancestor:${posix(relative(base, cursor))}`)
  }
}

function filesystemLeaves(root, protectedRoot) {
  const { absolute } = contained(root, protectedRoot, `protected root ${protectedRoot}`)
  assertProtectedAncestorsAreReal(root, protectedRoot)
  if (!pathEntryExists(absolute)) return []
  const rootInfo = lstatSync(absolute)
  if (rootInfo.isSymbolicLink()) return [{ path: protectedRoot, type: 'symlink', mode: rootInfo.mode, nlink: rootInfo.nlink }]
  if (rootInfo.isFile()) {
    return [{ path: protectedRoot, type: 'file', mode: rootInfo.mode, nlink: rootInfo.nlink }]
  }
  invariant(rootInfo.isDirectory(), `protected root has unsupported type:${protectedRoot}`)
  const leaves = []
  const visit = directory => {
    for (const name of readdirSync(directory).sort()) {
      const absolutePath = resolve(directory, name)
      const item = lstatSync(absolutePath)
      const path = posix(relative(root, absolutePath))
      if (item.isDirectory() && !item.isSymbolicLink()) visit(absolutePath)
      else if (item.isFile()) {
        leaves.push({ path, type: 'file', mode: item.mode, nlink: item.nlink })
      } else if (item.isSymbolicLink()) leaves.push({ path, type: 'symlink', mode: item.mode, nlink: item.nlink })
      else throw new Error(`protected root contains unsupported filesystem entry:${path}`)
    }
  }
  visit(absolute)
  return leaves
}

function gitTrackedEntries(root) {
  assertClosedGitLocalConfiguration(root)
  const result = runClosedGit(['ls-files', '--stage', '-z'], {
    cwd: resolve(root),
    maxOutputBytes: 32 * 1024 * 1024,
    timeoutMs: 10_000,
  })
  invariant(result.status === 0, `cannot enumerate tracked protected-root paths:${(result.stderr || '').trim()}`)
  return result.stdout.split('\0').filter(Boolean).map((record) => {
    const match = record.match(/^(\d{6}) [a-f0-9]+ (\d)\t([\s\S]+)$/)
    invariant(match, `cannot parse tracked protected-root index entry:${record}`)
    invariant(match[2] === '0', `protected-root path has an unresolved index stage:${match[3]}`)
    return { mode: match[1], path: repositoryPath(match[3], 'tracked protected-root path') }
  })
}

function gitIgnoredPaths(root, paths) {
  if (!paths.length) return []
  assertClosedGitLocalConfiguration(root)
  const result = runClosedGit(['check-ignore', '-z', '--stdin'], {
    cwd: resolve(root),
    input: `${paths.join('\0')}\0`,
    maxOutputBytes: 32 * 1024 * 1024,
    timeoutMs: 10_000,
  })
  invariant(result.status === 0 || result.status === 1, `cannot enumerate ignored protected-root paths:${(result.stderr || '').trim()}`)
  return result.stdout.split('\0').filter(Boolean).map(path => repositoryPath(path, 'ignored protected-root path'))
}

function validateDocumentShape(document, schema) {
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  invariant(validate(document), `protected-root classification schema failure:${(validate.errors || []).map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`)
}

function derivedEntryId(path) {
  const slug = path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'root'
  const suffix = createHash('sha256').update(path).digest('hex').slice(0, 10)
  return `provider-projection-${slug}-${suffix}`
}

export function deriveProviderProtectedRootClassification(document, providerRegistry) {
  invariant(document?.providerProjectionPolicy === 'derive-active-generated-views', 'protected-root provider projection policy is missing or invalid')
  const derived = structuredClone(document)
  const entriesByPath = new Map(derived.entries.map(entry => [entry.path, entry]))
  const roots = new Set(derived.protectedRoots)
  const addGenerated = declaration => {
    const existing = entriesByPath.get(declaration.path)
    invariant(!existing, `provider projection remains duplicated in the static protected-root inventory:${declaration.path}`)
    const entry = {
      id: derivedEntryId(declaration.path),
      path: declaration.path,
      match: declaration.kind,
      classification: 'generated-output',
      excludes: [],
      allowAbsent: false,
      reason: `Derived generated ${declaration.provider} ${declaration.surface} projection; provider registry is the sole output-set authority.`,
    }
    derived.entries.push(entry)
    entriesByPath.set(entry.path, entry)
  }
  const ensureLocalPartition = (path, parent = null) => {
    let partition = entriesByPath.get(path)
    if (!partition) {
      partition = {
        id: derivedEntryId(`${path}/provider-local-state`),
        path,
        match: 'tree',
        classification: 'non-authority-exclusion',
        excludes: [],
        allowAbsent: true,
        reason: 'Provider-local files outside registry-derived projections are explicitly non-authoritative.',
      }
      derived.entries.push(partition)
      entriesByPath.set(path, partition)
    }
    invariant(partition.match === 'tree' && partition.classification === 'non-authority-exclusion', `provider projection root must be a non-authority partition:${path}`)
    // A static non-provider generated child (for example Claude commands/agents compatibility)
    // remains an explicit child owner instead of being swallowed by provider-local state.
    partition.excludes = [...new Set([
      ...partition.excludes,
      ...derived.entries.filter(entry => entry.path !== path && under(entry.path, path)).map(entry => entry.path),
    ])].sort()
    if (parent) {
      invariant(parent.match === 'tree', `provider projection parent must be a tree partition:${parent.path}`)
      parent.excludes = [...new Set([...parent.excludes, path])].sort()
    }
    return partition
  }

  const repositoryDeclarations = repositoryProviderProjectionDeclarations(providerRegistry)
  for (const declaration of repositoryDeclarations) {
    const root = declaration.path.split('/')[0]
    roots.add(root)
    if (declaration.path === root) addGenerated(declaration)
    else {
      const partition = ensureLocalPartition(root)
      partition.excludes = [...new Set([...partition.excludes, declaration.path])].sort()
      addGenerated(declaration)
    }
  }

  const productDeclarations = [
    ...productCommonProjectionDeclarations(providerRegistry),
    ...productProviderProjectionDeclarations(providerRegistry),
  ]
  const productRoot = entriesByPath.get(PRODUCT_TEMPLATE_PROJECTION_ROOT)
  invariant(!productDeclarations.length || (productRoot?.match === 'tree' && productRoot.classification === 'canonical-source'), `product provider projection root must be one canonical tree:${PRODUCT_TEMPLATE_PROJECTION_ROOT}`)
  for (const declaration of productDeclarations) {
    const relativePath = declaration.path.slice(PRODUCT_TEMPLATE_PROJECTION_ROOT.length + 1)
    invariant(relativePath && !relativePath.startsWith('/'), `product provider projection is outside its root:${declaration.path}`)
    const [first, ...rest] = relativePath.split('/')
    if (!rest.length) {
      productRoot.excludes = [...new Set([...productRoot.excludes, declaration.path])].sort()
      addGenerated(declaration)
      continue
    }
    const partition = ensureLocalPartition(`${PRODUCT_TEMPLATE_PROJECTION_ROOT}/${first}`, productRoot)
    partition.excludes = [...new Set([...partition.excludes, declaration.path])].sort()
    addGenerated(declaration)
  }
  derived.protectedRoots = [...roots].sort()
  return derived
}

function validateDocumentSemantics(document) {
  const roots = document.protectedRoots.map((path, index) => repositoryPath(path, `protectedRoots[${index}]`))
  invariant(new Set(roots).size === roots.length, 'protected roots must be unique')
  const ids = new Set()
  for (const entry of document.entries) {
    invariant(!ids.has(entry.id), `protected-root classification id duplicated:${entry.id}`)
    ids.add(entry.id)
    entry.path = repositoryPath(entry.path, `classification ${entry.id} path`)
    invariant(CLASSIFICATIONS.has(entry.classification), `classification ${entry.id} has an unknown class`)
    invariant(roots.some(root => under(entry.path, root)), `classification ${entry.id} is outside every protected root:${entry.path}`)
    invariant(entry.match === 'tree' || entry.excludes.length === 0, `file classification ${entry.id} cannot declare exclusions`)
    entry.excludes = entry.excludes.map(excluded => repositoryPath(excluded, `classification ${entry.id} exclusion`))
    for (const excluded of entry.excludes) invariant(excluded !== entry.path && under(excluded, entry.path), `classification ${entry.id} exclusion is outside its tree:${excluded}`)
  }
  for (const root of roots) {
    const owners = document.entries.filter(entry => entry.path === root)
    invariant(owners.length === 1, `protected root requires one exact classification owner:${root}`)
  }
  for (const entry of document.entries) for (const excluded of entry.excludes) {
    const owners = document.entries.filter(candidate => candidate.path === excluded)
    invariant(owners.length === 1, `classification exclusion requires one exact child owner:${entry.id}:${excluded}`)
  }
  for (let left = 0; left < document.entries.length; left += 1) for (let right = left + 1; right < document.entries.length; right += 1) {
    const a = document.entries[left]
    const b = document.entries[right]
    const [parent, child] = under(b.path, a.path) ? [a, b] : under(a.path, b.path) ? [b, a] : []
    if (!parent) continue
    const partitioned = parent.match === 'tree' && parent.excludes.some(excluded => under(child.path, excluded))
    invariant(partitioned, `protected-root classification entries overlap statically:${a.id}:${b.id}`)
  }
  return roots
}

function declarationOwner(entries, declaration, label) {
  const path = repositoryPath(declaration, label, { allowTrailingSlash: true })
  const matches = entries.filter(entry => entryMatches(path, entry))
  invariant(matches.length === 1, matches.length === 0
    ? `${label} is outside the protected-root classification:${declaration}`
    : `${label} is ambiguously classified:${declaration}:${matches.map(entry => entry.id).join(',')}`)
  return { path, entry: matches[0] }
}

function validateGraphDeclarationClosure(document, stages, allowedCanonicalOutputOverlaps) {
  for (const [stageIndex, stage] of stages.entries()) {
    for (const source of stage.sources) {
      const { path, entry } = declarationOwner(document.entries, source, `${stage.id} source declaration`)
      invariant(entry.classification !== 'non-authority-exclusion', `${stage.id} source declaration is non-authority:${source}`)
      if (!source.endsWith('/')) continue
      for (const child of document.entries.filter(candidate => candidate.path !== path && under(candidate.path, path))) {
        const excluded = (stage.sourceExcludes || []).some(declaration => pathMatches(child.path, declaration))
        invariant(excluded || child.classification !== 'non-authority-exclusion', `${stage.id} source tree crosses non-authority boundary without exclusion:${source}:${child.path}`)
        if (!excluded && child.classification === 'generated-output') {
          const producedEarlier = stages.slice(0, stageIndex).some(candidate => candidate.outputs.some(output => outputIntersectsEntry(output, child, `${candidate.id} output declaration`)))
          invariant(producedEarlier, `${stage.id} source tree consumes generated output before its producer:${source}:${child.path}`)
        }
      }
      if (entry.classification === 'generated-output') {
        const producedEarlier = stages.slice(0, stageIndex).some(candidate => candidate.outputs.some(output => pathMatches(path, output)))
        invariant(producedEarlier, `${stage.id} source consumes generated output before its producer:${source}`)
      }
    }
    for (const exclusion of stage.sourceExcludes || []) {
      invariant(stage.sources.some(source => source.endsWith('/') && pathMatches(exclusion, source)), `${stage.id} source exclusion is outside its source declarations:${exclusion}`)
    }
    for (const output of stage.outputs) {
      const { path, entry } = declarationOwner(document.entries, output, `${stage.id} output declaration`)
      const overlapAllowed = allowedCanonicalOutputOverlaps.some(declaration => pathMatches(path, declaration))
      invariant(entry.classification === 'generated-output' || (entry.classification === 'canonical-source' && overlapAllowed), `${stage.id} output declaration is not generated or an allowed exact transform:${output}`)
      if (!output.endsWith('/')) continue
      for (const child of document.entries.filter(candidate => candidate.path !== path && under(candidate.path, path))) {
        invariant(child.classification === entry.classification, `${stage.id} output tree crosses classification boundary:${output}:${child.path}`)
      }
    }
  }
}

export function validateProtectedRootClassification({
  root,
  document,
  schema,
  stages,
  trackedPaths = null,
  ignoredPaths = null,
  observedPaths = [],
  allowedCanonicalOutputOverlaps = [],
}) {
  validateDocumentShape(document, schema)
  const roots = validateDocumentSemantics(document)
  validateGraphDeclarationClosure(document, stages, allowedCanonicalOutputOverlaps)
  const tracked = (trackedPaths ?? gitTrackedEntries(root)).map((entry, index) => {
    invariant(entry && typeof entry === 'object' && !Array.isArray(entry), `trackedPaths[${index}] must include path and index mode`)
    const path = repositoryPath(entry.path, `trackedPaths[${index}].path`)
    invariant(['100644', '100755', '120000'].includes(entry.mode), `tracked protected-root path has unsupported index mode:${path}:${entry.mode}`)
    return { path, mode: entry.mode }
  })
  invariant(new Set(tracked.map(entry => entry.path)).size === tracked.length, 'tracked protected-root paths must be unique')
  const trackedModes = new Map(tracked.map((entry) => [entry.path, entry.mode]))
  invariant(Array.isArray(observedPaths), 'observedPaths must be an array')
  const observed = observedPaths.map((path, index) => repositoryPath(path, `observedPaths[${index}]`))
  const filesystem = roots.flatMap(protectedRoot => filesystemLeaves(root, protectedRoot))
  const filesystemByPath = new Map(filesystem.map(entry => [entry.path, entry]))
  // During the one reviewed Genesis baseline tree -> exact symlink migration, the
  // worktree generator has already replaced the tree while the unstaged index
  // still enumerates its former children. The ordinary rule remains exact-file
  // only; the only tree roots admitted here are the two content-addressed
  // transition paths exported by the canonical transition contract.
  const generatedSymlinkTransitions = filesystem
    .filter(entry => entry.type === 'symlink')
    .map(entry => entry.path)
    .filter(path => document.entries.some(entry => (
      entryMatches(path, entry)
        && entry.classification === 'generated-output'
        && (
          entry.path !== path
            || entry.match === 'file'
            || GENESIS_TREE_TO_SYMLINK_OUTPUTS.has(path)
        )
    )))
    .filter(path => stages.some(stage => stage.outputs.some(output => repositoryPath(
      output,
      `${stage.id} output declaration`,
      { allowTrailingSlash: true },
    ) === path)))
  const leaves = [...new Set([
    ...filesystem.map(entry => entry.path),
    ...tracked.map((entry) => entry.path)
      .filter(path => roots.some(protectedRoot => under(path, protectedRoot)))
      .filter(path => !generatedSymlinkTransitions.some(parent => path !== parent && under(path, parent))),
    ...observed,
  ])].sort()
  const ignored = new Set((ignoredPaths ?? gitIgnoredPaths(root, filesystem.map(entry => entry.path))).map((path, index) => repositoryPath(path, `ignoredPaths[${index}]`)))
  const matchedByEntry = new Map(document.entries.map(entry => [entry.id, []]))
  const records = []
  for (const path of leaves) {
    const matches = document.entries.filter(entry => entryMatches(path, entry))
    invariant(matches.length === 1, matches.length === 0
      ? `unclassified protected-root path:${path}`
      : `ambiguous protected-root path:${path}:${matches.map(entry => entry.id).join(',')}`)
    const [entry] = matches
    matchedByEntry.get(entry.id).push(path)
    const filesystemEntry = filesystemByPath.get(path)
    const indexMode = trackedModes.get(path)
    if (indexMode) {
      // A missing leaf beneath a classified tree can be an intentional source
      // deletion in the unstaged worktree. Exact protected files remain
      // fail-closed; staged/pre-commit validation removes deleted leaves from
      // the index naturally.
      invariant(filesystemEntry || entry.allowAbsent || entry.match === 'tree' || entry.classification === 'generated-output', `tracked exact protected-root path is absent but its classification is required:${path}`)
      // The generator, not the previous Git index entry, owns generated target
      // type/mode. Allow it to repair drift before its pure --check validates
      // the expected bytes and permissions.
      if (filesystemEntry && entry.classification !== 'generated-output') {
        const expectedType = indexMode === '120000' ? 'symlink' : 'file'
        invariant(filesystemEntry.type === expectedType, `protected-root index/worktree type mismatch:${path}:${indexMode}:${filesystemEntry.type}`)
        // The current worktree is the authoring authority for canonical source
        // permissions. A deliberate 0644 <-> 0755 edit must be able to flow
        // through generation before it is staged; pure drift checks own the
        // expected generated-output mode.
      }
    }
    if (ignored.has(path)) invariant(entry.classification === 'non-authority-exclusion', `ignored protected-root path is not explicitly non-authority:${path}`)
    if (filesystemEntry?.type === 'file' && entry.classification !== 'non-authority-exclusion') {
      invariant(filesystemEntry.nlink === 1, `protected root file is a hard-link alias:${path}`)
    }
    const sourceStages = stages.filter(stage => stage.sources.some(declaration => pathMatches(path, declaration))
      && !(stage.sourceExcludes || []).some(declaration => pathMatches(path, declaration))).map(stage => stage.id)
    const outputStages = stages.filter(stage => stage.outputs.some(declaration => pathMatches(path, declaration))).map(stage => stage.id)
    if (entry.classification === 'canonical-source') {
      invariant(sourceStages.length > 0, `canonical protected-root path is outside the build-graph sources:${path}`)
      const overlapAllowed = allowedCanonicalOutputOverlaps.some(declaration => pathMatches(path, declaration))
      invariant(outputStages.length === 0 || overlapAllowed, `canonical protected-root path is also a generated output without an explicit field-transform exception:${path}`)
    } else if (entry.classification === 'generated-output') {
      invariant(outputStages.length > 0, `generated protected-root path is outside the build-graph outputs:${path}`)
    } else {
      invariant(sourceStages.length === 0 && outputStages.length === 0, `non-authority protected-root path participates in the build graph:${path}`)
    }
    const isFilesystemSymlink = filesystemEntry?.type === 'symlink'
    if (isFilesystemSymlink) {
      const exactOutputStages = stages.filter(stage => stage.outputs.some(output => repositoryPath(
        output,
        `${stage.id} output declaration`,
        { allowTrailingSlash: true },
      ) === path)).map(stage => stage.id)
      invariant(
        entry.classification === 'generated-output'
          && (
            entry.path !== path
              || entry.match === 'file'
              || GENESIS_TREE_TO_SYMLINK_OUTPUTS.has(path)
          )
          && exactOutputStages.length > 0,
        `only exact generated files or reviewed Genesis baseline aliases may be symlinks inside protected roots:${path}`,
      )
    }
    records.push({ path, classification: entry.classification, entryId: entry.id, sourceStages, outputStages })
  }
  for (const entry of document.entries) {
    const declaredGeneratedOutput = entry.classification === 'generated-output' && stages.some(stage => stage.outputs.some(output => {
      const outputPath = repositoryPath(output, `${stage.id} output declaration`, { allowTrailingSlash: true })
      return entry.match === 'file' ? outputPath === entry.path : under(outputPath, entry.path) || under(entry.path, outputPath)
    }))
    invariant(entry.allowAbsent || declaredGeneratedOutput || matchedByEntry.get(entry.id).length > 0, `protected-root classification entry matches no path:${entry.id}`)
  }
  return { schemaVersion: 1, protectedRoots: roots, pathCount: records.length, records }
}

export function loadAndValidateProtectedRootClassification({
  root,
  inventoryPath,
  schemaPath,
  stages,
  providerRegistry = null,
  observedPaths = [],
  allowedCanonicalOutputOverlaps = [],
}) {
  const inventory = JSON.parse(readFileSync(resolve(root, inventoryPath), 'utf8'))
  const schema = JSON.parse(readFileSync(resolve(root, schemaPath), 'utf8'))
  const registry = providerRegistry ?? (inventory.providerProjectionPolicy === 'derive-active-generated-views'
    ? JSON.parse(readFileSync(resolve(root, repositoryPath(inventory.providerRegistryPath, 'protected-root providerRegistryPath')), 'utf8'))
    : null)
  const document = registry ? deriveProviderProtectedRootClassification(inventory, registry) : inventory
  return validateProtectedRootClassification({
    root,
    document,
    schema,
    stages,
    observedPaths,
    allowedCanonicalOutputOverlaps,
  })
}

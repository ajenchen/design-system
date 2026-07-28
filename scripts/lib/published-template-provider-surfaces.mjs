import { createHash } from 'node:crypto'
import { cpSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  assertNoSymlinkPath,
  canonicalRepositoryRoot,
  normalizeRepositoryRelative,
  validateForkManifestProviderSurfaces,
} from '../refresh-fork-launchers.mjs'
import { compareUtf8Bytes } from './provider-lifecycle.mjs'

export const MIRROR_PROVIDER_POLICY = 'verified-fork-managed-surfaces-v1'
export const COMMON_INSTRUCTION_OWNERSHIP_POLICY = 'common-authority-consumer'

const SHA256 = /^[a-f0-9]{64}$/
const invariant = (condition, message) => { if (!condition) throw new Error(message) }
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function publishedCompatibilitySourcePaths(manifest, { templatePrefix = 'template/ds-product-template' } = {}) {
  const prefix = normalizeRepositoryRelative(templatePrefix, 'published compatibility template prefix')
  const categories = manifest?.consumer?.compatibilityCategories
  invariant(Array.isArray(categories), 'fork manifest consumer.compatibilityCategories must be an array')
  const paths = []
  for (const [categoryIndex, category] of categories.entries()) {
    const destinationRoot = normalizeRepositoryRelative(category?.destinationRoot, `fork manifest compatibilityCategories[${categoryIndex}].destinationRoot`)
    invariant(Array.isArray(category.entries), `fork manifest compatibilityCategories[${categoryIndex}].entries must be an array`)
    for (const [entryIndex, entry] of category.entries.entries()) {
      const name = normalizeRepositoryRelative(entry, `fork manifest compatibilityCategories[${categoryIndex}].entries[${entryIndex}]`)
      invariant(!name.includes('/'), `fork manifest compatibility entry must be one discovery leaf:${entry}`)
      paths.push(`${prefix}/${destinationRoot}/${name}`)
    }
  }
  const unique = [...new Set(paths)].sort()
  invariant(unique.length === paths.length, 'fork manifest compatibility source paths must be unique')
  return unique
}

function exactKeys(value, keys, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), `${label} has an open or incomplete shape`)
  return value
}

function regularUnaliasedFile(root, path, label) {
  assertNoSymlinkPath(root, path, label, { allowMissing: false })
  const info = lstatSync(path)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, `${label} must be one regular unaliased file`)
  return path
}

function nestedPath(root, value, label) {
  const normalized = normalizeRepositoryRelative(value, label)
  const absolute = resolve(root, normalized)
  const rel = relative(root, absolute)
  invariant(rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label} escapes its authority root`)
  return { normalized, absolute }
}

function validateCorpusLock(lock, { forkRoot, manifestPath, commonArtifact }) {
  exactKeys(lock, ['_purpose', 'entries', 'hashAlgorithm', 'kind', 'schemaVersion'], 'fork governance lock')
  invariant(lock.schemaVersion === 1 && lock.kind === 'fork-governance-corpus-lock' && lock.hashAlgorithm === 'sha256', 'fork governance lock identity is invalid')
  invariant(Array.isArray(lock.entries) && lock.entries.length > 0, 'fork governance lock has no entries')
  const entries = new Map()
  let previous = null
  for (const [index, entry] of lock.entries.entries()) {
    exactKeys(entry, ['classification', 'destination', 'file', 'schemaVersion', 'sha256', 'source'], `fork governance lock entry[${index}]`)
    const path = normalizeRepositoryRelative(entry.file, `fork governance lock entry[${index}].file`)
    invariant(entry.schemaVersion === 1 && SHA256.test(entry.sha256 || ''), `fork governance lock entry is invalid:${path}`)
    invariant(previous === null || compareUtf8Bytes(previous, path) < 0, 'fork governance lock entries must be sorted and unique')
    const absolute = regularUnaliasedFile(forkRoot, join(forkRoot, path), `fork governance locked body ${path}`)
    invariant(sha256(readFileSync(absolute)) === entry.sha256, `fork governance locked body digest mismatch:${path}`)
    entries.set(path, entry)
    previous = path
  }
  const manifestRelative = relative(forkRoot, manifestPath).split(sep).join('/')
  invariant(entries.has(manifestRelative), 'fork governance lock does not bind the manifest')
  invariant(entries.has(commonArtifact), `fork governance lock does not bind common instruction artifact:${commonArtifact}`)
  return entries
}

function commonInstruction(manifest) {
  const common = exactKeys(
    manifest?.consumer?.commonInstruction,
    ['artifact', 'destination', 'materializerId', 'schemaVersion'],
    'fork manifest consumer.commonInstruction',
  )
  invariant(common.schemaVersion === 1, 'fork manifest common instruction schema is unsupported')
  const materializer = manifest?.materializers?.instructionViews?.[common.materializerId]
  invariant(
    materializer?.ownershipPolicy === COMMON_INSTRUCTION_OWNERSHIP_POLICY,
    `fork manifest common instruction materializer is not common authority:${common.materializerId || '<missing>'}`,
  )
  return {
    artifact: normalizeRepositoryRelative(common.artifact, 'fork manifest common instruction artifact'),
    destination: normalizeRepositoryRelative(common.destination, 'fork manifest common instruction destination'),
    materializerId: common.materializerId,
  }
}

function assertSurfaceSetIsClosed(common, providers) {
  const declarations = [{ provider: 'common', path: common.destination, kind: 'file' }]
  for (const provider of providers) for (const surface of provider.surfaces) declarations.push({ provider: provider.id, ...surface })
  declarations.sort((left, right) => compareUtf8Bytes(left.path, right.path))
  const owners = new Map()
  for (const declaration of declarations) {
    const prior = owners.get(declaration.path)
    invariant(!prior, prior
      ? `published provider surface has multiple owners:${declaration.path}:${prior.provider}:${declaration.provider}`
      : `published provider surface is duplicated:${declaration.path}`)
    owners.set(declaration.path, declaration)
  }
  for (let left = 0; left < declarations.length; left += 1) for (let right = left + 1; right < declarations.length; right += 1) {
    const a = declarations[left]
    const b = declarations[right]
    invariant(!b.path.startsWith(`${a.path}/`), `published provider surfaces overlap:${a.path}:${b.path}`)
  }
  return declarations
}

export function loadVerifiedForkSurfaceAuthority({ authorityRoot, manifestPath, lockPath }) {
  const root = canonicalRepositoryRoot(resolve(authorityRoot))
  const manifestResolved = nestedPath(root, manifestPath, 'provider surface manifest path')
  const lockResolved = nestedPath(root, lockPath, 'provider surface lock path')
  const manifestFile = regularUnaliasedFile(root, manifestResolved.absolute, 'fork provider surface manifest')
  const lockFile = regularUnaliasedFile(root, lockResolved.absolute, 'fork provider surface lock')
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  invariant(manifest.schemaVersion === 2 && manifest.kind === 'provider-neutral-fork-manifest', 'fork provider surface manifest identity is invalid')
  const common = commonInstruction(manifest)
  const forkRoot = dirname(manifestFile)
  invariant(dirname(lockFile) === forkRoot, 'fork provider surface manifest and lock must share one corpus root')
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'))
  const lockEntries = validateCorpusLock(lock, { forkRoot, manifestPath: manifestFile, commonArtifact: common.artifact })
  const providers = validateForkManifestProviderSurfaces(manifest, 'fork provider surface manifest')
  const authority = { root, forkRoot, manifest, lock, lockEntries, common, providers }
  const providerArtifacts = {}
  for (const [providerId, surface] of Object.entries(manifest.providerSurfaces || {})) {
    if (!surface.generated) continue
    providerArtifacts[providerId] = assertLockedProviderArtifacts(authority, providerId, surface)
  }
  const declarations = assertSurfaceSetIsClosed(common, providers)
  return { ...authority, providerArtifacts, declarations }
}

function assertSafeSurfaceTree(root, target, label) {
  assertNoSymlinkPath(root, target, label, { allowMissing: false })
  const top = lstatSync(target)
  const visit = (path) => {
    const info = lstatSync(path)
    const rel = relative(root, path).split(sep).join('/')
    invariant(!info.isSymbolicLink(), `${label} contains a symbolic link:${rel}`)
    if (info.isDirectory()) for (const name of readdirSync(path).sort()) visit(join(path, name))
    else invariant(info.isFile() && info.nlink === 1, `${label} contains an unsupported or aliased entry:${rel}`)
  }
  visit(target)
  return top
}

function surfaceTreeInventory(root, target, label) {
  const top = assertSafeSurfaceTree(root, target, label)
  invariant(top.isDirectory(), `${label} must be a directory`)
  const files = []
  const visit = (directory) => {
    const names = readdirSync(directory).sort()
    invariant(names.length > 0, `${label} contains an unshippable empty directory:${relative(target, directory).split(sep).join('/') || '.'}`)
    for (const name of names) {
      const absolute = join(directory, name)
      const info = lstatSync(absolute)
      if (info.isDirectory()) visit(absolute)
      else files.push({
        path: relative(target, absolute).split(sep).join('/'),
        mode: (info.mode & 0o777).toString(8),
        sha256: sha256(readFileSync(absolute)),
      })
    }
  }
  visit(target)
  invariant(files.length > 0, `${label} must contain at least one locked file`)
  return files
}

function lockedArtifactTree(authority, artifactRootValue, label) {
  const artifactRoot = normalizeRepositoryRelative(artifactRootValue, `${label} root`)
  const root = nestedPath(authority.forkRoot, artifactRoot, `${label} root`).absolute
  const files = surfaceTreeInventory(authority.forkRoot, root, label)
  for (const file of files) {
    const lockedPath = `${artifactRoot}/${file.path}`
    invariant(authority.lockEntries.has(lockedPath), `fork governance lock does not bind ${label} file:${lockedPath}`)
  }
  const lockedFiles = [...authority.lockEntries.keys()].filter(path => path.startsWith(`${artifactRoot}/`)).sort()
  invariant(
    JSON.stringify(lockedFiles) === JSON.stringify(files.map(file => `${artifactRoot}/${file.path}`).sort()),
    `fork governance lock inventory differs from ${label}`,
  )
  return { artifactRoot, root, files }
}

function assertLockedProviderArtifacts(authority, providerId, surface) {
  const instructionArtifact = normalizeRepositoryRelative(surface.instructionArtifact, `fork provider surface manifest.${providerId}.instructionArtifact`)
  const instruction = regularUnaliasedFile(authority.forkRoot, join(authority.forkRoot, instructionArtifact), `${providerId} instruction artifact`)
  invariant(authority.lockEntries.has(instructionArtifact), `fork governance lock does not bind ${providerId} instructionArtifact:${instructionArtifact}`)
  let hook = null
  if (surface.hookArtifact !== null) {
    const hookArtifact = normalizeRepositoryRelative(surface.hookArtifact, `fork provider surface manifest.${providerId}.hookArtifact`)
    hook = regularUnaliasedFile(authority.forkRoot, join(authority.forkRoot, hookArtifact), `${providerId} hook artifact`)
    invariant(authority.lockEntries.has(hookArtifact), `fork governance lock does not bind ${providerId} hookArtifact:${hookArtifact}`)
  }
  const skills = lockedArtifactTree(authority, surface.skillArtifactRoot, `${providerId} skill artifact tree`)
  const trees = Object.fromEntries(surface.trees.map(tree => [
    tree.name,
    {
      destination: tree.destination,
      ...lockedArtifactTree(authority, tree.artifactRoot, `${providerId} product tree ${tree.name}`),
    },
  ]))
  return { instruction, hook, skills, trees }
}

function assertProjectedProviderArtifacts({ projectionRoot, providerId, surface, artifacts, phase }) {
  const instruction = regularUnaliasedFile(projectionRoot, join(projectionRoot, surface.instructionDestination), `${providerId} ${phase} instruction`)
  invariant(sha256(readFileSync(instruction)) === sha256(readFileSync(artifacts.instruction)), `published ${providerId} instruction differs from its authenticated fork artifact`)
  if (surface.hookDestination !== null) {
    const hook = regularUnaliasedFile(projectionRoot, join(projectionRoot, surface.hookDestination), `${providerId} ${phase} hook config`)
    invariant(artifacts.hook && sha256(readFileSync(hook)) === sha256(readFileSync(artifacts.hook)), `published ${providerId} hook config differs from its authenticated fork artifact`)
  }
  const projectedSkills = surfaceTreeInventory(projectionRoot, join(projectionRoot, surface.skillDestination), `${providerId} ${phase} skill tree`)
  invariant(JSON.stringify(projectedSkills) === JSON.stringify(artifacts.skills.files), `published ${providerId} skills differ from their authenticated fork artifact tree`)
  for (const [name, tree] of Object.entries(artifacts.trees)) {
    const projectedTree = surfaceTreeInventory(projectionRoot, join(projectionRoot, tree.destination), `${providerId} ${phase} product tree ${name}`)
    invariant(JSON.stringify(projectedTree) === JSON.stringify(tree.files), `published ${providerId} product tree ${name} differs from its authenticated fork artifact tree`)
  }
}

function surfaceSource(templateRoot, surface) {
  const source = nestedPath(templateRoot, surface.path, `published provider source ${surface.provider}`).absolute
  const info = assertSafeSurfaceTree(templateRoot, source, `published provider source ${surface.path}`)
  invariant(surface.kind === 'file' ? info.isFile() : info.isDirectory(), `published provider source kind differs from manifest:${surface.path}`)
  return source
}

function copySurface({ templateRoot, mirrorRoot, surface }) {
  const source = surfaceSource(templateRoot, surface)
  const destination = nestedPath(mirrorRoot, surface.path, `published provider destination ${surface.provider}`).absolute
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(source, destination, { recursive: surface.kind === 'tree', errorOnExist: true, force: false })
}

export function copyVerifiedForkManagedSurfaces({ templateRoot, mirrorRoot, authority }) {
  templateRoot = realpathSync(resolve(templateRoot))
  mirrorRoot = realpathSync(resolve(mirrorRoot))
  // Authenticate and compare the complete generated source projection before the first mirror
  // write. A stale template can therefore never leave a partially copied release candidate.
  for (const declaration of authority.declarations) surfaceSource(templateRoot, declaration)
  const commonArtifact = regularUnaliasedFile(authority.forkRoot, join(authority.forkRoot, authority.common.artifact), 'locked common instruction artifact')
  const templateCommon = regularUnaliasedFile(templateRoot, join(templateRoot, authority.common.destination), 'template common instruction')
  invariant(sha256(readFileSync(templateCommon)) === sha256(readFileSync(commonArtifact)), 'published common instruction differs from its authenticated fork artifact')
  for (const provider of authority.providers) {
    const surface = authority.manifest.providerSurfaces[provider.id]
    assertProjectedProviderArtifacts({
      projectionRoot: templateRoot,
      providerId: provider.id,
      surface,
      artifacts: authority.providerArtifacts[provider.id],
      phase: 'template',
    })
  }
  for (const declaration of authority.declarations) copySurface({ templateRoot, mirrorRoot, surface: declaration })
  const commonDestination = join(mirrorRoot, authority.common.destination)
  invariant(sha256(readFileSync(commonDestination)) === sha256(readFileSync(commonArtifact)), 'published common instruction differs from its authenticated fork artifact')
  for (const provider of authority.providers) {
    const surface = authority.manifest.providerSurfaces[provider.id]
    assertProjectedProviderArtifacts({
      projectionRoot: mirrorRoot,
      providerId: provider.id,
      surface,
      artifacts: authority.providerArtifacts[provider.id],
      phase: 'mirrored',
    })
  }
  return authority.declarations
}

export function deriveManagedSurfaceMirrorPolicy(authority) {
  const exactPaths = []
  const pathPrefixes = []
  for (const declaration of authority.declarations) {
    if (declaration.kind === 'file') exactPaths.push(declaration.path)
    else pathPrefixes.push(`${declaration.path}/`)
  }
  return {
    exactPaths: [...new Set(exactPaths)].sort(),
    pathPrefixes: [...new Set(pathPrefixes)].sort(),
    requiredPathPrefixes: [...new Set(pathPrefixes)].sort(),
  }
}

import {
  existsSync,
  globSync,
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export const GOVERNED_WORKSPACE_PACKAGES = Object.freeze([
  '@qijenchen/design-system',
  '@qijenchen/governance',
  '@qijenchen/storybook-config',
])

export const REQUIRED_CONSUMER_ROOT_PACKAGES = Object.freeze([
  '@qijenchen/design-system',
  '@qijenchen/storybook-config',
])

const DEPENDENCY_SECTIONS = Object.freeze([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
])
const LOCK_CANDIDATES = Object.freeze(['package-lock.json', 'npm-shrinkwrap.json'])
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z](?:[0-9A-Za-z.-]*[0-9A-Za-z])?)?(?:\+[0-9A-Za-z](?:[0-9A-Za-z.-]*[0-9A-Za-z])?)?$/

function invariant(condition, message) {
  if (!condition) throw new Error(`WORKSPACE-EXACT-DEPENDENCY-001:${message}`)
}

function compareUtf8Bytes(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}

function exactVersion(value, label) {
  invariant(typeof value === 'string' && EXACT_SEMVER.test(value), `${label} must be exact semver`)
  return value
}

function readJson(path, label = path) {
  let value
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`WORKSPACE-EXACT-DEPENDENCY-001:${label} is not valid JSON:${error.message}`, {
      cause: error,
    })
  }
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be one object`)
  return value
}

function canonicalRelativePath(value, label) {
  invariant(
    typeof value === 'string'
      && value.length > 0
      && value === value.normalize('NFC')
      && !/[\u0000-\u001f\u007f]/.test(value)
      && !value.includes('\\')
      && !isAbsolute(value)
      && value.split('/').every(part => part && part !== '.' && part !== '..'),
    `${label} is not a canonical repository path`,
  )
  return value
}

function containedRegularFile(root, value, label) {
  const path = canonicalRelativePath(value, label)
  const absolute = resolve(root, path)
  const rel = relative(root, absolute)
  invariant(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label} escapes root`)
  const info = lstatSync(absolute)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, `${label} must be one regular no-link file`)
  invariant(realpathSync(absolute) === absolute, `${label} traverses a symbolic-link alias`)
  return Object.freeze({ absolute, relative: rel.split(sep).join('/') })
}

function workspacePatterns(packageJson) {
  const value = Array.isArray(packageJson.workspaces)
    ? packageJson.workspaces
    : packageJson.workspaces?.packages
  invariant(Array.isArray(value) && value.length > 0, 'root package.json must declare workspaces')
  const patterns = value.map((pattern, index) => {
    invariant(
      typeof pattern === 'string'
        && pattern.length > 0
        && pattern === pattern.normalize('NFC')
        && !/[\u0000-\u001f\u007f]/.test(pattern)
        && !pattern.includes('\\')
        && !isAbsolute(pattern)
        && !pattern.startsWith('!')
        && !pattern.split('/').includes('..'),
      `workspaces[${index}] is invalid`,
    )
    return pattern.replace(/\/+$/, '')
  })
  return Object.freeze([...new Set(patterns)].sort(compareUtf8Bytes))
}

export function discoverPackageManifestPaths(rootPath) {
  const root = realpathSync(resolve(rootPath))
  const rootManifest = containedRegularFile(root, 'package.json', 'root package.json')
  const packageJson = readJson(rootManifest.absolute, rootManifest.relative)
  const paths = new Set(['package.json'])

  for (const pattern of workspacePatterns(packageJson)) {
    for (const matched of globSync(`${pattern}/package.json`, { cwd: root })) {
      if (matched.split('/').includes('node_modules')) continue
      const manifest = containedRegularFile(root, matched, `workspace manifest ${matched}`)
      paths.add(manifest.relative)
    }
  }

  invariant(paths.size > 1, 'workspace patterns matched no package manifests')
  return Object.freeze([...paths].sort((left, right) => (
    left === 'package.json' ? -1 : right === 'package.json' ? 1 : compareUtf8Bytes(left, right)
  )))
}

export function discoverDependencyLockPath(rootPath) {
  const root = realpathSync(resolve(rootPath))
  const present = LOCK_CANDIDATES.filter(name => existsSync(resolve(root, name)))
  invariant(present.length === 1, `repository must contain exactly one dependency lock (${LOCK_CANDIDATES.join(' or ')})`)
  return containedRegularFile(root, present[0], present[0]).relative
}

export function discoverReceiverDependencyPaths(rootPath) {
  const manifests = discoverPackageManifestPaths(rootPath)
  const lock = discoverDependencyLockPath(rootPath)
  return Object.freeze([...manifests, lock])
}

function governedDeclarations(packageJson, label) {
  const found = []
  const seen = new Set()
  for (const section of DEPENDENCY_SECTIONS) {
    const dependencies = packageJson[section]
    if (dependencies === undefined) continue
    invariant(dependencies && typeof dependencies === 'object' && !Array.isArray(dependencies), `${label} ${section} must be one object`)
    for (const packageName of GOVERNED_WORKSPACE_PACKAGES) {
      if (!Object.hasOwn(dependencies, packageName)) continue
      invariant(!seen.has(packageName), `${label} declares ${packageName} in more than one dependency section`)
      seen.add(packageName)
      found.push(Object.freeze({ packageName, section, value: dependencies[packageName] }))
    }
  }
  return Object.freeze(found)
}

export function pinExactWorkspaceDependencies(rootPath, expectedVersion) {
  exactVersion(expectedVersion, 'expected version')
  const root = realpathSync(resolve(rootPath))
  const changed = []

  for (const manifestPath of discoverPackageManifestPaths(root)) {
    const absolute = resolve(root, manifestPath)
    const packageJson = readJson(absolute, manifestPath)
    let dirty = false
    for (const declaration of governedDeclarations(packageJson, manifestPath)) {
      if (declaration.value === expectedVersion) continue
      packageJson[declaration.section][declaration.packageName] = expectedVersion
      dirty = true
    }
    if (dirty) {
      writeFileSync(absolute, `${JSON.stringify(packageJson, null, 2)}\n`)
      changed.push(manifestPath)
    }
  }

  // An upgrade transaction bumps only the repository root, so its reconstruction nests the previous
  // release under every workspace that still asked for it. Realigning the manifests above is not
  // enough: `npm install --package-lock-only` then reports "up to date" and leaves those nested
  // entries behind, because npm only adds what is missing — it never prunes a satisfied-but-
  // extraneous node — and the exact-version verification below would fail on a lock nobody can fix
  // by re-running the install. Dropping the off-version nested entries lets that install re-validate
  // against a consistent lock; a workspace that genuinely needs its own copy simply gets it back,
  // and verifyExactWorkspaceDependencies stays the authority either way.
  const lockPath = discoverDependencyLockPath(root)
  const lockAbsolute = resolve(root, lockPath)
  const packageLock = readJson(lockAbsolute, lockPath)
  if (packageLock.packages && typeof packageLock.packages === 'object' && !Array.isArray(packageLock.packages)) {
    const stale = Object.keys(packageLock.packages).filter((entryPath) => (
      GOVERNED_WORKSPACE_PACKAGES.some((packageName) => entryPath.endsWith(`/node_modules/${packageName}`))
      && packageLock.packages[entryPath]?.version !== expectedVersion
    ))
    if (stale.length) {
      for (const entryPath of stale) delete packageLock.packages[entryPath]
      writeFileSync(lockAbsolute, `${JSON.stringify(packageLock, null, 2)}\n`)
      changed.push(lockPath)
    }
  }

  return Object.freeze(changed)
}

export function verifyExactWorkspaceDependencies(rootPath, expectedVersion, {
  requiredRootPackages = REQUIRED_CONSUMER_ROOT_PACKAGES,
} = {}) {
  exactVersion(expectedVersion, 'expected version')
  invariant(
    Array.isArray(requiredRootPackages)
      && requiredRootPackages.length > 0
      && requiredRootPackages.every(name => GOVERNED_WORKSPACE_PACKAGES.includes(name))
      && new Set(requiredRootPackages).size === requiredRootPackages.length,
    'required root package inventory is invalid',
  )
  const root = realpathSync(resolve(rootPath))
  const manifests = discoverPackageManifestPaths(root)
  const lockPath = discoverDependencyLockPath(root)
  const packageLock = readJson(resolve(root, lockPath), lockPath)
  invariant(packageLock.lockfileVersion === 3, `${lockPath} must use lockfileVersion 3`)
  invariant(packageLock.packages && typeof packageLock.packages === 'object' && !Array.isArray(packageLock.packages), `${lockPath} packages map is missing`)

  const declaredPackages = new Set()
  let declarationCount = 0
  for (const manifestPath of manifests) {
    const packageJson = readJson(resolve(root, manifestPath), manifestPath)
    const declarations = governedDeclarations(packageJson, manifestPath)
    if (manifestPath === 'package.json') {
      for (const packageName of requiredRootPackages) {
        invariant(
          packageJson.dependencies?.[packageName] === expectedVersion,
          `root dependencies.${packageName} must equal ${expectedVersion}`,
        )
      }
    }

    const lockKey = manifestPath === 'package.json' ? '' : dirname(manifestPath).split(sep).join('/')
    const lockEntry = packageLock.packages[lockKey]
    invariant(lockEntry && typeof lockEntry === 'object' && !Array.isArray(lockEntry), `${lockPath} is missing workspace entry:${lockKey || '<root>'}`)

    for (const declaration of declarations) {
      declarationCount += 1
      declaredPackages.add(declaration.packageName)
      invariant(
        declaration.value === expectedVersion && EXACT_SEMVER.test(declaration.value),
        `${manifestPath} ${declaration.section}.${declaration.packageName}=${declaration.value}; expected exact ${expectedVersion}`,
      )
      invariant(
        lockEntry[declaration.section]?.[declaration.packageName] === expectedVersion,
        `${lockPath} ${lockKey || '<root>'} ${declaration.section}.${declaration.packageName} is not exact ${expectedVersion}`,
      )
    }
  }

  for (const packageName of [...declaredPackages].sort(compareUtf8Bytes)) {
    const suffix = `node_modules/${packageName}`
    const resolvedEntries = Object.entries(packageLock.packages)
      .filter(([path]) => path === suffix || path.endsWith(`/${suffix}`))
    invariant(resolvedEntries.length > 0, `${lockPath} has no resolved entry for ${packageName}`)
    for (const [path, entry] of resolvedEntries) {
      invariant(entry?.version === expectedVersion, `${lockPath} resolved ${path}=${entry?.version}; expected ${expectedVersion}`)
    }
  }

  invariant(declarationCount >= requiredRootPackages.length, 'no governed package declarations were verified')
  return Object.freeze({
    declarationCount,
    declaredPackages: Object.freeze([...declaredPackages].sort(compareUtf8Bytes)),
    lockPath,
    manifests,
    receiverPaths: discoverReceiverDependencyPaths(root),
  })
}

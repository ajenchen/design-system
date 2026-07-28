import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  closeSync,
  existsSync,
  openSync,
  readSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs'
import { dirname, extname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'

function fail(message) {
  throw new Error(`component dependency source inventory blocked:${message}`)
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function hashRegularFile(absolute, expectedBytes) {
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(64 * 1024)
  const descriptor = openSync(absolute, 'r')
  let bytes = 0
  try {
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null)
      if (count === 0) break
      hash.update(buffer.subarray(0, count))
      bytes += count
    }
  } finally {
    closeSync(descriptor)
  }
  if (bytes !== expectedBytes) fail(`dependency package universe changed while hashing:${absolute}`)
  return hash.digest('hex')
}

// Content-addressed inventories preserve code points exactly and order strings
// by their UTF-8 bytes. Host-locale collation and implicit normalization are
// forbidden because either would make the same source tree hash differently.
export function compareUtf8Bytes(left, right) {
  return Buffer.compare(Buffer.from(String(left), 'utf8'), Buffer.from(String(right), 'utf8'))
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort(compareUtf8Bytes).map((key) => [key, normalize(value[key])]))
}

const canonical = (value) => JSON.stringify(normalize(value))

function updateCanonicalHash(hash, value, arrayElement = false) {
  if (value === undefined) {
    if (arrayElement) hash.update('null')
    return
  }
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) {
      if (arrayElement) hash.update('null')
      return
    }
    hash.update(encoded)
    return
  }
  if (Array.isArray(value)) {
    hash.update('[')
    for (let index = 0; index < value.length; index += 1) {
      if (index) hash.update(',')
      updateCanonicalHash(hash, value[index], true)
    }
    hash.update(']')
    return
  }
  hash.update('{')
  let emitted = false
  for (const key of Object.keys(value).filter((key) => value[key] !== undefined).sort(compareUtf8Bytes)) {
    if (emitted) hash.update(',')
    emitted = true
    hash.update(JSON.stringify(key)).update(':')
    updateCanonicalHash(hash, value[key])
  }
  hash.update('}')
}

function canonicalDigest(value) {
  const hash = createHash('sha256')
  updateCanonicalHash(hash, value)
  return hash.digest('hex')
}

function safeRelativePath(path, label) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0') || isAbsolute(path)
    || path.split('/').some((part) => !part || part === '.' || part === '..')) fail(`${label} is unsafe:${String(path)}`)
  return path
}

function safeFrozenBytes(root, row, label) {
  safeRelativePath(row?.path, label)
  const absolute = resolve(root, row.path)
  const rel = relative(root, absolute)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`${label} escapes repository:${row.path}`)
  let cursor = root
  for (const segment of rel.split(sep)) {
    cursor = resolve(cursor, segment)
    if (!existsSync(cursor) || lstatSync(cursor).isSymbolicLink()) fail(`${label} is missing or crosses a symbolic link:${row.path}`)
  }
  const info = lstatSync(absolute)
  if (!info.isFile() || info.nlink !== 1 || row.kind !== 'file') fail(`${label} is not a frozen unique regular file:${row.path}`)
  const bytes = readFileSync(absolute)
  if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) fail(`${label} differs from frozen manifest:${row.path}`)
  return bytes
}

function importedSpecifiers(source) {
  const values = []
  // Static imports/exports and literal require()/import() are the only closed
  // import graph we can prove without executing project code.
  const patterns = [
    /(?:^|[;\n])\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"\n]+)['"]/g,
    /\b(?:require|import)\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(source))) values.push(match[1])
  }
  return [...new Set(values)].sort(compareUtf8Bytes)
}

function externalPackageName(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/')
  return specifier.split('/')[0]
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json']

function localBase(specifier, importer) {
  if (specifier.startsWith('.')) return posix.normalize(posix.join(posix.dirname(importer), specifier))
  if (specifier.startsWith('@/design-system/')) return `packages/design-system/src/${specifier.slice('@/design-system/'.length)}`
  if (specifier.startsWith('@/lib/')) return `packages/design-system/src/lib/${specifier.slice('@/lib/'.length)}`
  return null
}

function resolveFrozenLocalImport(specifier, importer, inventoryByPath) {
  const base = localBase(specifier, importer)
  if (base === null) return null
  if (base.startsWith('../') || base === '..' || base.startsWith('/')) return { status: 'unresolved', requested: base }
  const candidates = [base]
  if (!SOURCE_EXTENSIONS.includes(extname(base))) {
    for (const extension of SOURCE_EXTENSIONS) candidates.push(`${base}${extension}`)
    for (const extension of SOURCE_EXTENSIONS) candidates.push(`${base}/index${extension}`)
  }
  const matches = candidates.filter((path) => inventoryByPath.get(path)?.kind === 'file')
  return matches.length === 1
    ? { status: 'resolved', path: matches[0] }
    : { status: 'unresolved', requested: base, candidates: matches }
}

function sourceRow({ sourceKind, path, bytes, packageName = null, packageVersion = null, lockfileIntegrity = null, mediaType = 'text' }) {
  const contentSha256 = sha256(bytes)
  const identity = {
    sourceKind,
    path,
    packageName,
    packageVersion,
    lockfileIntegrity,
    mediaType,
    bytes: bytes.length,
    sha256: contentSha256,
  }
  return {
    ...identity,
    sourceId: sha256(canonical(identity)),
    encoding: 'base64',
    content: bytes.toString('base64'),
  }
}

function packageRootPath(packageName) {
  return packageName.startsWith('@')
    ? join('node_modules', ...packageName.split('/'))
    : join('node_modules', packageName)
}

function walkPackage(root, current, rows, findings, packageIdentity) {
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => compareUtf8Bytes(left.name, right.name))) {
    const absolute = join(current, entry.name)
    const rel = relative(root, absolute).split(sep).join('/')
    if (entry.name === 'node_modules' && entry.isDirectory()) continue
    if (entry.isSymbolicLink()) {
      findings.push({
        code: 'dependency-source-symlink',
        packageName: packageIdentity.packageName,
        path: rel,
        reason: 'package source contains an opaque symbolic link',
      })
      continue
    }
    if (entry.isDirectory()) {
      walkPackage(root, absolute, rows, findings, packageIdentity)
      continue
    }
    if (!entry.isFile()) {
      findings.push({
        code: 'dependency-source-unsupported-file',
        packageName: packageIdentity.packageName,
        path: rel,
        reason: 'package source contains a non-regular filesystem entry',
      })
      continue
    }
    const info = lstatSync(absolute)
    if (info.nlink !== 1) fail(`dependency package source is hard-linked:${packageIdentity.packageName}/${rel}`)
    const bytes = readFileSync(absolute)
    const binary = bytes.includes(0)
    if (binary) findings.push({
      code: 'dependency-source-opaque-binary',
      packageName: packageIdentity.packageName,
      path: rel,
      reason: 'package contains bytes that cannot be semantically audited as source or types',
    })
    rows.push(sourceRow({
      sourceKind: 'dependency-source',
      path: `dependency/${packageIdentity.packageName}@${packageIdentity.packageVersion}/${rel}`,
      bytes,
      packageName: packageIdentity.packageName,
      packageVersion: packageIdentity.packageVersion,
      lockfileIntegrity: packageIdentity.lockfileIntegrity,
      mediaType: binary ? 'binary' : 'text',
    }))
  }
}

function packageUniverseRows(packageRoot, packageIdentity, findings, current = packageRoot, rows = []) {
  for (const entry of readdirSync(current, { withFileTypes: true })
    .sort((left, right) => compareUtf8Bytes(left.name, right.name))) {
    const absolute = join(current, entry.name)
    const rel = relative(packageRoot, absolute).split(sep).join('/')
    if (entry.name === 'node_modules' && entry.isDirectory()) continue
    if (entry.isSymbolicLink()) {
      findings.push({
        code: 'dependency-source-symlink',
        packageName: packageIdentity.packageName,
        path: rel,
        reason: 'package source contains an opaque symbolic link',
      })
      rows.push({
        path: `dependency/${packageIdentity.packageName}@${packageIdentity.packageVersion}/${rel}`,
        packageName: packageIdentity.packageName,
        packageVersion: packageIdentity.packageVersion,
        kind: 'symlink',
        bytes: 0,
        sha256: sha256(''),
      })
      continue
    }
    if (entry.isDirectory()) {
      packageUniverseRows(packageRoot, packageIdentity, findings, absolute, rows)
      continue
    }
    if (!entry.isFile()) {
      findings.push({
        code: 'dependency-source-unsupported-file',
        packageName: packageIdentity.packageName,
        path: rel,
        reason: 'package source contains a non-regular filesystem entry',
      })
      continue
    }
    const info = lstatSync(absolute)
    if (info.nlink !== 1) fail(`dependency package universe is hard-linked:${packageIdentity.packageName}/${rel}`)
    rows.push({
      path: `dependency/${packageIdentity.packageName}@${packageIdentity.packageVersion}/${rel}`,
      packageName: packageIdentity.packageName,
      packageVersion: packageIdentity.packageVersion,
      kind: 'file',
      bytes: info.size,
      sha256: hashRegularFile(absolute, info.size),
    })
  }
  return rows
}

function resolveReachablePackagePath(specifier, importer, packageRoot) {
  const base = resolve(dirname(importer), specifier)
  const candidates = [base]
  if (!SOURCE_EXTENSIONS.includes(extname(base))) {
    for (const extension of SOURCE_EXTENSIONS) candidates.push(`${base}${extension}`)
    for (const extension of SOURCE_EXTENSIONS) candidates.push(join(base, `index${extension}`))
  }
  const matches = candidates.filter((candidate) => {
    const rel = relative(packageRoot, candidate)
    return rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
      && existsSync(candidate) && lstatSync(candidate).isFile()
  })
  return matches.length === 1 ? matches[0] : null
}

function walkReachablePackage({
  installedRoot,
  packageRoot,
  packageIdentity,
  specifiers,
  rows,
  findings,
  onTransitiveSpecifier,
}) {
  const queue = []
  const queued = new Set()
  const add = (absolute, reason) => {
    const rel = relative(packageRoot, absolute)
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
      || !existsSync(absolute) || lstatSync(absolute).isSymbolicLink()
      || !lstatSync(absolute).isFile()) {
      findings.push({
        code: 'dependency-reachable-source-unresolved',
        packageName: packageIdentity.packageName,
        path: relative(installedRoot, absolute).split(sep).join('/'),
        reason,
      })
      return
    }
    if (!queued.has(absolute)) {
      queued.add(absolute)
      queue.push(absolute)
      queue.sort((left, right) => compareUtf8Bytes(
        relative(packageRoot, left).split(sep).join('/'),
        relative(packageRoot, right).split(sep).join('/'),
      ))
    }
  }
  const rootRequire = createRequire(resolve(installedRoot, 'package.json'))
  for (const specifier of [...specifiers].sort(compareUtf8Bytes)) {
    try {
      add(rootRequire.resolve(specifier), `static package import cannot be resolved inside its locked package:${specifier}`)
    } catch {
      findings.push({
        code: 'dependency-entrypoint-unresolved',
        packageName: packageIdentity.packageName,
        path: packageRootPath(packageIdentity.packageName).split(sep).join('/'),
        reason: `static package import cannot be resolved from the installed frozen dependency graph:${specifier}`,
      })
    }
  }
  add(resolve(packageRoot, 'package.json'), 'installed package identity source is missing')
  const visited = new Set()
  while (queue.length) {
    const absolute = queue.shift()
    if (visited.has(absolute)) continue
    visited.add(absolute)
    const info = lstatSync(absolute)
    const rel = relative(packageRoot, absolute).split(sep).join('/')
    if (info.nlink !== 1) fail(`dependency reachable source is hard-linked:${packageIdentity.packageName}/${rel}`)
    const bytes = readFileSync(absolute)
    const binary = bytes.includes(0)
    if (binary) findings.push({
      code: 'dependency-source-opaque-binary',
      packageName: packageIdentity.packageName,
      path: rel,
      reason: 'reachable package source contains bytes that cannot be semantically audited as source or types',
    })
    rows.push(sourceRow({
      sourceKind: 'dependency-source',
      path: `dependency/${packageIdentity.packageName}@${packageIdentity.packageVersion}/${rel}`,
      bytes,
      packageName: packageIdentity.packageName,
      packageVersion: packageIdentity.packageVersion,
      lockfileIntegrity: packageIdentity.lockfileIntegrity,
      mediaType: binary ? 'binary' : 'text',
    }))
    if (binary || !/\.(?:[cm]?[jt]sx?|json)$/.test(absolute)) continue
    const source = bytes.toString('utf8')
    const literalSpecifiers = importedSpecifiers(source)
    const literalInvocationCount = [...source.matchAll(/\b(?:require|import)\s*\(/g)].length
    const literalCallCount = [...source.matchAll(
      /\b(?:require|import)\s*\(\s*['"][^'"\n]+['"]\s*\)/g,
    )].length
    if (literalInvocationCount > literalCallCount) {
      findings.push({
        code: 'dependency-dynamic-import-unresolved',
        packageName: packageIdentity.packageName,
        path: rel,
        reason: 'reachable dependency source contains a non-literal module load; exact transitive applicability is unverifiable',
      })
    }
    for (const specifier of literalSpecifiers) {
      if (specifier.startsWith('node:')) continue
      if (specifier.startsWith('.')) {
        const resolved = resolveReachablePackagePath(specifier, absolute, packageRoot)
        if (resolved) add(resolved, `reachable relative package import is unsafe:${specifier}`)
        else findings.push({
          code: 'dependency-relative-import-unresolved',
          packageName: packageIdentity.packageName,
          path: rel,
          reason: `reachable relative package import cannot be resolved uniquely:${specifier}`,
        })
      } else if (externalPackageName(specifier) === packageIdentity.packageName) {
        try {
          const resolved = createRequire(absolute).resolve(specifier)
          add(resolved, `reachable package self-import escapes its locked package:${specifier}`)
        } catch {
          findings.push({
            code: 'dependency-self-import-unresolved',
            packageName: packageIdentity.packageName,
            path: rel,
            reason: `reachable package self-import cannot be resolved:${specifier}`,
          })
        }
      } else if (!specifier.startsWith('#')) {
        const accepted = onTransitiveSpecifier?.(specifier, absolute) === true
        if (!accepted) findings.push({
          code: 'dependency-transitive-package-unresolved',
          packageName: packageIdentity.packageName,
          path: rel,
          reason: `reachable source imports another package whose exact closure cannot be resolved from the frozen lock graph:${specifier}`,
        })
      }
    }
  }
}

function canonicalFinding(finding) {
  return {
    code: finding.code,
    packageName: finding.packageName ?? null,
    path: finding.path,
    reason: finding.reason,
  }
}

/**
 * Builds the exact source corpus needed to compare a component's public
 * claims with its implementation and the third-party behavior it wraps.
 * Installed dependency bytes remain promotion-ineligible until a managed CI
 * dependency-bundle attestation binds this inventory digest.
 */
export function buildComponentDependencySourceInventory({ repoRoot, manifest, component, dependencyRoot = repoRoot } = {}) {
  const root = realpathSync(resolve(repoRoot))
  const installedRoot = realpathSync(resolve(dependencyRoot))
  const record = manifest?.components?.find((item) => item.name === component)
  if (!record) fail(`component is absent from frozen manifest:${String(component)}`)
  const inventoryByPath = new Map(manifest.inventory.map((row) => [row.path, row]))
  const queue = record.paths
    .filter((path) => /\.(?:[cm]?[jt]sx?|json)$/.test(path)
      && !/(?:\.stories\.|\.spec\.|\.test\.|__tests__\/)/.test(path))
    .sort(compareUtf8Bytes)
  const visited = new Set()
  const externalSpecifiers = new Map()
  const claimOnlyExternalSpecifiers = new Map()
  const findings = []
  const rows = []

  // Claim-bearing docs are part of the corpus even when they contain no
  // imports; this lets every citation bind the exact claim-source bytes.
  for (const path of record.paths
    .filter((value) => /(?:\.spec\.md|\.stories\.tsx|(?:^|\/)README\.md|(?:^|\/)index\.(?:ts|tsx))$/.test(value))
    .sort(compareUtf8Bytes)) {
    const row = inventoryByPath.get(path)
    if (!row || row.kind !== 'file') fail(`claim source is not a frozen file:${path}`)
    const bytes = safeFrozenBytes(root, row, 'component claim/support source')
    rows.push(sourceRow({ sourceKind: 'claim-source', path, bytes }))
    for (const specifier of importedSpecifiers(bytes.toString('utf8'))) {
      if (specifier.startsWith('.') || specifier.startsWith('node:') || specifier.startsWith('#')
        || localBase(specifier, path) !== null) continue
      const packageName = externalPackageName(specifier)
      if (!claimOnlyExternalSpecifiers.has(packageName)) claimOnlyExternalSpecifiers.set(packageName, new Set())
      claimOnlyExternalSpecifiers.get(packageName).add(specifier)
    }
  }

  while (queue.length) {
    const path = queue.shift()
    if (visited.has(path)) continue
    visited.add(path)
    const row = inventoryByPath.get(path)
    if (!row || row.kind !== 'file') {
      findings.push({ code: 'local-import-not-frozen', path, reason: 'local import is absent from the PR-head frozen manifest' })
      continue
    }
    const bytes = safeFrozenBytes(root, row, 'component implementation/support source')
    if (!rows.some((item) => item.path === path)) rows.push(sourceRow({ sourceKind: 'repository-source', path, bytes }))
    for (const specifier of importedSpecifiers(bytes.toString('utf8'))) {
      const local = resolveFrozenLocalImport(specifier, path, inventoryByPath)
      if (local?.status === 'resolved') {
        if (!visited.has(local.path)) queue.push(local.path)
      } else if (local?.status === 'unresolved') {
        findings.push({
          code: 'local-import-unresolved',
          path,
          reason: `static local import cannot be resolved uniquely from frozen PR-head bytes:${specifier}`,
        })
      } else if (!specifier.startsWith('node:') && !specifier.startsWith('#')) {
        const packageName = externalPackageName(specifier)
        if (!externalSpecifiers.has(packageName)) externalSpecifiers.set(packageName, new Set())
        externalSpecifiers.get(packageName).add(specifier)
      }
    }
    queue.sort(compareUtf8Bytes)
  }

  let lockfile = null
  const lockRow = inventoryByPath.get('package-lock.json')
  const allExternalPackageNames = new Set([
    ...externalSpecifiers.keys(),
    ...claimOnlyExternalSpecifiers.keys(),
  ])
  if (allExternalPackageNames.size) {
    if (!lockRow || lockRow.kind !== 'file') fail('external component imports require a frozen package-lock.json')
    const lockBytes = safeFrozenBytes(root, lockRow, 'dependency lockfile')
    try { lockfile = JSON.parse(lockBytes) } catch (error) { fail(`dependency lockfile is invalid JSON:${error.message}`) }
    if (![2, 3].includes(lockfile.lockfileVersion) || !lockfile.packages || typeof lockfile.packages !== 'object') {
      fail('dependency lockfile lacks a closed npm package inventory')
    }
  }

  const packages = []
  const sourceDispositions = []
  const packageQueue = [...allExternalPackageNames].sort(compareUtf8Bytes)
  const processedPackages = new Set()
  while (packageQueue.length) {
    const packageName = packageQueue.shift()
    if (processedPackages.has(packageName)) continue
    processedPackages.add(packageName)
    const lockPath = packageRootPath(packageName).split(sep).join('/')
    const lock = lockfile.packages[lockPath]
    if (!lock || typeof lock.version !== 'string' || !lock.version) {
      findings.push({ code: 'dependency-lock-entry-missing', packageName, path: 'package-lock.json', reason: 'direct external import lacks an exact installed lockfile entry' })
      continue
    }
    const integrity = typeof lock.integrity === 'string' && /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(lock.integrity)
      ? lock.integrity
      : null
    if (!integrity) findings.push({
      code: 'dependency-lock-integrity-missing',
      packageName,
      path: 'package-lock.json',
      reason: 'exact package version is present but registry integrity is absent; package bytes cannot be trusted for verification',
    })
    const packageRoot = resolve(installedRoot, lockPath)
    const rel = relative(installedRoot, packageRoot)
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
      || !existsSync(packageRoot) || lstatSync(packageRoot).isSymbolicLink() || !lstatSync(packageRoot).isDirectory()) {
      findings.push({ code: 'dependency-source-missing', packageName, path: lockPath, reason: 'exact installed package source is missing or not a real directory' })
      continue
    }
    let packageJson
    try { packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) } catch {
      findings.push({ code: 'dependency-package-json-invalid', packageName, path: `${lockPath}/package.json`, reason: 'installed package identity cannot be decoded' })
      continue
    }
    if (packageJson.name !== packageName || packageJson.version !== lock.version) {
      findings.push({ code: 'dependency-installed-version-mismatch', packageName, path: `${lockPath}/package.json`, reason: 'installed package name/version differs from the frozen lockfile' })
      continue
    }
    const packageRows = []
    const packageFindings = []
    const packageIdentity = {
      packageName,
      packageVersion: lock.version,
      lockfileIntegrity: integrity,
    }
    const runtimeRelevant = externalSpecifiers.has(packageName)
    if (runtimeRelevant) {
      walkReachablePackage({
        installedRoot,
        packageRoot,
        packageIdentity,
        specifiers: externalSpecifiers.get(packageName),
        rows: packageRows,
        findings: packageFindings,
        onTransitiveSpecifier(specifier) {
          const transitivePackage = externalPackageName(specifier)
          const transitiveLockPath = packageRootPath(transitivePackage).split(sep).join('/')
          if (!lockfile.packages[transitiveLockPath]) return false
          if (!externalSpecifiers.has(transitivePackage)) externalSpecifiers.set(transitivePackage, new Set())
          externalSpecifiers.get(transitivePackage).add(specifier)
          if (!processedPackages.has(transitivePackage) && !packageQueue.includes(transitivePackage)) {
            packageQueue.push(transitivePackage)
            packageQueue.sort(compareUtf8Bytes)
          }
          return true
        },
      })
      if (!packageRows.length) packageFindings.push({ code: 'dependency-source-empty', packageName, path: lockPath, reason: 'installed package contains no auditable reachable source/type bytes' })
    }
    const universe = packageUniverseRows(packageRoot, packageIdentity, packageFindings)
      .sort((left, right) => compareUtf8Bytes(left.path, right.path))
    const materializedPaths = new Set(packageRows.map((row) => row.path))
    const reachabilityUnknown = packageFindings.some((finding) => [
      'dependency-dynamic-import-unresolved',
      'dependency-relative-import-unresolved',
      'dependency-self-import-unresolved',
      'dependency-reachable-source-unresolved',
      'dependency-entrypoint-unresolved',
      'dependency-transitive-package-unresolved',
    ].includes(finding.code))
    for (const row of universe) {
      const materialized = materializedPaths.has(row.path)
      sourceDispositions.push({
        ...row,
        disposition: materialized
          ? 'materialized-reachable'
          : (!runtimeRelevant || !reachabilityUnknown ? 'not-applicable' : 'unknown'),
        reason: materialized
          ? 'reachable-from-frozen-component-runtime-entry-via-static-import-closure'
          : !runtimeRelevant
            ? 'referenced-only-by-claim-presentation-or-story-source-not-component-runtime'
            : reachabilityUnknown
              ? 'reachable-package-contains-unresolved-dynamic-or-conditional-edge'
              : 'not-reachable-from-frozen-component-runtime-entry-static-import-closure',
      })
    }
    packageRows.sort((left, right) => compareUtf8Bytes(left.path, right.path)
      || compareUtf8Bytes(left.sourceId, right.sourceId))
    rows.push(...packageRows)
    findings.push(...packageFindings)
    const rowDigest = sha256(canonical(packageRows.map(({ content, ...row }) => row)))
    packages.push({ packageName, version: lock.version, integrity, sourceCount: packageRows.length, sourceDigest: rowDigest })
  }

  packages.sort((left, right) => compareUtf8Bytes(left.packageName, right.packageName))
  rows.sort((left, right) => compareUtf8Bytes(left.path, right.path) || compareUtf8Bytes(left.sourceId, right.sourceId))
  if (new Set(rows.map((row) => row.path)).size !== rows.length || new Set(rows.map((row) => row.sourceId)).size !== rows.length) {
    fail('component dependency source inventory contains duplicate path/source identities')
  }
  const orderedFindings = findings.map(canonicalFinding).sort((left, right) => compareUtf8Bytes(canonical(left), canonical(right)))
  const digestRows = rows.map(({ content, ...row }) => row)
  sourceDispositions.sort((left, right) => compareUtf8Bytes(left.path, right.path))
  if (new Set(sourceDispositions.map((row) => row.path)).size !== sourceDispositions.length) {
    fail('component dependency source disposition universe contains duplicate paths')
  }
  const dispositionSummary = {
    universeCount: sourceDispositions.length,
    materializedReachableCount: sourceDispositions
      .filter((row) => row.disposition === 'materialized-reachable').length,
    notApplicableCount: sourceDispositions.filter((row) => row.disposition === 'not-applicable').length,
    unknownCount: sourceDispositions.filter((row) => row.disposition === 'unknown').length,
  }
  if (dispositionSummary.materializedReachableCount
      + dispositionSummary.notApplicableCount
      + dispositionSummary.unknownCount !== dispositionSummary.universeCount
    || dispositionSummary.materializedReachableCount !== rows
      .filter((row) => row.sourceKind === 'dependency-source').length) {
    fail('component dependency source disposition universe does not close exactly')
  }
  const sourceDispositionDigest = canonicalDigest(sourceDispositions)
  const dependencySourceInventoryDigest = canonicalDigest({
    component,
    packages,
    rows: digestRows,
    findings: orderedFindings,
    sourceDispositions,
    dispositionSummary,
    sourceDispositionDigest,
  })
  return {
    schemaVersion: 2,
    evidenceKind: 'component-dependency-source-inventory',
    component,
    status: orderedFindings.length ? 'unverifiable' : 'verified',
    lockfileSha256: lockRow?.sha256 ?? null,
    packages,
    sourceCount: rows.length,
    dependencySourceInventoryDigest,
    findings: orderedFindings,
    dispositionSummary,
    sourceDispositionDigest,
    sourceDispositions,
    sources: rows,
  }
}

export function dependencySourceInventoryDigestRows(inventory) {
  if (!inventory || inventory.evidenceKind !== 'component-dependency-source-inventory' || !Array.isArray(inventory.sources)) {
    fail('dependency source inventory is invalid')
  }
  return inventory.sources.map(({ content, ...row }) => row)
}

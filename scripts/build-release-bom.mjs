#!/usr/bin/env node
// Build or read-only verify the manifest for the exact npm archives in a release.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { TRUSTED_UPGRADE_POLICY, validateUpgradeTrustPolicy } from './verify-upgrade-provenance.mjs'
import {
  RELEASE_BOM_SCHEMA_VERSION,
  RELEASE_SUPPLY_CHAIN,
  assertReleaseBomSchemaMirror,
  validateReleaseBom,
} from './release-bom-contract.mjs'
import {
  PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET,
  validateProductTemplateScaffoldLock,
} from './product-template-scaffold-lock.mjs'
import {
  loadConsumerUpgradeProtocol,
  protocolSourceDigests,
  validateProtocolLock,
} from '../infra/governance/lib/consumer-upgrade-protocol.mjs'
import {
  assertClosedGitLocalConfiguration,
  runClosedGit,
} from './lib/closed-tool-execution.mjs'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

assertReleaseBomSchemaMirror()

const argv = process.argv.slice(2)
const has = (name) => argv.includes(name)
const value = (name, fallback) => {
  const index = argv.indexOf(name)
  if (index < 0) return fallback
  if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`${name} requires a value`)
  return argv[index + 1]
}
const knownOptions = new Set([
  '--repo', '--artifacts', '--output', '--bom', '--tag', '--git-head', '--git-tree',
  '--repository', '--main-ref', '--verify', '--require-clean', '--require-release-ref',
  '--require-sbom', '--allow-workflow-dispatch', '--allow-repository-dispatch',
])
for (const argument of argv) {
  if (argument.startsWith('--') && !knownOptions.has(argument)) throw new Error(`unknown option: ${argument}`)
}

const root = resolve(value('--repo', process.cwd()))
const artifacts = resolve(value('--artifacts', join(root, 'release-artifacts')))
const output = resolve(value('--output', join(artifacts, 'release-bom.json')))
const bomPath = resolve(value('--bom', output))
const verifyOnly = has('--verify')
const requireSbom = has('--require-sbom')
const canonicalBomPath = join(artifacts, 'release-bom.json')
if ((!verifyOnly && output !== canonicalBomPath) || (verifyOnly && bomPath !== canonicalBomPath)) {
  throw new Error('release BOM must be release-bom.json inside the canonical artifacts directory')
}
const artifactsStat = lstatSync(artifacts, { throwIfNoEntry: false })
if (!artifactsStat) {
  const action = verifyOnly
    ? 'release verification requires an existing immutable release candidate'
    : 'release BOM generation requires prebuilt package archives'
  throw new Error(`${action}; release artifacts directory is missing: ${artifacts}`)
}
if (!artifactsStat.isDirectory() || artifactsStat.isSymbolicLink() || realpathSync(artifacts) !== artifacts) {
  throw new Error(`release artifacts path must be a canonical real directory: ${artifacts}`)
}
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const fileBuffer = (path) => readFileSync(path)
const digest = (algorithm, body) => createHash(algorithm).update(body).digest()
const sha1 = (body) => digest('sha1', body).toString('hex')
const sha256 = (body) => digest('sha256', body).toString('hex')
const sha512Sri = (body) => `sha512-${digest('sha512', body).toString('base64')}`
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
const canonicalJson = (value) => JSON.stringify(value, null, 2) + '\n'
assertClosedGitLocalConfiguration(root)
const runGit = (args, options = {}) => {
  const result = runClosedGit(args, {
    cwd: root,
    maxOutputBytes: 16 * 1024 * 1024,
    timeoutMs: 15_000,
  })
  if (result.error || result.signal !== null || result.status !== 0) {
    if (options.allowFailure) return ''
    throw new Error(`release closed Git read failed:${args[0]}:${String(result.stderr || result.error?.message || `exit ${result.status}`).trim()}`)
  }
  return result.stdout.trim()
}
const gitOk = (args) => {
  const result = runClosedGit(args, { cwd: root, output: 'ignore', timeoutMs: 15_000 })
  return !result.error && result.signal === null && result.status === 0
}
const repositorySlug = (() => {
  const explicit = value('--repository', process.env.GITHUB_REPOSITORY)
  if (explicit) return explicit.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')
  const remote = runGit(['remote', 'get-url', 'origin'], { allowFailure: true })
  const match = remote.match(/github\.com(?::|\/)([^/]+\/[^/]+?)(?:\.git)?$/)
  if (!match) throw new Error('cannot derive GitHub repository; pass --repository owner/repo')
  return match[1]
})()
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositorySlug)) {
  throw new Error(`invalid GitHub repository slug: ${repositorySlug}`)
}
if (repositorySlug !== TRUSTED_UPGRADE_POLICY.repository) {
  throw new Error(`release provenance repository must be ${TRUSTED_UPGRADE_POLICY.repository}`)
}
const expectedRepositoryUrl = `git+https://github.com/${repositorySlug}.git`

const packageSources = [
  ['@qijenchen/design-system', 'packages/design-system/package.json', [
    'package/dist/index.js',
    'package/dist/components/Button/index.js',
    'package/ds-canonical/fork/governance.lock',
  ]],
  ['@qijenchen/storybook-config', 'packages/storybook-config/package.json', [
    'package/dist/preview.js',
    'package/dist/addons-preset.js',
  ]],
  ['@qijenchen/governance', 'packages/governance/package.json', [
    'package/bin/governance.mjs',
    'package/canonical/manifest.json',
    'package/canonical/schemas/attestation.schema.json',
    'package/src/closed-tool-execution.mjs',
  ]],
]
const exactSemver = /^\d+\.\d+\.\d+(?:-(?:beta|next|rc)\.\d+)?$/

function readEmbeddedManifest(archive) {
  let listing
  try {
    listing = execFileSync('tar', ['-tzf', archive], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).split(/\r?\n/).filter(Boolean)
  } catch {
    throw new Error(`invalid npm tarball (gzip/tar listing failed): ${archive}`)
  }
  if (!listing.length) throw new Error(`invalid npm tarball (empty archive): ${archive}`)
  if (new Set(listing.map((entry) => entry.replace(/^\.\//, ''))).size !== listing.length) {
    throw new Error(`invalid npm tarball (duplicate archive entries): ${archive}`)
  }
  let verboseListing
  try {
    verboseListing = execFileSync('tar', ['-tvzf', archive], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).split(/\r?\n/).filter(Boolean)
  } catch {
    throw new Error(`invalid npm tarball (verbose listing failed): ${archive}`)
  }
  if (verboseListing.some((line) => /^[lh]/.test(line))) {
    throw new Error(`invalid npm tarball (symlink/hardlink entries are forbidden): ${archive}`)
  }
  for (const entry of listing) {
    const normalized = entry.replace(/^\.\//, '')
    if (!normalized.startsWith('package/') || normalized.includes('\\') || normalized.split('/').includes('..')) {
      throw new Error(`invalid npm tarball path outside package/: ${entry}`)
    }
  }
  if (listing.filter((entry) => entry.replace(/^\.\//, '') === 'package/package.json').length !== 1) {
    throw new Error(`invalid npm tarball: expected exactly one package/package.json in ${archive}`)
  }
  let body
  try {
    body = execFileSync('tar', ['-xOzf', archive, 'package/package.json'], {
      maxBuffer: 2 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    throw new Error(`invalid npm tarball (cannot read package/package.json): ${archive}`)
  }
  try {
    return {
      body,
      manifest: JSON.parse(body.toString('utf8')),
      entries: new Set(listing.map((entry) => entry.replace(/^\.\//, ''))),
      entryCount: listing.length,
    }
  } catch {
    throw new Error(`invalid npm tarball (package/package.json is not JSON): ${archive}`)
  }
}

const packages = packageSources.map(([expectedName, sourcePath, requiredEntries]) => {
  const sourceAbsolute = join(root, sourcePath)
  const sourceBody = fileBuffer(sourceAbsolute)
  const source = JSON.parse(sourceBody.toString('utf8'))
  if (source.name !== expectedName) throw new Error(`${sourcePath}: expected name ${expectedName}, got ${source.name}`)
  if (!exactSemver.test(source.version)) throw new Error(`${sourcePath}: release version is not an allowed exact semver: ${source.version}`)
  if (source.private === true) throw new Error(`${sourcePath}: publishable package cannot be private`)
  if (source.publishConfig?.provenance === false) throw new Error(`${sourcePath}: npm provenance cannot be disabled`)
  if (source.repository?.type !== 'git' || source.repository?.url !== expectedRepositoryUrl) {
    throw new Error(`${sourcePath}: repository must be {type:"git",url:"${expectedRepositoryUrl}"} for npm OIDC provenance`)
  }
  const file = `${source.name.replace(/^@/, '').replaceAll('/', '-')}-${source.version}.tgz`
  const absolute = join(artifacts, file)
  let stats
  try {
    stats = lstatSync(absolute)
  } catch {
    throw new Error(`release artifact is missing: ${file}`)
  }
  if (!stats.isFile() || stats.isSymbolicLink() || realpathSync(absolute) !== absolute || stats.size === 0) {
    throw new Error(`release artifact must be a non-empty regular file (no symlink): ${file}`)
  }
  const archiveBefore = fileBuffer(absolute)
  const embedded = readEmbeddedManifest(absolute)
  if (stable(embedded.manifest) !== stable(source)) {
    throw new Error(`${file}: embedded package/package.json does not exactly match ${sourcePath}`)
  }
  if (embedded.manifest.name !== expectedName || embedded.manifest.version !== source.version) {
    throw new Error(`${file}: embedded package identity mismatch`)
  }
  for (const requiredEntry of requiredEntries) {
    if (!embedded.entries.has(requiredEntry)) throw new Error(`${file}: required publish entry is missing: ${requiredEntry}`)
  }
  const archiveBody = fileBuffer(absolute)
  if (archiveBefore.length !== archiveBody.length || sha256(archiveBefore) !== sha256(archiveBody)) {
    throw new Error(`${file}: archive changed while it was being verified`)
  }
  return {
    name: source.name,
    version: source.version,
    file,
    size: stats.size,
    entryCount: embedded.entryCount,
    shasum: sha1(archiveBody),
    sha256: sha256(archiveBody),
    integrity: sha512Sri(archiveBody),
    packageJsonSha256: sha256(embedded.body),
    sourceManifest: sourcePath,
    sourceManifestSha256: sha256(sourceBody),
  }
})

const versions = new Set(packages.map((item) => item.version))
if (versions.size !== 1) throw new Error(`release packages are not on one version train: ${[...versions].join(', ')}`)
const releaseVersion = packages[0].version
const tag = value('--tag', process.env.GITHUB_REF_NAME || `v${releaseVersion}`)
if (tag !== `v${releaseVersion}`) throw new Error(`tag/version mismatch: tag=${tag}, version=${releaseVersion}`)

const releaseSurfaces = {
  'plugin.json': readJson(join(root, '.claude-plugin/plugin.json')).version,
  'marketplace.metadata': readJson(join(root, '.claude-plugin/marketplace.json')).metadata?.version,
  'marketplace.plugin': readJson(join(root, '.claude-plugin/marketplace.json')).plugins?.find((item) => item.name === 'design-system')?.version,
}
for (const [surface, surfaceVersion] of Object.entries(releaseSurfaces)) {
  if (surfaceVersion !== releaseVersion) throw new Error(`${surface} version mismatch: ${surfaceVersion} != ${releaseVersion}`)
}

const expectedTarballs = new Set(packages.map((item) => item.file))
const expectedBeforeBom = [...expectedTarballs, 'release.sbom.cdx.json', PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET].sort()
const expectedComplete = [...expectedBeforeBom, 'release-bom.json'].sort()
const actualEntries = readdirSync(artifacts, { withFileTypes: true }).sort((a, b) => compareUtf8Bytes(a.name, b.name))
for (const entry of actualEntries) {
  const absolute = join(artifacts, entry.name)
  const stats = lstatSync(absolute)
  if (!entry.isFile() || entry.isSymbolicLink() || !stats.isFile() || stats.isSymbolicLink() || realpathSync(absolute) !== absolute) {
    throw new Error(`release directory entry must be a regular file (no directory/symlink): ${entry.name}`)
  }
}
const actualNames = actualEntries.map((entry) => entry.name)
const expectedNames = verifyOnly ? expectedComplete : expectedBeforeBom
if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
  throw new Error(`release directory must contain exactly ${expectedNames.length} allowlisted files; expected [${expectedNames.join(', ')}], got [${actualNames.join(', ')}]`)
}

const sbomFile = 'release.sbom.cdx.json'
let sbom = null
const sbomPath = join(artifacts, sbomFile)
if (requireSbom) {
  const body = fileBuffer(sbomPath)
  const document = JSON.parse(body.toString('utf8'))
  if (document.bomFormat !== 'CycloneDX' || !/^1\.[4-9]$/.test(document.specVersion || '')) {
    throw new Error(`${sbomFile}: expected CycloneDX 1.4+ JSON`)
  }
  const purls = new Set((document.components || []).map((component) => component.purl))
  for (const item of packages) {
    const purl = `pkg:npm/${encodeURIComponent(item.name).replace('%2F', '/')}@${item.version}`
    if (!purls.has(purl)) throw new Error(`${sbomFile}: missing exact release component ${purl}`)
  }
  sbom = { file: sbomFile, size: body.length, sha256: sha256(body) }
}

const controlPlaneLockPath = join(root, 'governance/control-plane.lock.json')
const consumerLockPath = join(root, 'template/ds-product-template/governance/lock.json')
const forkLockPath = join(root, 'packages/design-system/ds-canonical/fork/governance.lock')
const scaffoldLockPath = join(artifacts, PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET)
const controlPlaneLockBody = fileBuffer(controlPlaneLockPath)
const consumerLockBody = fileBuffer(consumerLockPath)
const forkLockBody = fileBuffer(forkLockPath)
const scaffoldLockBody = fileBuffer(scaffoldLockPath)
const controlPlaneLock = JSON.parse(controlPlaneLockBody.toString('utf8'))
const consumerLock = JSON.parse(consumerLockBody.toString('utf8'))
const forkLock = JSON.parse(forkLockBody.toString('utf8'))
const scaffoldLock = validateProductTemplateScaffoldLock(JSON.parse(scaffoldLockBody.toString('utf8')))
if (controlPlaneLock.role !== 'ds-author' || !controlPlaneLock.contractDigest || !controlPlaneLock.snapshotDigest) {
  throw new Error('governance/control-plane.lock.json is not a valid ds-author control-plane lock')
}
if (controlPlaneLock._provenance?.generatorVersion !== releaseVersion) {
  throw new Error(`control-plane generator version is not aligned to ${releaseVersion}`)
}
if (consumerLock.role !== 'template-consumer') throw new Error('template consumer governance lock has the wrong role')
if (consumerLock.release?.designSystem !== releaseVersion || consumerLock.release?.storybookConfig !== releaseVersion) {
  throw new Error(`template consumer governance lock is not aligned to ${releaseVersion}`)
}
validateUpgradeTrustPolicy(consumerLock.upgradeTrust)
const consumerUpgradeProtocolPath = join(root, 'infra/governance/consumer-upgrade-protocol.json')
const consumerUpgradeProtocolSchemaPath = join(root, 'infra/governance/schemas/consumer-upgrade-protocol.schema.json')
const consumerUpgradeProtocolImplementationPath = join(root, 'infra/governance/lib/consumer-upgrade-protocol.mjs')
const consumerUpgradeProtocol = loadConsumerUpgradeProtocol(
  consumerUpgradeProtocolPath,
  consumerUpgradeProtocolSchemaPath,
  consumerUpgradeProtocolImplementationPath,
)
validateProtocolLock(consumerLock.upgradeProtocol, consumerUpgradeProtocol.protocol, protocolSourceDigests(consumerUpgradeProtocol))
if (!Array.isArray(forkLock.entries) || forkLock.entries.length === 0) {
  throw new Error('fork governance corpus lock is empty or invalid')
}
if (scaffoldLock.releaseVersion !== releaseVersion) {
  throw new Error(`product-template scaffold lock is not aligned to ${releaseVersion}`)
}

const gitCommit = value('--git-head', process.env.GITHUB_SHA || runGit(['rev-parse', 'HEAD']))
const gitTree = value('--git-tree', runGit(['rev-parse', `${gitCommit}^{tree}`]))
if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(gitCommit) || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(gitTree)) {
  throw new Error('git head/tree must be full hexadecimal object IDs')
}
const actualTree = runGit(['rev-parse', `${gitCommit}^{tree}`])
if (actualTree !== gitTree) throw new Error(`git tree mismatch: ${gitTree} != ${actualTree}`)

if (has('--require-clean')) {
  if (
    !gitOk(['diff', '--quiet', '--no-ext-diff', '--no-textconv'])
    || !gitOk(['diff', '--cached', '--quiet', '--no-ext-diff', '--no-textconv'])
  ) {
    throw new Error('tracked worktree/index is dirty; refusing release evidence')
  }
}
if (has('--require-release-ref')) {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const githubCommit = process.env.GITHUB_SHA ? runGit(['rev-parse', `${process.env.GITHUB_SHA}^{commit}`]) : null
    const tagEventMatches = process.env.GITHUB_REF_TYPE === 'tag'
      && process.env.GITHUB_REF_NAME === tag
      && githubCommit === gitCommit
    const dispatchMatches = has('--allow-workflow-dispatch')
      && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
      && process.env.RELEASE_DISPATCH_TAG === tag
      && runGit(['rev-parse', 'HEAD^{commit}']) === gitCommit
    const repositoryDispatchMatches = has('--allow-repository-dispatch')
      && process.env.GITHUB_EVENT_NAME === 'repository_dispatch'
      && process.env.GITHUB_REF === 'refs/heads/main'
      && process.env.RELEASE_DISPATCH_TAG === tag
      && runGit(['rev-parse', 'HEAD^{commit}']) === gitCommit
      && githubCommit === runGit(['rev-parse', 'refs/remotes/origin/main^{commit}'])
    if (!tagEventMatches && !dispatchMatches && !repositoryDispatchMatches) {
      throw new Error('GitHub release identity does not match the exact tag event or a guarded protected-default dispatch checkout')
    }
  }
  const tagRef = `refs/tags/${tag}`
  if (!gitOk(['show-ref', '--verify', '--quiet', tagRef])) throw new Error(`release tag does not exist locally: ${tagRef}`)
  const taggedCommit = runGit(['rev-parse', `${tagRef}^{commit}`])
  if (taggedCommit !== gitCommit) throw new Error(`release tag points to ${taggedCommit}, expected ${gitCommit}`)
  const mainRef = value('--main-ref', 'refs/remotes/origin/main')
  if (!gitOk(['show-ref', '--verify', '--quiet', mainRef])) throw new Error(`protected main ref is unavailable: ${mainRef}`)
  if (!gitOk(['merge-base', '--is-ancestor', gitCommit, mainRef])) {
    throw new Error(`release commit ${gitCommit} is not an ancestor of ${mainRef}`)
  }
}

const bom = {
  schemaVersion: RELEASE_BOM_SCHEMA_VERSION,
  releaseVersion,
  npmDistTag: releaseVersion.includes('-') ? releaseVersion.split('-')[1].split('.')[0] : 'latest',
  publishOrder: [
    '@qijenchen/governance',
    '@qijenchen/storybook-config',
    '@qijenchen/design-system',
  ],
  source: {
    repository: repositorySlug,
    repositoryUrl: expectedRepositoryUrl,
    gitCommit,
    gitTree,
    tag,
  },
  supplyChain: RELEASE_SUPPLY_CHAIN,
  packages: packages.sort((a, b) => compareUtf8Bytes(a.name, b.name)),
  governance: {
    controlPlane: {
      path: 'governance/control-plane.lock.json',
      sha256: sha256(controlPlaneLockBody),
      role: controlPlaneLock.role,
      inputDigest: controlPlaneLock.inputDigest,
      contractDigest: controlPlaneLock.contractDigest,
      snapshotDigest: controlPlaneLock.snapshotDigest,
      generatorVersion: controlPlaneLock._provenance?.generatorVersion,
    },
    consumer: {
      path: 'template/ds-product-template/governance/lock.json',
      sha256: sha256(consumerLockBody),
      role: consumerLock.role,
      release: consumerLock.release,
    },
    forkCorpus: {
      path: 'packages/design-system/ds-canonical/fork/governance.lock',
      sha256: sha256(forkLockBody),
    },
    productTemplateScaffold: {
      path: PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET,
      size: scaffoldLockBody.length,
      sha256: sha256(scaffoldLockBody),
      schemaVersion: scaffoldLock.schemaVersion,
      releaseVersion: scaffoldLock.releaseVersion,
      staticTreeSha256: scaffoldLock.staticTreeSha256,
      publishedPathCount: scaffoldLock.publishedPathCount,
    },
  },
  ...(sbom ? { sbom } : {}),
}
validateReleaseBom(bom, { requireSbom })
const expectedBody = canonicalJson(bom)

if (verifyOnly) {
  let actualBody
  try {
    actualBody = readFileSync(bomPath, 'utf8')
  } catch {
    throw new Error(`release BOM is missing: ${bomPath}`)
  }
  if (actualBody !== expectedBody) throw new Error('release BOM differs from the exact canonical release set')
  console.log(`✅ release set verified read-only: ${tag}`)
} else {
  writeFileSync(output, expectedBody, { flag: 'wx' })
  const completedNames = readdirSync(artifacts).sort()
  if (JSON.stringify(completedNames) !== JSON.stringify(expectedComplete)) {
    throw new Error('release BOM write did not produce the exact six-file release set')
  }
  console.log(`✅ release BOM built: ${output}`)
}
for (const item of bom.packages) console.log(`   ${item.name}@${item.version} sha256:${item.sha256} ${item.integrity}`)

#!/usr/bin/env node
// Destructive clean-room fixtures for exact upgrades: success, supply-chain failure, candidate-code
// isolation, and recovery-journal behavior after an uncatchable process interruption.

import {
  chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  linkSync, lstatSync, readlinkSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { hostname, tmpdir } from 'node:os'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { buildCorpus } from './build-fork-governance.mjs'
import { buildPublishedTemplateMirror } from './build-published-template-mirror.mjs'
import { collectProviderMutationPaths, validateInstalledForkCorpus } from './refresh-fork-launchers.mjs'
import { buildDeterministicNpmRuntimeArchive } from './test-fixtures/verified-npm-runtime-archive.mjs'
import {
  PROVIDER_CLI_SYNC_FIXTURE_RECEIPT_KIND,
  PROVIDER_CLI_SYNC_FIXTURE_SHIM_MARKER,
  providerCliFixtureShimBytes,
} from './test-fixtures/provider-cli-sync-lifecycle-fixture.mjs'
import { compareUtf8Bytes, lifecycleSnapshotSha256, providerInventorySha256 } from './lib/provider-lifecycle.mjs'
import { REVIEWED_CONTROL_PLANE_UPDATE_COMMAND } from './lib/consumer-control-plane-policy.mjs'
import { PRODUCT_TEMPLATE_GENERATED_ENTRIES } from './product-template-scaffold-lock.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const TRANSACTION_PATHS = [
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', '.npmrc',
  'governance', 'schemas', '.devcontainer', '.github', 'scripts',
]
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'sync-all-transaction-')))
const npmFixtureControlPath = join(temp, 'npm-fixture-control.json')
// Keep generated corpus scratch inside the outer disposable fixture. A killed test must
// never leave a Git-visible directory in the caller repository.
const corpusTemp = mkdtempSync(join(temp, 'corpus-'))
const repo = join(temp, 'repo')
const writeNpmFixtureControl = (env) => {
  if (!env || !Object.keys(env).some((name) => name.startsWith('FAKE_'))) return
  const fixture = Object.fromEntries(
    Object.entries(env)
      .filter(([name]) => name.startsWith('FAKE_'))
      .sort(([left], [right]) => compareUtf8Bytes(left, right)),
  )
  writeFileSync(npmFixtureControlPath, `${JSON.stringify(fixture)}\n`, { mode: 0o600 })
  chmodSync(npmFixtureControlPath, 0o600)
}
const run = (cmd, args, opts = {}) => {
  if (cmd === 'git') return spawnSync('git', args, { cwd: repo, encoding: 'utf8', ...opts, shell: false })
  if (cmd === process.execPath) {
    writeNpmFixtureControl(opts.env)
    if (args[0] === join(repo, 'scripts/sync-all.mjs')) {
      return spawnSync(process.execPath, ['--', 'scripts/sync-all.mjs', ...args.slice(1)], { cwd: repo, encoding: 'utf8', ...opts, shell: false })
    }
    if (args[0] === join(repo, 'node_modules/.bin/npm-fixture')) {
      return spawnSync(process.execPath, ['--', 'node_modules/.bin/npm-fixture', ...args.slice(1)], { cwd: repo, encoding: 'utf8', ...opts, shell: false })
    }
    throw new Error(`unsupported reviewed Node command:${args[0]}`)
  }
  throw new Error(`unsupported reviewed command:${cmd}`)
}
const must = (result, label) => {
  if (result.status !== 0) throw new Error(`${label} failed(${result.status}):${result.stdout}\n${result.stderr}`)
}
const sha = (content) => createHash('sha256').update(content).digest('hex')
const PROVIDER_CLI_SETUP_DESTINATION = 'scripts/setup-provider-cli-toolchain.mjs'
const providerCliFixtureSourcePath = join(root, 'scripts/test-fixtures/provider-cli-sync-lifecycle-fixture.mjs')
const providerCliFixtureSource = readFileSync(providerCliFixtureSourcePath)
const productionProviderCliSetupSource = readFileSync(join(root, PROVIDER_CLI_SETUP_DESTINATION))
const DEAD_OWNER = Object.freeze({ host: hostname(), pid: 2147483647 })
const pathFingerprint = (path) => {
  if (!existsSync(path)) return null
  const rows = []
  const visit = (absolute, relativePath = '.') => {
    const info = lstatSync(absolute)
    if (info.isSymbolicLink()) throw new Error(`fixture fingerprint encountered symlink:${relativePath}`)
    const mode = (info.mode & 0o777).toString(8).padStart(3, '0')
    if (info.isDirectory()) {
      rows.push(`tree:${relativePath}:${mode}`)
      for (const name of readdirSync(absolute).sort()) visit(join(absolute, name), relativePath === '.' ? name : `${relativePath}/${name}`)
      return
    }
    if (!info.isFile() || info.nlink !== 1) throw new Error(`fixture fingerprint encountered unsupported entry:${relativePath}`)
    rows.push(`file:${relativePath}:${mode}:${sha(readFileSync(absolute))}`)
  }
  visit(path)
  return sha(`${rows.join('\n')}\n`)
}
const withBeforeState = (entry) => ({
  ...entry,
  beforeFingerprint: entry.present ? pathFingerprint(entry.backup) : null,
  afterRecorded: false,
  afterPresent: false,
  afterFingerprint: null,
  replacementStarted: false,
  replacementCompleted: false,
})
const withAfterState = (entry) => {
  const present = existsSync(entry.source)
  return {
    ...entry,
    afterRecorded: true,
    afterPresent: present,
    afterFingerprint: present ? pathFingerprint(entry.source) : null,
    replacementStarted: true,
    replacementCompleted: true,
  }
}
const inventory = (directory) => {
  const rows = []
  const visit = (path) => {
    if (!existsSync(path)) return
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => compareUtf8Bytes(a.name, b.name))) {
      const absolute = join(path, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) rows.push(`${relative(directory, absolute)}:${(statSync(absolute).mode & 0o777).toString(8)}:${sha(readFileSync(absolute))}`)
      else if (entry.isSymbolicLink()) rows.push(`${relative(directory, absolute)}:symlink:${readlinkSync(absolute)}`)
    }
  }
  visit(directory)
  return sha(rows.join('\n') + '\n')
}
const inventoryPaths = (projectRoot, paths) => {
  const rows = []
  const visit = (absolute, label) => {
    if (!existsSync(absolute)) {
      rows.push(`absent:${label}`)
      return
    }
    const info = statSync(absolute)
    const mode = (info.mode & 0o777).toString(8)
    if (info.isFile()) {
      rows.push(`file:${label}:${mode}:${sha(readFileSync(absolute))}`)
      return
    }
    if (!info.isDirectory()) throw new Error(`unsupported provider fixture path:${label}`)
    rows.push(`tree:${label}:${mode}`)
    for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => compareUtf8Bytes(a.name, b.name))) {
      visit(join(absolute, entry.name), `${label}/${entry.name}`)
    }
  }
  for (const path of [...new Set(paths)].sort()) visit(join(projectRoot, path), path)
  return sha(rows.join('\n') + '\n')
}
const providerMutationPaths = () => {
  const manifest = JSON.parse(readFileSync(join(repo, 'node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json'), 'utf8'))
  return [...new Set([
    ...Object.values(manifest.providerSurfaces).flatMap((surface) => surface.managedSurfaces || []).map((surface) => surface.path),
    ...(manifest.providerLifecycle.retiredProviders || []).flatMap((retirement) => retirement.surfaces.map((surface) => surface.path)),
  ])].sort()
}
const parseReport = (result, label) => {
  try { return JSON.parse(result.stdout) }
  catch { throw new Error(`${label} did not emit JSON:${result.stdout}\n${result.stderr}`) }
}
const replaceProviderCliSetupFixture = ({ forkRoot, templateRoot, label }) => {
  const manifestPath = join(forkRoot, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const artifact = manifest.consumer?.managedFiles?.[PROVIDER_CLI_SETUP_DESTINATION]
  if (typeof artifact !== 'string' || !artifact.startsWith('consumer/managed-files/')) {
    throw new Error(`${label} has no authenticated provider CLI setup artifact`)
  }
  const artifactPath = join(forkRoot, artifact)
  if (!readFileSync(artifactPath).equals(productionProviderCliSetupSource)) {
    throw new Error(`${label} provider CLI setup artifact drifted before fixture replacement`)
  }
  const templateSetup = join(templateRoot, PROVIDER_CLI_SETUP_DESTINATION)
  if (existsSync(templateSetup) && !readFileSync(templateSetup).equals(productionProviderCliSetupSource)) {
    throw new Error(`${label} provider CLI template setup drifted before fixture replacement`)
  }

  writeFileSync(artifactPath, providerCliFixtureSource)
  if (existsSync(templateSetup)) writeFileSync(templateSetup, providerCliFixtureSource)

  const corpusLockPath = join(forkRoot, 'governance.lock')
  const corpusLock = JSON.parse(readFileSync(corpusLockPath, 'utf8'))
  const matchingEntries = corpusLock.entries.filter(entry => (
    entry.file === artifact
      && entry.destination === PROVIDER_CLI_SETUP_DESTINATION
  ))
  if (matchingEntries.length !== 1) {
    throw new Error(`${label} provider CLI setup corpus-lock entry is absent or ambiguous`)
  }
  matchingEntries[0].sha256 = sha(providerCliFixtureSource)
  const corpusLockBytes = Buffer.from(`${JSON.stringify(corpusLock, null, 2)}\n`)
  writeFileSync(corpusLockPath, corpusLockBytes)

  const consumerLockPath = join(forkRoot, 'consumer/lock.json')
  const consumerLock = JSON.parse(readFileSync(consumerLockPath, 'utf8'))
  if (consumerLock.payload?.managedFiles?.[PROVIDER_CLI_SETUP_DESTINATION] === undefined) {
    throw new Error(`${label} consumer lock has no provider CLI setup digest`)
  }
  consumerLock.payload.managedFiles[PROVIDER_CLI_SETUP_DESTINATION] = sha(providerCliFixtureSource)
  consumerLock.payload.forkCorpusLockSha256 = sha(corpusLockBytes)
  const consumerLockBytes = Buffer.from(`${JSON.stringify(consumerLock, null, 2)}\n`)
  writeFileSync(consumerLockPath, consumerLockBytes)
  writeFileSync(join(templateRoot, 'governance/lock.json'), consumerLockBytes)

  if (!readFileSync(artifactPath).equals(providerCliFixtureSource)
    || (existsSync(templateSetup) && !readFileSync(templateSetup).equals(providerCliFixtureSource))
    || sha(readFileSync(corpusLockPath)) !== consumerLock.payload.forkCorpusLockSha256) {
    throw new Error(`${label} provider CLI fixture replacement did not close its corpus chain`)
  }
}
const readCurrentJournalState = (projectRoot) => {
  const pointerPath = join(projectRoot, '.governance-upgrade-journal.json')
  const pointer = JSON.parse(readFileSync(pointerPath, 'utf8'))
  if (pointer.kind !== 'governance-upgrade-journal-lease') return pointer
  const stateRoot = join(pointer.transactionRoot, '.governance-upgrade-journal-states')
  const committed = readdirSync(stateRoot)
    .filter((name) => /^state-[0-9]{16}\.json$/.test(name))
    .sort()
  if (!committed.length) throw new Error('versioned journal lease has no committed state')
  const envelope = JSON.parse(readFileSync(join(stateRoot, committed.at(-1)), 'utf8'))
  if (
    envelope.kind !== 'governance-upgrade-journal-state'
    || envelope.journal?.transactionId !== pointer.transactionId
    || envelope.journal?.transactionRoot !== pointer.transactionRoot
  ) throw new Error('versioned journal state differs from its public lease')
  return envelope.journal
}

const productionSyncSource = readFileSync(join(root, 'scripts/sync-all.mjs'), 'utf8')
if (
  productionSyncSource.includes("from './setup-provider-cli-toolchain.mjs'")
  || !productionSyncSource.includes("join(sandbox, 'scripts/setup-provider-cli-toolchain.mjs')")
  || !productionSyncSource.includes('await import(providerModuleUrl.href)')
  || !productionSyncSource.includes('protectedSetupProviderCliToolchain({')
  || !productionSyncSource.includes('probeExecutables: false')
  || !productionSyncSource.includes('protectedVerifyProviderCliToolchainStatic({ root: candidateRoot })')
  || !productionSyncSource.includes('protectedProviderCliStaticVerifier({ root: repoRoot })')
  || /FAKE_PROVIDER_CLI|PROVIDER_CLI_SETUP_MODULE/.test(productionSyncSource)
) {
  throw new Error('production sync-all lost the immutable protected-base provider CLI static-only boundary')
}

const fakeNpmSource = `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const fixture = JSON.parse(fs.readFileSync(${JSON.stringify(npmFixtureControlPath)}, 'utf8'))
if (process.env.NPM_CONFIG_USERCONFIG) {
  const allowedEnvironment = new Set([
    'HOME', 'LANG', 'LC_ALL', 'LOGNAME', 'NO_COLOR', 'PATH', 'TMPDIR', 'TZ', 'USER',
    'NPM_CONFIG_CACHE', 'NPM_CONFIG_COLOR', 'NPM_CONFIG_FUND', 'NPM_CONFIG_GLOBALCONFIG',
    'NPM_CONFIG_IGNORE_SCRIPTS', 'NPM_CONFIG_PROGRESS', 'NPM_CONFIG_PROVENANCE',
    'NPM_CONFIG_REGISTRY', 'NPM_CONFIG_STRICT_SSL', 'NPM_CONFIG_UPDATE_NOTIFIER',
    'NPM_CONFIG_USERCONFIG', '__CF_USER_TEXT_ENCODING',
  ])
  const unexpected = Object.keys(process.env).filter((name) => !allowedEnvironment.has(name))
  if (unexpected.length) {
    process.stderr.write('fixture npm received non-closed environment:' + unexpected.sort().join(',') + '\\n')
    process.exit(97)
  }
}
if (process.argv[2] === '--version') {
  process.stdout.write(fixture.FAKE_NPM_VERSION + '\\n')
  process.exit(0)
}
const mode = fixture.FAKE_NPM_MODE
const DS = '@qijenchen/design-system'
const SB = '@qijenchen/storybook-config'
// npm 11.19 的 \`audit signatures --json\` 只吐封閉的 {invalid, missing} 失敗集合,沒有 verified
// bundle 陣列(verify-upgrade-provenance.mjs:406-411)。SLSA provenance 改由 registry 的
// attestations endpoint 讀回,由 fakeFetchSource 提供 —— 這裡刻意不再偽造 verified,否則 fixture
// 會比真 npm 多給資訊,掩蓋 readback 路徑的回歸。
if (process.argv[2] === 'audit' && process.argv[3] === 'signatures') {
  if (mode === 'signature-failure') process.exit(19)
  process.stdout.write(JSON.stringify({ invalid: [], missing: [] }))
  process.exit(0)
}
if (process.argv[2] === 'audit' && process.argv.includes('--audit-level=high')) {
  if (mode === 'high-audit-failure') {
    process.stdout.write(JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities: {
        unknown: {
          name: 'unknown',
          severity: 'high',
          isDirect: false,
          via: [],
          effects: [],
          range: '*',
          nodes: ['node_modules/unknown'],
          fixAvailable: false,
        },
      },
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 },
      },
    }))
    process.exit(1)
  }
  process.stdout.write(JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {
      'brace-expansion': {
        name: 'brace-expansion', severity: 'high', isDirect: false,
        via: [
          { source: 1130591, name: 'brace-expansion', dependency: 'brace-expansion', url: 'https://github.com/advisories/GHSA-mh99-v99m-4gvg', severity: 'high', range: '>=4.0.0 <5.0.8' },
          { source: 1130734, name: 'brace-expansion', dependency: 'brace-expansion', url: 'https://github.com/advisories/GHSA-rgw5-rvv9-x895', severity: 'high', range: '>=4.0.0 <5.0.9' },
        ],
        effects: [], range: '4.0.0 - 5.0.8', nodes: ['node_modules/npm/node_modules/brace-expansion'],
      },
      npm: {
        name: 'npm', severity: 'moderate', isDirect: true, via: ['tar'], effects: [],
        range: '<=10.9.8 || >=11.0.0-pre.0', nodes: ['node_modules/npm'],
      },
      tar: {
        name: 'tar', severity: 'moderate', isDirect: false,
        via: [{ source: 1124287, name: 'tar', dependency: 'tar', url: 'https://github.com/advisories/GHSA-r292-9mhp-454m', severity: 'moderate', range: '<=7.5.20' }],
        effects: ['npm'], range: '<=7.5.20', nodes: ['node_modules/npm/node_modules/tar'],
      },
    },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 2, high: 1, critical: 0, total: 3 } },
  }))
  process.exit(1)
}
if (!process.argv.includes('--ignore-scripts')) process.exit(91)
if (mode === 'install-failure') {
  fs.writeFileSync(path.join(process.cwd(), 'package.json'), '{partial')
  fs.mkdirSync(path.join(process.cwd(), 'node_modules'), { recursive: true })
  fs.writeFileSync(path.join(process.cwd(), 'node_modules/attempt-only.txt'), 'must be removed')
  process.exit(17)
}
const ds = path.join(process.cwd(), 'node_modules/@qijenchen/design-system')
const sb = path.join(process.cwd(), 'node_modules/@qijenchen/storybook-config')
const isUpgradeInstall = process.argv[2] === 'install'
const selectedDsPackage = isUpgradeInstall ? fixture.FAKE_DS_PACKAGE : fixture.FAKE_PREVIOUS_DS_PACKAGE
const selectedDsCanonical = isUpgradeInstall ? fixture.FAKE_DS_CANONICAL : fixture.FAKE_PREVIOUS_DS_CANONICAL
const selectedSbPackage = isUpgradeInstall ? fixture.FAKE_SB_PACKAGE : fixture.FAKE_PREVIOUS_SB_PACKAGE
const selectedVersion = isUpgradeInstall ? fixture.FAKE_RELEASE_VERSION : fixture.FAKE_PREVIOUS_VERSION
if (isUpgradeInstall) {
  fs.rmSync(ds, { recursive: true, force: true })
  fs.rmSync(sb, { recursive: true, force: true })
}
fs.mkdirSync(ds, { recursive: true }); fs.mkdirSync(sb, { recursive: true })
fs.cpSync(selectedDsPackage, path.join(ds, 'package.json'))
fs.cpSync(selectedDsCanonical, path.join(ds, 'ds-canonical'), { recursive: true })
fs.mkdirSync(path.join(ds, 'src/tokens'), { recursive: true })
fs.cpSync(fixture.FAKE_UTILITY_REGISTRY, path.join(ds, 'src/tokens/utility-registry.json'))
fs.cpSync(selectedSbPackage, path.join(sb, 'package.json'))
const lockPath = path.join(process.cwd(), 'package-lock.json')
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
lock.packages[''].dependencies[DS] = selectedVersion
lock.packages[''].dependencies[SB] = selectedVersion
Object.assign(lock.packages['node_modules/' + DS], {
  version: selectedVersion,
  resolved: 'https://registry.npmjs.org/@qijenchen/design-system/-/design-system-' + selectedVersion + '.tgz',
  integrity: fixture.FAKE_DS_SRI,
})
Object.assign(lock.packages['node_modules/' + SB], {
  version: selectedVersion,
  resolved: 'https://registry.npmjs.org/@qijenchen/storybook-config/-/storybook-config-' + selectedVersion + '.tgz',
  integrity: fixture.FAKE_SB_SRI,
})
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\\n')
const npm = path.join(process.cwd(), 'node_modules/npm')
fs.mkdirSync(path.join(npm, 'bin'), { recursive: true })
fs.copyFileSync(__filename, path.join(npm, 'bin/npm-cli.js'))
fs.chmodSync(path.join(npm, 'bin/npm-cli.js'), 0o755)
fs.writeFileSync(path.join(npm, 'package.json'), JSON.stringify({ name: 'npm', version: fixture.FAKE_NPM_VERSION, type: 'commonjs' }) + '\\n')
const installedBrace = path.join(npm, 'node_modules/brace-expansion')
const installedMinimatch = path.join(npm, 'node_modules/minimatch')
const installedTar = path.join(npm, 'node_modules/tar')
fs.mkdirSync(installedBrace, { recursive: true })
fs.mkdirSync(installedMinimatch, { recursive: true })
fs.mkdirSync(installedTar, { recursive: true })
fs.writeFileSync(path.join(installedBrace, 'package.json'), JSON.stringify({ name: 'brace-expansion', version: '5.0.7' }) + '\\n')
fs.writeFileSync(path.join(installedBrace, 'index.js'), 'exports.expand = value => [value]\\n')
fs.writeFileSync(path.join(installedMinimatch, 'package.json'), JSON.stringify({
  name: 'minimatch',
  version: '10.2.5',
  main: 'index.js',
  dependencies: { 'brace-expansion': '^5.0.5' },
}) + '\\n')
fs.writeFileSync(path.join(installedMinimatch, 'index.js'), "const { expand } = require('brace-expansion')\\nexports.minimatch = (value, pattern) => expand(pattern).includes(value)\\n")
fs.writeFileSync(path.join(installedTar, 'package.json'), JSON.stringify({ name: 'tar', version: '7.5.19' }) + '\\n')
for (const [directory, manifest] of [
  ['npm-runtime-brace-expansion-patch', { name: 'brace-expansion', version: '5.0.9' }],
  ['npm-runtime-tar-patch', { name: 'tar', version: '7.5.22' }],
]) {
  const target = path.join(process.cwd(), 'node_modules', directory)
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify(manifest) + '\\n')
}
const npmBin = path.join(process.cwd(), 'node_modules/.bin')
fs.mkdirSync(npmBin, { recursive: true })
const fixtureLink = path.join(npmBin, 'npm-fixture')
if (!fs.existsSync(fixtureLink)) fs.symlinkSync('../npm/bin/npm-cli.js', fixtureLink)
if (mode === 'postcheck-failure') {
  fs.writeFileSync(path.join(process.cwd(), 'node_modules/attempt-only.txt'), 'must be removed')
}
if (mode === 'candidate-ignored-output') {
  fs.mkdirSync(path.join(process.cwd(), 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(process.cwd(), 'scripts/candidate-output.log'), 'ignored candidate mutation')
}
process.exit(0)
`
const poisonNpmSource = `#!/usr/bin/env node
process.stderr.write('POISON: host PATH/live node_modules npm must never execute\\n')
process.exit(99)
`
const poisonGitSource = marker => `#!/bin/sh
printf '%s\\n' 'ambient PATH git executed' > ${JSON.stringify(marker)}
exit 98
`

const verifiedNpmFixtureHelperUrl = pathToFileURL(join(root, 'scripts/test-fixtures/verified-npm-runtime-archive.mjs')).href
const immutableReleaseFixtureHelperUrl = pathToFileURL(join(root, 'scripts/test-fixtures/immutable-release-fixture.mjs')).href
const fakeFetchSource = `
import { createHash } from 'node:crypto'
import { installCanonicalNpmHttpsFixture } from ${JSON.stringify(verifiedNpmFixtureHelperUrl)}
import { immutableReleaseFixture } from ${JSON.stringify(immutableReleaseFixtureHelperUrl)}
const npmRuntimeArtifact = JSON.parse(Buffer.from(process.env.FAKE_NPM_RUNTIME_ARTIFACT, 'base64').toString('utf8'))
const npmRuntimeSecurityOverlayArtifact = JSON.parse(Buffer.from(process.env.FAKE_NPM_RUNTIME_SECURITY_OVERLAY_ARTIFACT, 'base64').toString('utf8'))
const npmRuntimeSecondarySecurityOverlayArtifact = JSON.parse(Buffer.from(process.env.FAKE_NPM_RUNTIME_SECONDARY_SECURITY_OVERLAY_ARTIFACT, 'base64').toString('utf8'))
installCanonicalNpmHttpsFixture({
  artifact: npmRuntimeArtifact,
  tarballBytes: Buffer.from(process.env.FAKE_NPM_RUNTIME_TARBALL, 'base64'),
  secondarySecurityOverlayArtifact: npmRuntimeSecondarySecurityOverlayArtifact,
  secondarySecurityOverlayTarballBytes: Buffer.from(process.env.FAKE_NPM_RUNTIME_SECONDARY_SECURITY_OVERLAY_TARBALL, 'base64'),
  securityOverlayArtifact: npmRuntimeSecurityOverlayArtifact,
  securityOverlayTarballBytes: Buffer.from(process.env.FAKE_NPM_RUNTIME_SECURITY_OVERLAY_TARBALL, 'base64'),
})
const repository = 'ajenchen/design-system'
const version = process.env.FAKE_RELEASE_VERSION
const tag = 'v' + version
const commit = process.env.FAKE_RELEASE_COMMIT
const mode = process.env.FAKE_PROVENANCE_MODE || 'success'
const supplyChain = {
  npmProvenance: {
    predicateType: 'https://slsa.dev/provenance/v1',
    builderId: 'https://github.com/actions/runner/github-hosted',
    workflow: '.github/workflows/release.yml',
    workflowRef: 'refs/heads/main',
  },
  immutableGitHubRelease: { required: true, bomAsset: 'release-bom.json' },
}
const scaffoldEntries = [{ path: 'README.md', mode: '644', size: 1, sha256: 'd'.repeat(64) }]
const scaffoldLock = {
  schemaVersion: 1,
  kind: 'qijenchen-product-template-scaffold',
  releaseVersion: version,
  staticTreeSha256: createHash('sha256').update('644 ' + 'd'.repeat(64) + ' 1 ./README.md\\n').digest('hex'),
  publishedPathCount: 2,
  entries: scaffoldEntries,
  generatedEntries: ${JSON.stringify(PRODUCT_TEMPLATE_GENERATED_ENTRIES)},
}
const scaffoldLockBody = JSON.stringify(scaffoldLock, null, 2) + '\\n'
const scaffoldLockSha256 = createHash('sha256').update(scaffoldLockBody).digest('hex')
const bom = {
  schemaVersion: 5,
  releaseVersion: version,
  npmDistTag: 'beta',
  publishOrder: ['@qijenchen/governance', '@qijenchen/storybook-config', '@qijenchen/design-system'],
  source: {
    repository,
    repositoryUrl: 'git+https://github.com/' + repository + '.git',
    tag,
    gitCommit: commit,
    gitTree: 'a'.repeat(40),
  },
  supplyChain,
  packages: [
    ['@qijenchen/design-system', mode === 'wrong-release-sri' ? process.env.FAKE_GOV_SRI : process.env.FAKE_DS_SRI],
    ['@qijenchen/governance', process.env.FAKE_GOV_SRI],
    ['@qijenchen/storybook-config', process.env.FAKE_SB_SRI],
  ].map(([name, integrity]) => ({
    name, version,
    file: name.replace(/^@/, '').replaceAll('/', '-') + '-' + version + '.tgz',
    size: 100, entryCount: 2, shasum: '1'.repeat(40), sha256: '2'.repeat(64), integrity,
    packageJsonSha256: '3'.repeat(64),
    sourceManifest: 'packages/' + name.split('/').at(-1) + '/package.json',
    sourceManifestSha256: '4'.repeat(64),
  })),
  governance: {
    controlPlane: {
      path: 'governance/control-plane.lock.json', sha256: '5'.repeat(64), role: 'ds-author',
      inputDigest: 'sha256:' + '6'.repeat(64), contractDigest: 'sha256:' + '7'.repeat(64),
      snapshotDigest: 'sha256:' + '8'.repeat(64), generatorVersion: version,
    },
    consumer: {
      path: 'template/ds-product-template/governance/lock.json', sha256: '9'.repeat(64), role: 'template-consumer',
      release: { designSystem: version, storybookConfig: version },
    },
    forkCorpus: { path: 'packages/design-system/ds-canonical/fork/governance.lock', sha256: 'b'.repeat(64) },
    productTemplateScaffold: {
      path: 'product-template-scaffold.lock.json', size: Buffer.byteLength(scaffoldLockBody), sha256: scaffoldLockSha256,
      schemaVersion: 1, releaseVersion: version, staticTreeSha256: scaffoldLock.staticTreeSha256, publishedPathCount: 2,
    },
  },
  sbom: { file: 'release.sbom.cdx.json', size: 100, sha256: 'c'.repeat(64) },
}
const immutableRelease = immutableReleaseFixture({
  repository,
  version,
  commit,
  tree: bom.source.gitTree,
  bom,
  scaffoldLockBody,
})
const releaseUrl = 'https://api.github.com/repos/' + repository + '/releases/tags/' + tag
const refUrl = 'https://api.github.com/repos/' + repository + '/git/ref/tags/' + tag
const tagObjectUrl = 'https://api.github.com/repos/' + repository + '/git/tags/' + immutableRelease.tagIdentity.tagObject
const commitUrl = 'https://api.github.com/repos/' + repository + '/git/commits/' + commit
// SLSA provenance 的唯一來源是 registry attestations endpoint(verify-upgrade-provenance.mjs
// fetchNpmAttestationReadback),不是 npm CLI 輸出。wrong-workflow 模式在這裡改寫 workflow path,
// GOV-SUPPLY-003 的負例才是真的走 readback 這條路被擋下來。
const purl = (name) => 'pkg:npm/' + encodeURIComponent(name).replace('%2F', '/') + '@' + version
const digestHex = (integrity) => Buffer.from(integrity.slice('sha512-'.length), 'base64').toString('hex')
const provenanceStatement = (name, integrity) => ({
  _type: 'https://in-toto.io/Statement/v1',
  subject: [{ name: purl(name), digest: { sha512: digestHex(integrity) } }],
  predicateType: 'https://slsa.dev/provenance/v1',
  predicate: {
    buildDefinition: {
      externalParameters: { workflow: {
        repository: 'https://github.com/' + repository,
        path: mode === 'wrong-workflow' ? '.github/workflows/attacker.yml' : '.github/workflows/release.yml',
        ref: 'refs/heads/main',
      } },
      resolvedDependencies: [{
        uri: 'git+https://github.com/' + repository + '@refs/heads/main',
        digest: { gitCommit: commit },
      }],
    },
    runDetails: { builder: { id: 'https://github.com/actions/runner/github-hosted' } },
  },
})
const attestationUrls = new Map([
  ['@qijenchen/design-system', process.env.FAKE_DS_SRI],
  ['@qijenchen/storybook-config', process.env.FAKE_SB_SRI],
].map(([name, integrity]) => [
  'https://registry.npmjs.org/-/npm/v1/attestations/' + encodeURIComponent(name) + '@' + encodeURIComponent(version),
  { name, integrity },
]))
globalThis.fetch = async (input) => {
  const delay = Number(process.env.FAKE_FETCH_DELAY_MS || 0)
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  const url = String(input)
  if (url === releaseUrl) {
    if (mode === 'missing-release') return new Response('{}', { status: 404 })
    const release = structuredClone(immutableRelease.release)
    if (mode === 'mutable-release') release.immutable = false
    return new Response(JSON.stringify(release), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const asset = immutableRelease.release.assets.find((item) => item.browser_download_url === url)
  if (asset) return new Response(immutableRelease.assetBodies[asset.name], { status: 200 })
  if (url === refUrl) return new Response(JSON.stringify(immutableRelease.tagApi.reference), { status: 200 })
  if (url === tagObjectUrl) return new Response(JSON.stringify(immutableRelease.tagApi.tagObject), { status: 200 })
  if (url === commitUrl) return new Response(JSON.stringify({ sha: commit, tree: { sha: bom.source.gitTree } }), { status: 200 })
  const attestation = attestationUrls.get(url)
  if (attestation) {
    return new Response(JSON.stringify({
      attestations: [{
        predicateType: 'https://slsa.dev/provenance/v1',
        bundle: {
          dsseEnvelope: {
            payloadType: 'application/vnd.in-toto+json',
            payload: Buffer.from(JSON.stringify(provenanceStatement(attestation.name, attestation.integrity))).toString('base64'),
            signatures: [{ sig: 'verified-fixture' }],
          },
          verificationMaterial: { certificate: { rawBytes: 'fixture' } },
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  throw new Error('unexpected network request in provenance fixture:' + url)
}
`

try {
  buildPublishedTemplateMirror({ outDir: repo })
  const dsPackage = join(root, 'packages/design-system/package.json')
  const sbPackage = join(root, 'packages/storybook-config/package.json')
  const dsManifest = JSON.parse(readFileSync(dsPackage, 'utf8'))
  const sbManifest = JSON.parse(readFileSync(sbPackage, 'utf8'))
  const dsVersion = dsManifest.version
  const sbVersion = sbManifest.version
  const prerelease = dsVersion.match(/^(.*-.*?)(\d+)$/)
  if (!prerelease || Number(prerelease[2]) < 1 || sbVersion !== dsVersion) {
    throw new Error('transaction fixture requires matching numeric prerelease package versions')
  }
  const previousVersion = `${prerelease[1]}${Number(prerelease[2]) - 1}`
  const lifecycleLedger = JSON.parse(readFileSync(join(root, 'packages/governance/canonical/provider-lifecycle.json'), 'utf8'))
  const currentSnapshot = structuredClone(lifecycleLedger.snapshots.at(-1))
  const previousSnapshot = structuredClone(currentSnapshot)
  previousSnapshot.releaseVersion = previousVersion
  previousSnapshot.previousSnapshotSha256 = null
  const previousSnapshotSha256 = lifecycleSnapshotSha256(previousSnapshot)
  currentSnapshot.previousSnapshotSha256 = previousSnapshotSha256
  const previousImmutableHead = {
    releaseVersion: previousVersion,
    snapshotSha256: previousSnapshotSha256,
    providerInventorySha256: providerInventorySha256(previousSnapshot.providers),
  }
  const previousLifecycle = {
    ...structuredClone(lifecycleLedger),
    immutableHead: previousImmutableHead,
    snapshots: [previousSnapshot],
  }
  const candidateLifecycle = {
    ...structuredClone(lifecycleLedger),
    immutableHead: previousImmutableHead,
    snapshots: [previousSnapshot, currentSnapshot],
  }
  const generatedFork = join(corpusTemp, 'generated-fork')
  const generatedCandidateTemplate = join(corpusTemp, 'generated-candidate-template')
  buildCorpus({ outDir: generatedFork, templateRoot: generatedCandidateTemplate, providerLifecycle: candidateLifecycle })
  replaceProviderCliSetupFixture({
    forkRoot: generatedFork,
    templateRoot: generatedCandidateTemplate,
    label: 'candidate corpus',
  })
  const generatedPreviousFork = join(corpusTemp, 'generated-previous-fork')
  const generatedTemplate = join(corpusTemp, 'generated-template')
  buildCorpus({
    outDir: generatedPreviousFork,
    templateRoot: generatedTemplate,
    providerLifecycle: previousLifecycle,
    releaseVersion: previousVersion,
  })
  replaceProviderCliSetupFixture({
    forkRoot: generatedPreviousFork,
    templateRoot: generatedTemplate,
    label: 'predecessor corpus',
  })
  cpSync(generatedTemplate, repo, { recursive: true, force: true })
  const fixtureRepositoryProviderSetup = join(repo, PROVIDER_CLI_SETUP_DESTINATION)
  if (!readFileSync(fixtureRepositoryProviderSetup).equals(productionProviderCliSetupSource)) {
    throw new Error('published predecessor setup source drifted before protected-base fixture replacement')
  }
  writeFileSync(fixtureRepositoryProviderSetup, providerCliFixtureSource)
  const baselineManifestPath = join(repo, 'package.json')
  const baselineManifest = JSON.parse(readFileSync(baselineManifestPath, 'utf8'))
  baselineManifest.dependencies['@qijenchen/design-system'] = previousVersion
  baselineManifest.dependencies['@qijenchen/storybook-config'] = previousVersion
  writeFileSync(baselineManifestPath, JSON.stringify(baselineManifest, null, 2) + '\n')
  // Widen the observable recovery interval without adding a production-only test hook.
  writeFileSync(join(repo, 'scripts/recovery-phase-payload.bin'), Buffer.alloc(4 * 1024 * 1024, 0x5a))
  const dsCanonical = join(temp, 'generated-ds-canonical')
  cpSync(join(root, 'packages/design-system/ds-canonical'), dsCanonical, { recursive: true })
  rmSync(join(dsCanonical, 'fork'), { recursive: true, force: true })
  cpSync(generatedFork, join(dsCanonical, 'fork'), { recursive: true })
  const previousDsCanonical = join(temp, 'generated-previous-ds-canonical')
  cpSync(join(root, 'packages/design-system/ds-canonical'), previousDsCanonical, { recursive: true })
  rmSync(join(previousDsCanonical, 'fork'), { recursive: true, force: true })
  cpSync(generatedPreviousFork, join(previousDsCanonical, 'fork'), { recursive: true })
  const previousDsPackage = join(temp, 'previous-design-system-package.json')
  const previousSbPackage = join(temp, 'previous-storybook-package.json')
  writeFileSync(previousDsPackage, JSON.stringify({ ...dsManifest, version: previousVersion }, null, 2) + '\n')
  writeFileSync(previousSbPackage, JSON.stringify({ ...sbManifest, version: previousVersion }, null, 2) + '\n')
  const dsDest = join(repo, 'node_modules/@qijenchen/design-system')
  const sbDest = join(repo, 'node_modules/@qijenchen/storybook-config')
  mkdirSync(dsDest, { recursive: true }); mkdirSync(sbDest, { recursive: true })
  cpSync(previousDsPackage, join(dsDest, 'package.json'))
  cpSync(previousDsCanonical, join(dsDest, 'ds-canonical'), { recursive: true })
  mkdirSync(join(dsDest, 'src/tokens'), { recursive: true })
  cpSync(join(root, 'packages/design-system/src/tokens/utility-registry.json'), join(dsDest, 'src/tokens/utility-registry.json'))
  cpSync(previousSbPackage, join(sbDest, 'package.json'))
  const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
  const exactNpmVersion = pkg.devDependencies?.npm || pkg.dependencies?.npm
  if (!/^\d+\.\d+\.\d+$/.test(exactNpmVersion || '')) throw new Error('fixture product must pin an exact npm toolchain')
  const verifiedNpmRuntime = buildDeterministicNpmRuntimeArchive({
    version: exactNpmVersion,
    cliSource: fakeNpmSource,
    includeSecurityOverlay: true,
  })
  writeFileSync(join(repo, 'package-lock.json'), JSON.stringify({
    name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true,
    packages: {
      '': {
        name: pkg.name,
        version: pkg.version,
        dependencies: pkg.dependencies,
        devDependencies: pkg.devDependencies,
        engines: pkg.engines,
      },
      'node_modules/@qijenchen/design-system': {
        version: previousVersion,
        resolved: `https://registry.npmjs.org/@qijenchen/design-system/-/design-system-${previousVersion}.tgz`,
        integrity: 'sha512-A3eSBeF7eSqCa3kuXymOstWCI9uLMcNxZY7glJosUTnvLJMsV9w6V8Ikirx08w6ch5bYT6BbUsQmJMyEkCfdDA==',
      },
      'node_modules/@qijenchen/storybook-config': {
        version: previousVersion,
        resolved: `https://registry.npmjs.org/@qijenchen/storybook-config/-/storybook-config-${previousVersion}.tgz`,
        integrity: 'sha512-iHw7rkpzKfsxCJdM+OBajcDn2RlUg+7WkGHW+jT2e1LNaAwWFCNgrnBQzvCeVOs7n+nsqWanrOxjRW2CaC9S3Q==',
      },
      'node_modules/npm': {
        version: exactNpmVersion,
        resolved: verifiedNpmRuntime.artifact.resolved,
        integrity: verifiedNpmRuntime.artifact.integrity,
        dev: true,
        bin: { npm: 'bin/npm-cli.js' },
      },
      'node_modules/npm-runtime-brace-expansion-patch': {
        ...verifiedNpmRuntime.securityOverlayArtifact,
        dev: true,
      },
      'node_modules/npm-runtime-tar-patch': {
        ...verifiedNpmRuntime.secondarySecurityOverlayArtifact,
        dev: true,
      },
    },
  }, null, 2) + '\n')

  must(run('git', ['init', '-q']), 'git init')
  must(run('git', ['config', 'user.email', 'fixture@example.invalid']), 'git config email')
  must(run('git', ['config', 'user.name', 'Fixture']), 'git config name')
  must(run('git', ['add', '-A']), 'git add')
  must(run('git', ['commit', '-qm', 'fixture']), 'git commit')
  must(run('git', ['branch', '-M', 'main']), 'rename default branch')

  const assertUnsafeBranchRejected = (label) => {
    const beforePackage = readFileSync(join(repo, 'package.json'))
    const beforeModules = inventory(join(repo, 'node_modules'))
    const rejected = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--apply', '--to', dsVersion, '--json'])
    const rejectedReport = parseReport(rejected, `${label} branch rejection`)
    if (
      rejected.status === 0
      || !rejectedReport.diagnostics.some((item) => item.ruleId === 'GOV-UPGRADE-009')
      || run('git', ['status', '--porcelain']).stdout.trim()
      || !readFileSync(join(repo, 'package.json')).equals(beforePackage)
      || inventory(join(repo, 'node_modules')) !== beforeModules
    ) throw new Error(`${label} branch was not rejected before mutation:${rejected.stdout}\n${rejected.stderr}`)
  }

  assertUnsafeBranchRejected('main')
  must(run('git', ['checkout', '--detach', '-q']), 'detach fixture HEAD')
  assertUnsafeBranchRejected('detached HEAD')
  must(run('git', ['checkout', '-qb', 'governance/upgrade-fixture']), 'create dedicated upgrade branch')
  console.log('✅ branch safety: main and detached HEAD rejected; dedicated upgrade branch accepted')

  const shrinkwrapPath = join(repo, 'npm-shrinkwrap.json')
  writeFileSync(shrinkwrapPath, '{"lockfileVersion":3,"packages":{"":{"name":"attacker-lock"}}}\n')
  must(run('git', ['add', 'npm-shrinkwrap.json']), 'stage shrinkwrap poison')
  must(run('git', ['commit', '-qm', 'shrinkwrap poison fixture']), 'commit shrinkwrap poison')
  const shrinkwrapRejected = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--apply', '--to', dsVersion, '--json'])
  if (
    shrinkwrapRejected.status === 0
    || !shrinkwrapRejected.stderr.includes('npm-shrinkwrap.json is forbidden')
    || existsSync(join(repo, '.governance-upgrade-journal.json'))
    || !existsSync(shrinkwrapPath)
  ) throw new Error(`sync-all did not reject a clean tracked shrinkwrap before reconstruction:${shrinkwrapRejected.stdout}\n${shrinkwrapRejected.stderr}`)
  must(run('git', ['rm', '-q', 'npm-shrinkwrap.json']), 'stage shrinkwrap tombstone')
  must(run('git', ['commit', '-qm', 'restore shrinkwrap absence tombstone']), 'commit shrinkwrap tombstone')
  if (run('git', ['status', '--porcelain']).stdout.trim()) {
    throw new Error('shrinkwrap rejection/tombstone fixture left an unreviewed worktree mutation')
  }
  console.log('✅ lock SSOT: sync-all rejects a clean tracked root shrinkwrap before registry or npm reconstruction')

  const authorityRootExisted = existsSync(join(repo, 'infra'))
  const authorityManifestPath = join(repo, 'infra/governance/providers/provider-cli-toolchain.json')
  mkdirSync(dirname(authorityManifestPath), { recursive: true })
  cpSync(join(repo, 'governance/provider-cli-toolchain.json'), authorityManifestPath)
  const authorityRoleRejected = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
  const authorityRoleReport = parseReport(authorityRoleRejected, 'authority role rejection')
  if (
    authorityRoleRejected.status === 0
    || authorityRoleReport.ready !== false
    || !authorityRoleReport.diagnostics.some((item) => item.ruleId === 'GOV-UPGRADE-ROLE-001')
    || existsSync(join(repo, '.governance-upgrade-journal.json'))
  ) throw new Error(`sync-all did not reject a DS authority root before transaction recovery/mutation:${authorityRoleRejected.stdout}\n${authorityRoleRejected.stderr}`)
  rmSync(authorityManifestPath)
  if (!authorityRootExisted) rmSync(join(repo, 'infra'), { recursive: true, force: true })
  if (run('git', ['status', '--porcelain']).stdout.trim()) {
    throw new Error('authority-role rejection left an unreviewed worktree mutation')
  }
  console.log('✅ role safety: sync-all rejects DS authority roots before transaction mutation')

  for (const invalidArgs of [
    ['--unknown'],
    ['positional'],
    ['--apply'],
    ['--apply', '--dry-run', '--to', dsVersion],
    ['--apply', '--apply', '--to', dsVersion],
    ['--json', '--json'],
    ['--to'],
    ['--to', '--apply'],
    ['--to', dsVersion, '--to', dsVersion],
    ['--to', dsVersion, '--design-system', dsVersion],
    ['--design-system', dsVersion],
  ]) {
    const beforePackage = readFileSync(join(repo, 'package.json'))
    const beforeModules = inventory(join(repo, 'node_modules'))
    const rejected = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), ...invalidArgs])
    if (
      rejected.status === 0
      || run('git', ['status', '--porcelain']).stdout.trim()
      || !readFileSync(join(repo, 'package.json')).equals(beforePackage)
      || inventory(join(repo, 'node_modules')) !== beforeModules
    ) throw new Error(`invalid CLI was not rejected before mutation:${invalidArgs.join(' ')}\n${rejected.stdout}\n${rejected.stderr}`)
  }
  const productionEnvironment = { ...process.env }
  delete productionEnvironment.NODE_ENV
  for (const hiddenOption of [
    '--test-journal-release-handshake',
    '--test-node-modules-publish-handshake',
    '--test-consumer-role-gap-handshake',
    '--test-transaction-gc-failure',
  ]) {
    const hiddenTransitionRejected = run(process.execPath, [
      join(repo, 'scripts/sync-all.mjs'),
      '--apply',
      '--to',
      dsVersion,
      '--json',
      hiddenOption,
    ], { env: productionEnvironment })
    const hiddenTransitionReport = parseReport(hiddenTransitionRejected, `production ${hiddenOption} rejection`)
    if (
      hiddenTransitionRejected.status === 0
      || !hiddenTransitionReport.diagnostics.some((item) => (
        item.ruleId === 'GOV-UPGRADE-CLI-001'
        && item.message.includes(`unknown or positional option:${hiddenOption}`)
      ))
      || existsSync(join(repo, '.governance-upgrade-journal.json'))
      || run('git', ['status', '--porcelain']).stdout.trim()
    ) throw new Error(`production accepted test-only option ${hiddenOption}:${hiddenTransitionRejected.stdout}\n${hiddenTransitionRejected.stderr}`)
  }
  console.log('✅ CLI safety: unknown, positional, duplicate, missing, and contradictory options rejected before mutation')

  const fakeBin = join(temp, 'fake-bin')
  mkdirSync(fakeBin)
  const poisonGitMarker = join(temp, 'ambient-path-git-executed.txt')
  writeFileSync(join(fakeBin, 'npm'), poisonNpmSource)
  writeFileSync(join(fakeBin, 'git'), poisonGitSource(poisonGitMarker))
  chmodSync(join(fakeBin, 'npm'), 0o755)
  chmodSync(join(fakeBin, 'git'), 0o755)
  const protectedNpmRoot = join(repo, 'node_modules/npm')
  mkdirSync(join(protectedNpmRoot, 'bin'), { recursive: true })
  writeFileSync(join(protectedNpmRoot, 'package.json'), JSON.stringify({ name: 'npm', version: exactNpmVersion, type: 'commonjs' }) + '\n')
  writeFileSync(join(protectedNpmRoot, 'bin/npm-cli.js'), poisonNpmSource)
  chmodSync(join(protectedNpmRoot, 'bin/npm-cli.js'), 0o755)
  const fakeFetch = join(temp, 'fake-fetch.mjs')
  writeFileSync(fakeFetch, fakeFetchSource)
  const dsSri = 'sha512-A3eSBeF7eSqCa3kuXymOstWCI9uLMcNxZY7glJosUTnvLJMsV9w6V8Ikirx08w6ch5bYT6BbUsQmJMyEkCfdDA=='
  const sbSri = 'sha512-iHw7rkpzKfsxCJdM+OBajcDn2RlUg+7WkGHW+jT2e1LNaAwWFCNgrnBQzvCeVOs7n+nsqWanrOxjRW2CaC9S3Q=='
  const providerCliExecutionMarker = join(temp, 'provider-cli-executed.txt')
  const providerCliPoisonSecret = 'PROVIDER-CLI-SYNC-SECRET-MUST-NOT-BE-READ'
  const baseEnv = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=${fakeFetch}`.trim(),
    FAKE_DS_PACKAGE: dsPackage,
    FAKE_DS_CANONICAL: dsCanonical,
    FAKE_SB_PACKAGE: sbPackage,
    FAKE_PREVIOUS_DS_PACKAGE: previousDsPackage,
    FAKE_PREVIOUS_DS_CANONICAL: previousDsCanonical,
    FAKE_PREVIOUS_SB_PACKAGE: previousSbPackage,
    FAKE_UTILITY_REGISTRY: join(root, 'packages/design-system/src/tokens/utility-registry.json'),
    FAKE_PREVIOUS_VERSION: previousVersion,
    FAKE_NPM_VERSION: exactNpmVersion,
    FAKE_NPM_RUNTIME_ARTIFACT: Buffer.from(JSON.stringify(verifiedNpmRuntime.artifact)).toString('base64'),
    FAKE_NPM_RUNTIME_TARBALL: verifiedNpmRuntime.tarballBytes.toString('base64'),
    FAKE_NPM_RUNTIME_SECURITY_OVERLAY_ARTIFACT: Buffer.from(JSON.stringify(verifiedNpmRuntime.securityOverlayArtifact)).toString('base64'),
    FAKE_NPM_RUNTIME_SECURITY_OVERLAY_TARBALL: verifiedNpmRuntime.securityOverlayTarballBytes.toString('base64'),
    FAKE_NPM_RUNTIME_SECONDARY_SECURITY_OVERLAY_ARTIFACT: Buffer.from(JSON.stringify(verifiedNpmRuntime.secondarySecurityOverlayArtifact)).toString('base64'),
    FAKE_NPM_RUNTIME_SECONDARY_SECURITY_OVERLAY_TARBALL: verifiedNpmRuntime.secondarySecurityOverlayTarballBytes.toString('base64'),
    FAKE_RELEASE_VERSION: dsVersion,
    FAKE_RELEASE_COMMIT: '1234567890abcdef1234567890abcdef12345678',
    FAKE_DS_SRI: dsSri,
    FAKE_SB_SRI: sbSri,
    FAKE_GOV_SRI: `sha512-${Buffer.alloc(64, 0x33).toString('base64')}`,
    FAKE_PROVIDER_CLI_MODE: 'success',
    PROVIDER_CLI_EXECUTION_MARKER: providerCliExecutionMarker,
    PROVIDER_CLI_POISON_SECRET: providerCliPoisonSecret,
  }

  const protectedLoaderMarker = join(temp, 'live-provider-module-imported.txt')
  const protectedLoaderOriginal = readFileSync(fixtureRepositoryProviderSetup)
  must(
    run('git', ['update-index', '--assume-unchanged', '--', PROVIDER_CLI_SETUP_DESTINATION]),
    'hide poisoned live provider module behind assume-unchanged',
  )
  writeFileSync(
    fixtureRepositoryProviderSetup,
    `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(protectedLoaderMarker)}, 'poisoned live module executed\\n')\nthrow new Error('poisoned live provider module executed')\n`,
  )
  const protectedLoaderProbe = run(process.execPath, [
    join(repo, 'scripts/sync-all.mjs'),
    '--apply',
    '--to',
    dsVersion,
    '--json',
  ], {
    env: {
      ...baseEnv,
      FAKE_NPM_MODE: 'success',
      FAKE_PROVIDER_CLI_MODE: 'corrupt-content',
    },
  })
  const protectedLoaderReport = parseReport(protectedLoaderProbe, 'immutable protected-base provider loader')
  if (
    protectedLoaderProbe.status === 0
    || existsSync(protectedLoaderMarker)
    || !protectedLoaderReport.rollback?.restored
    || !protectedLoaderReport.diagnostics.some((item) => item.message.includes('fixture receipt'))
    || existsSync(join(repo, '.governance-upgrade-journal.json'))
  ) throw new Error(`sync-all imported poisoned live provider code instead of its protected-base checkout:${protectedLoaderProbe.stdout}\n${protectedLoaderProbe.stderr}`)
  writeFileSync(fixtureRepositoryProviderSetup, protectedLoaderOriginal)
  must(
    run('git', ['update-index', '--no-assume-unchanged', '--', PROVIDER_CLI_SETUP_DESTINATION]),
    'restore provider module assume-unchanged bit',
  )
  if (run('git', ['status', '--porcelain']).stdout.trim()) {
    throw new Error('protected-base loader poison test did not restore the fixture worktree')
  }
  console.log('✅ protected-base loader: assume-unchanged live poison is never imported or executed')

  const predecessorLegacyRuntime = join(
    repo,
    'node_modules/.provider-cli-toolchain/content-v1/predecessor-poison',
  )
  mkdirSync(predecessorLegacyRuntime, { recursive: true })
  writeFileSync(join(predecessorLegacyRuntime, 'must-not-survive.txt'), 'poisoned predecessor runtime\n')
  const predecessorShimRoot = join(repo, 'node_modules/.bin')
  mkdirSync(predecessorShimRoot, { recursive: true })
  const predecessorPoisonShim = join(predecessorShimRoot, 'claude')
  writeFileSync(predecessorPoisonShim, '#!/bin/sh\nexit 99\n')
  chmodSync(predecessorPoisonShim, 0o755)
  const predecessorFingerprintTargetA = join(repo, 'node_modules/.fingerprint-target-a')
  const predecessorFingerprintTargetB = join(repo, 'node_modules/.fingerprint-target-b')
  const predecessorFingerprintLink = join(repo, 'node_modules/.fingerprint-link')
  writeFileSync(predecessorFingerprintTargetA, 'fingerprint target A\n')
  writeFileSync(predecessorFingerprintTargetB, 'fingerprint target B\n')
  symlinkSync('.fingerprint-target-a', predecessorFingerprintLink)

  const snapshot = () => {
    const providerPaths = providerMutationPaths()
    const manifest = JSON.parse(readFileSync(join(repo, 'node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json'), 'utf8'))
    const commonPath = manifest.consumer.commonInstruction.destination
    return {
      modules: inventory(join(repo, 'node_modules')),
      package: readFileSync(join(repo, 'package.json')),
      checker: readFileSync(join(repo, 'scripts/governance-check.mjs')),
      providerPaths,
      provider: inventoryPaths(repo, providerPaths),
      commonPath,
      common: inventoryPaths(repo, [commonPath]),
      head: run('git', ['rev-parse', 'HEAD']).stdout.trim(),
    }
  }

  const assertSnapshotEqual = (actual, expected, label) => {
    if (
      actual.modules !== expected.modules
      || !actual.package.equals(expected.package)
      || !actual.checker.equals(expected.checker)
      || actual.provider !== expected.provider
      || actual.common !== expected.common
      || actual.head !== expected.head
    ) throw new Error(`${label} did not restore the exact predecessor snapshot`)
  }

  const killAfterJournaledReplacementStarts = (env) => new Promise((resolvePromise, rejectPromise) => {
    const journal = join(repo, '.governance-upgrade-journal.json')
    writeNpmFixtureControl(env)
    const child = spawn(process.execPath, ['--', join(repo, 'scripts/sync-all.mjs'), '--apply', '--to', dsVersion, '--json'], {
      cwd: repo,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let stdout = ''
    let stderr = ''
    let killRequested = false
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const poll = setInterval(() => {
      if (killRequested || !existsSync(journal)) return
      let state
      try { state = readCurrentJournalState(repo) } catch { return }
      const records = [
        ...(state.entries || []),
        ...(state.providerSnapshot?.entries || []),
        ...(state.commonSnapshot ? [state.commonSnapshot] : []),
      ]
      if (!records.some((entry) => entry.replacementStarted === true)) return
      const stagedImages = [
        ...(state.entries || []).map((entry, index) => join(state.transactionRoot, 'live-staging', 'fixed', String(index))),
        ...(state.providerSnapshot?.entries || []).map((entry, index) => join(state.transactionRoot, 'live-staging', 'provider', String(index))),
        ...(state.commonSnapshot ? [join(state.transactionRoot, 'live-staging', 'common', '0')] : []),
      ]
      if (!stagedImages.some((path) => existsSync(path))) return
      killRequested = child.kill('SIGKILL')
    }, 1)
    const timeout = setTimeout(() => {
      if (!killRequested) child.kill('SIGKILL')
      clearInterval(poll)
      rejectPromise(new Error(`timed out waiting for journaled live replacement:${stdout}\n${stderr}`))
    }, 30000)
    child.once('exit', (code, signal) => {
      clearInterval(poll)
      clearTimeout(timeout)
      if (!killRequested || signal !== 'SIGKILL') {
        rejectPromise(new Error(`upgrade escaped SIGKILL phase harness(code=${code}, signal=${signal}):${stdout}\n${stderr}`))
        return
      }
      resolvePromise({ stdout, stderr })
    })
    child.once('error', rejectPromise)
  })

  const killRecoveryAfterStagingAppears = () => new Promise((resolvePromise, rejectPromise) => {
    const journalPath = join(repo, '.governance-upgrade-journal.json')
    const child = spawn(process.execPath, ['--', join(repo, 'scripts/sync-all.mjs'), '--json'], {
      cwd: repo,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let stdout = ''
    let stderr = ''
    let killRequested = false
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const poll = setInterval(() => {
      if (killRequested || !existsSync(journalPath)) return
      let state
      try { state = readCurrentJournalState(repo) } catch { return }
      const artifacts = [
        ...(state.entries || []).flatMap((entry, index) => [
          join(state.transactionRoot, 'recovery-staging', 'fixed', String(index), 'restore'),
          join(state.transactionRoot, 'recovery-staging', 'fixed', String(index), 'moved'),
        ]),
        ...(state.providerSnapshot?.entries || []).flatMap((entry, index) => [
          join(state.transactionRoot, 'recovery-staging', 'provider', String(index), 'restore'),
          join(state.transactionRoot, 'recovery-staging', 'provider', String(index), 'moved'),
        ]),
        ...(state.commonSnapshot ? [
          join(state.transactionRoot, 'recovery-staging', 'common', '0', 'restore'),
          join(state.transactionRoot, 'recovery-staging', 'common', '0', 'moved'),
        ] : []),
      ]
      if (!artifacts.some((path) => existsSync(path))) return
      killRequested = child.kill('SIGKILL')
    }, 1)
    const timeout = setTimeout(() => {
      if (!killRequested) child.kill('SIGKILL')
      clearInterval(poll)
      rejectPromise(new Error(`timed out waiting for recovery-staging:${stdout}\n${stderr}`))
    }, 30000)
    child.once('exit', (code, signal) => {
      clearInterval(poll)
      clearTimeout(timeout)
      if (!killRequested || signal !== 'SIGKILL') {
        rejectPromise(new Error(`recovery escaped SIGKILL phase harness(code=${code}, signal=${signal}):${stdout}\n${stderr}`))
        return
      }
      resolvePromise({ stdout, stderr })
    })
    child.once('error', rejectPromise)
  })

  const ignoredLocalCanary = join(repo, 'scripts/transaction-local.log')
  writeFileSync(ignoredLocalCanary, 'local ignored bytes must survive')
  must(run('git', ['check-ignore', '--quiet', '--', 'scripts/transaction-local.log']), 'prove local canary is ignored')
  const ignoredLocalBefore = inventory(repo)
  const ignoredLocalRejected = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--apply', '--to', dsVersion, '--json'], {
    env: { ...baseEnv, FAKE_NPM_MODE: 'success' },
  })
  const ignoredLocalReport = parseReport(ignoredLocalRejected, 'ignored local canary rejection')
  if (
    ignoredLocalRejected.status === 0
    || !ignoredLocalReport.diagnostics.some((item) => item.message.includes('ignored content outside the reviewable patch boundary'))
    || readFileSync(ignoredLocalCanary, 'utf8') !== 'local ignored bytes must survive'
    || inventory(repo) !== ignoredLocalBefore
    || existsSync(join(repo, '.governance-upgrade-journal.json'))
  ) throw new Error(`ignored live canary crossed the whole-tree boundary:${ignoredLocalRejected.stdout}\n${ignoredLocalRejected.stderr}`)
  rmSync(ignoredLocalCanary)
  console.log('✅ ignored boundary: local ignored bytes block whole-tree replacement and remain byte-exact')

  const ignoredCandidateBefore = snapshot()
  const ignoredCandidateRejected = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--apply', '--to', dsVersion, '--json'], {
    env: { ...baseEnv, FAKE_NPM_MODE: 'candidate-ignored-output' },
  })
  const ignoredCandidateReport = parseReport(ignoredCandidateRejected, 'ignored candidate output rejection')
  if (
    ignoredCandidateRejected.status === 0
    || !ignoredCandidateReport.rollback?.restored
    || !ignoredCandidateReport.diagnostics.some((item) => item.message.includes('ignored content outside the reviewable patch boundary'))
    || existsSync(join(repo, 'scripts/candidate-output.log'))
    || existsSync(join(repo, '.governance-upgrade-journal.json'))
  ) throw new Error(`ignored candidate output crossed the reviewable patch boundary:${ignoredCandidateRejected.stdout}\n${ignoredCandidateRejected.stderr}`)
  assertSnapshotEqual(snapshot(), ignoredCandidateBefore, 'ignored candidate output rejection')
  console.log('✅ ignored boundary: disposable ignored output cannot enter the reviewed live patch')

  const nodeModulesPublishBefore = snapshot()
  const nodeModulesPublishEnvironment = { ...baseEnv, NODE_ENV: 'test', FAKE_NPM_MODE: 'success' }
  writeNpmFixtureControl(nodeModulesPublishEnvironment)
  const nodeModulesPublishChild = spawn(process.execPath, [
    '--',
    join(repo, 'scripts/sync-all.mjs'),
    '--apply',
    '--to',
    dsVersion,
    '--json',
    '--test-node-modules-publish-handshake',
  ], {
    cwd: repo,
    env: nodeModulesPublishEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })
  let nodeModulesPublishStdout = ''
  let nodeModulesPublishStderr = ''
  nodeModulesPublishChild.stdout.on('data', (chunk) => { nodeModulesPublishStdout += chunk })
  nodeModulesPublishChild.stderr.on('data', (chunk) => { nodeModulesPublishStderr += chunk })
  const nodeModulesPublishExit = new Promise((resolvePromise, rejectPromise) => {
    nodeModulesPublishChild.once('exit', (code, signal) => resolvePromise({ code, signal }))
    nodeModulesPublishChild.once('error', rejectPromise)
  })
  const nodeModulesPublishLease = await new Promise((resolvePromise, rejectPromise) => {
    const pointerPath = join(repo, '.governance-upgrade-journal.json')
    const poll = setInterval(() => {
      if (
        !nodeModulesPublishStderr.includes('GOV-UPGRADE-TEST-NODE-MODULES-PUBLISH-READY')
        || !existsSync(pointerPath)
      ) return
      try {
        const lease = JSON.parse(readFileSync(pointerPath, 'utf8'))
        const state = readCurrentJournalState(repo)
        if (
          lease.kind !== 'governance-upgrade-journal-lease'
          || lease.owner?.pid !== nodeModulesPublishChild.pid
          || state.nodeModules?.afterRecorded !== true
          || state.nodeModules?.replacementStarted !== false
        ) return
        clearInterval(poll)
        clearTimeout(timeout)
        resolvePromise(lease)
      } catch { /* wait for one complete immutable state */ }
    }, 1)
    const timeout = setTimeout(() => {
      clearInterval(poll)
      nodeModulesPublishChild.kill('SIGKILL')
      rejectPromise(new Error(`node_modules publish harness timed out:${nodeModulesPublishStdout}\n${nodeModulesPublishStderr}`))
    }, 30000)
  })
  // Only the symlink target bytes change here. The target files, their bytes, and every other
  // path remain unchanged, so accepting this race would prove the tree identity omitted readlink.
  rmSync(predecessorFingerprintLink)
  symlinkSync('.fingerprint-target-b', predecessorFingerprintLink)
  writeFileSync(
    join(nodeModulesPublishLease.transactionRoot, '.governance-upgrade-test-node-modules-publish-ack'),
    'ACK\n',
    { flag: 'wx', mode: 0o600 },
  )
  const nodeModulesPublishResult = await nodeModulesPublishExit
  const nodeModulesPublishReport = parseReport(
    { stdout: nodeModulesPublishStdout, stderr: nodeModulesPublishStderr },
    'node_modules pre-publication CAS',
  )
  if (
    nodeModulesPublishResult.code !== 1
    || nodeModulesPublishResult.signal !== null
    || nodeModulesPublishReport.rollback?.restored !== false
    || !nodeModulesPublishReport.diagnostics.some((item) => item.message.includes('unknown post-journal node_modules content'))
    || readlinkSync(predecessorFingerprintLink) !== '.fingerprint-target-b'
    || !existsSync(join(repo, '.governance-upgrade-journal.json'))
  ) throw new Error(`node_modules pre-publication race was erased or accepted:${nodeModulesPublishStdout}\n${nodeModulesPublishStderr}`)
  rmSync(predecessorFingerprintLink)
  symlinkSync('.fingerprint-target-a', predecessorFingerprintLink)
  const nodeModulesPublishRecovery = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
  const nodeModulesPublishRecoveryReport = parseReport(nodeModulesPublishRecovery, 'node_modules pre-publication recovery')
  if (
    nodeModulesPublishRecovery.status !== 0
    || !nodeModulesPublishRecoveryReport.diagnostics.some((item) => item.ruleId === 'GOV-UPGRADE-RECOVERY-001')
    || existsSync(join(repo, '.governance-upgrade-journal.json'))
  ) throw new Error(`node_modules pre-publication recovery did not converge:${nodeModulesPublishRecovery.stdout}\n${nodeModulesPublishRecovery.stderr}`)
  assertSnapshotEqual(snapshot(), nodeModulesPublishBefore, 'node_modules pre-publication race recovery')
  console.log('✅ node_modules CAS: symlink-target pre-publication mutation is preserved, blocks rollback, and recovers only after reconciliation')

  const consumerRoleGapBefore = snapshot()
  const consumerRoleGapManifest = join(repo, 'governance/provider-cli-toolchain.json')
  const consumerRoleGapEnvironment = { ...baseEnv, NODE_ENV: 'test', FAKE_NPM_MODE: 'success' }
  writeNpmFixtureControl(consumerRoleGapEnvironment)
  const consumerRoleGapChild = spawn(process.execPath, [
    '--',
    join(repo, 'scripts/sync-all.mjs'),
    '--apply',
    '--to',
    dsVersion,
    '--json',
    '--test-consumer-role-gap-handshake',
  ], {
    cwd: repo,
    env: consumerRoleGapEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })
  let consumerRoleGapStdout = ''
  let consumerRoleGapStderr = ''
  consumerRoleGapChild.stdout.on('data', (chunk) => { consumerRoleGapStdout += chunk })
  consumerRoleGapChild.stderr.on('data', (chunk) => { consumerRoleGapStderr += chunk })
  const consumerRoleGapExit = new Promise((resolvePromise, rejectPromise) => {
    consumerRoleGapChild.once('exit', (code, signal) => resolvePromise({ code, signal }))
    consumerRoleGapChild.once('error', rejectPromise)
  })
  await new Promise((resolvePromise, rejectPromise) => {
    const pointerPath = join(repo, '.governance-upgrade-journal.json')
    const poll = setInterval(() => {
      if (
        !consumerRoleGapStderr.includes('GOV-UPGRADE-TEST-CONSUMER-ROLE-GAP-READY')
        || !existsSync(pointerPath)
      ) return
      try {
        const state = readCurrentJournalState(repo)
        const governanceEntry = state.entries?.find((entry) => entry.path === 'governance')
        if (
          governanceEntry?.replacementStarted !== true
          || governanceEntry.replacementCompleted !== false
          || existsSync(consumerRoleGapManifest)
        ) return
        clearInterval(poll)
        clearTimeout(timeout)
        resolvePromise()
      } catch { /* wait for the path-absent, journaled governance state */ }
    }, 1)
    const timeout = setTimeout(() => {
      clearInterval(poll)
      consumerRoleGapChild.kill('SIGKILL')
      rejectPromise(new Error(`consumer role-gap harness timed out:${consumerRoleGapStdout}\n${consumerRoleGapStderr}`))
    }, 30000)
  })
  consumerRoleGapChild.kill('SIGKILL')
  const consumerRoleGapKilled = await consumerRoleGapExit
  if (
    consumerRoleGapKilled.code !== null
    || consumerRoleGapKilled.signal !== 'SIGKILL'
    || existsSync(consumerRoleGapManifest)
    || !existsSync(join(repo, '.governance-upgrade-journal.json'))
  ) throw new Error(`consumer role-gap fixture did not stop in the intended controlled gap:${consumerRoleGapStdout}\n${consumerRoleGapStderr}`)
  const consumerRoleGapRecovery = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
  const consumerRoleGapRecoveryReport = parseReport(consumerRoleGapRecovery, 'consumer role-gap recovery')
  if (
    consumerRoleGapRecovery.status !== 0
    || !consumerRoleGapRecoveryReport.diagnostics.some((item) => item.ruleId === 'GOV-UPGRADE-RECOVERY-001')
    || consumerRoleGapRecoveryReport.diagnostics.some((item) => item.ruleId === 'GOV-UPGRADE-ROLE-001')
    || !existsSync(consumerRoleGapManifest)
    || existsSync(join(repo, '.governance-upgrade-journal.json'))
  ) throw new Error(`consumer role-gap recovery did not authenticate its immutable before-image:${consumerRoleGapRecovery.stdout}\n${consumerRoleGapRecovery.stderr}`)
  assertSnapshotEqual(snapshot(), consumerRoleGapBefore, 'consumer role-gap recovery')
  console.log('✅ role recovery: path-absent live consumer manifest authenticates the immutable before-image and recovers after SIGKILL')

  const concurrentBefore = snapshot()
  const firstConcurrentEnvironment = { ...baseEnv, FAKE_NPM_MODE: 'success', FAKE_FETCH_DELAY_MS: '100' }
  writeNpmFixtureControl(firstConcurrentEnvironment)
  const firstConcurrent = spawn(process.execPath, ['--', join(repo, 'scripts/sync-all.mjs'), '--apply', '--to', dsVersion, '--json'], {
    cwd: repo,
    env: firstConcurrentEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })
  let firstConcurrentStdout = ''
  let firstConcurrentStderr = ''
  firstConcurrent.stdout.on('data', (chunk) => { firstConcurrentStdout += chunk })
  firstConcurrent.stderr.on('data', (chunk) => { firstConcurrentStderr += chunk })
  await new Promise((resolvePromise, rejectPromise) => {
    const journal = join(repo, '.governance-upgrade-journal.json')
    const poll = setInterval(() => {
      if (!existsSync(journal)) return
      clearInterval(poll)
      clearTimeout(timeout)
      resolvePromise()
    }, 1)
    const timeout = setTimeout(() => {
      clearInterval(poll)
      rejectPromise(new Error(`first concurrent writer did not publish its lock:${firstConcurrentStdout}\n${firstConcurrentStderr}`))
    }, 10000)
  })
  const secondConcurrent = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--apply', '--to', dsVersion, '--json'], {
    env: { ...baseEnv, FAKE_NPM_MODE: 'success' },
  })
  if (secondConcurrent.status !== 2 || !secondConcurrent.stderr.includes('upgrade transaction is still active')) {
    firstConcurrent.kill('SIGKILL')
    throw new Error(`second real process did not fail closed behind the live owner:${secondConcurrent.stdout}\n${secondConcurrent.stderr}`)
  }
  firstConcurrent.kill('SIGTERM')
  const firstConcurrentExit = await new Promise((resolvePromise, rejectPromise) => {
    firstConcurrent.once('exit', (code, signal) => resolvePromise({ code, signal }))
    firstConcurrent.once('error', rejectPromise)
  })
  if (
    firstConcurrentExit.code !== 143
    || existsSync(join(repo, '.governance-upgrade-journal.json'))
    || run('git', ['status', '--porcelain']).stdout.trim()
  ) throw new Error(`first concurrent writer did not roll back cleanly:${JSON.stringify(firstConcurrentExit)}\n${firstConcurrentStdout}\n${firstConcurrentStderr}`)
  assertSnapshotEqual(snapshot(), concurrentBefore, 'real two-process lock race')
  console.log('✅ concurrency safety: two real sync-all processes elect one owner; the loser performs zero mutation')

  const substitutedBefore = snapshot()
  const substitutedPointerPath = join(repo, '.governance-upgrade-journal.json')
  const substitutedEnvironment = { ...baseEnv, NODE_ENV: 'test', FAKE_NPM_MODE: 'success' }
  writeNpmFixtureControl(substitutedEnvironment)
  const substitutedChild = spawn(process.execPath, [
    '--',
    join(repo, 'scripts/sync-all.mjs'),
    '--apply',
    '--to',
    dsVersion,
    '--json',
    '--test-journal-release-handshake',
  ], {
    cwd: repo,
    env: substitutedEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })
  let substitutedStdout = ''
  let substitutedStderr = ''
  substitutedChild.stdout.on('data', (chunk) => { substitutedStdout += chunk })
  substitutedChild.stderr.on('data', (chunk) => { substitutedStderr += chunk })
  const substitutedExit = new Promise((resolvePromise, rejectPromise) => {
    substitutedChild.once('exit', (code, signal) => resolvePromise({ code, signal }))
    substitutedChild.once('error', rejectPromise)
  })
  const publishedLease = await new Promise((resolvePromise, rejectPromise) => {
    const poll = setInterval(() => {
      if (
        !substitutedStderr.includes('GOV-UPGRADE-TEST-JOURNAL-RELEASE-READY')
        || !existsSync(substitutedPointerPath)
      ) return
      try {
        const lease = JSON.parse(readFileSync(substitutedPointerPath, 'utf8'))
        if (
          lease.kind !== 'governance-upgrade-journal-lease'
          || lease.owner?.pid !== substitutedChild.pid
          || !existsSync(join(lease.transactionRoot, '.governance-upgrade-journal.lease'))
        ) return
        clearInterval(poll)
        clearTimeout(timeout)
        resolvePromise(lease)
      } catch { /* publication is observed only after a complete immutable lease is readable */ }
    }, 1)
    const timeout = setTimeout(() => {
      clearInterval(poll)
      substitutedChild.kill('SIGKILL')
      rejectPromise(new Error(`substitution harness did not reach the validated pre-release transition:${substitutedStdout}\n${substitutedStderr}`))
    }, 30000)
  })
  const substitutedBytes = Buffer.from('external same-name bytes must survive\n')
  rmSync(substitutedPointerPath)
  writeFileSync(substitutedPointerPath, substitutedBytes, { flag: 'wx', mode: 0o600 })
  writeFileSync(
    join(publishedLease.transactionRoot, '.governance-upgrade-test-release-ack'),
    'ACK\n',
    { flag: 'wx', mode: 0o600 },
  )
  const substitutedResult = await substitutedExit
  const substitutedReport = parseReport(
    { stdout: substitutedStdout, stderr: substitutedStderr },
    'post-validation journal substitution',
  )
  const captureRoots = readdirSync(publishedLease.transactionRoot)
    .filter((name) => name.startsWith('.governance-upgrade-lease-release-'))
  const capturedPointerPath = captureRoots.length === 1
    ? join(publishedLease.transactionRoot, captureRoots[0], 'captured')
    : null
  const substitutedPointerInfo = lstatSync(substitutedPointerPath)
  const capturedPointerInfo = capturedPointerPath === null ? null : lstatSync(capturedPointerPath)
  if (
    substitutedResult.code !== 1
    || substitutedResult.signal !== null
    || !substitutedReport.diagnostics.some((item) => item.message.includes('captured bytes were preserved'))
    || substitutedReport.rollback?.restored !== false
    || substitutedReport.rollback?.recoveryJournal !== join(realpathSync(repo), '.governance-upgrade-journal.json')
    || !readFileSync(substitutedPointerPath).equals(substitutedBytes)
    || capturedPointerPath === null
    || !readFileSync(capturedPointerPath).equals(substitutedBytes)
    || substitutedPointerInfo.dev !== capturedPointerInfo.dev
    || substitutedPointerInfo.ino !== capturedPointerInfo.ino
    || substitutedPointerInfo.nlink !== 2
    || capturedPointerInfo.nlink !== 2
    || !existsSync(publishedLease.transactionRoot)
    || !existsSync(join(publishedLease.transactionRoot, '.governance-upgrade-journal.lease'))
    || !existsSync(join(publishedLease.transactionRoot, '.governance-upgrade-journal-states'))
  ) {
    throw new Error(`same-name journal substitution was overwritten or discarded:${JSON.stringify(substitutedResult)}\n${substitutedStdout}\n${substitutedStderr}`)
  }
  assertSnapshotEqual(snapshot(), substitutedBefore, 'same-name journal substitution')
  rmSync(substitutedPointerPath)
  rmSync(publishedLease.transactionRoot, { recursive: true, force: true })
  console.log('✅ concurrency safety: post-validation journal substitution is captured, restored no-replace, and retains the capability root')

  const nodeModulesCommitBefore = snapshot()
  const nodeModulesCommitEnvironment = { ...baseEnv, NODE_ENV: 'test', FAKE_NPM_MODE: 'success' }
  writeNpmFixtureControl(nodeModulesCommitEnvironment)
  const nodeModulesCommitChild = spawn(process.execPath, [
    '--',
    join(repo, 'scripts/sync-all.mjs'),
    '--apply',
    '--to',
    dsVersion,
    '--json',
    '--test-journal-release-handshake',
  ], {
    cwd: repo,
    env: nodeModulesCommitEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })
  let nodeModulesCommitStdout = ''
  let nodeModulesCommitStderr = ''
  nodeModulesCommitChild.stdout.on('data', (chunk) => { nodeModulesCommitStdout += chunk })
  nodeModulesCommitChild.stderr.on('data', (chunk) => { nodeModulesCommitStderr += chunk })
  const nodeModulesCommitExit = new Promise((resolvePromise, rejectPromise) => {
    nodeModulesCommitChild.once('exit', (code, signal) => resolvePromise({ code, signal }))
    nodeModulesCommitChild.once('error', rejectPromise)
  })
  const nodeModulesCommitLease = await new Promise((resolvePromise, rejectPromise) => {
    const pointerPath = join(repo, '.governance-upgrade-journal.json')
    const poll = setInterval(() => {
      if (
        !nodeModulesCommitStderr.includes('GOV-UPGRADE-TEST-JOURNAL-RELEASE-READY')
        || !existsSync(pointerPath)
      ) return
      try {
        const lease = JSON.parse(readFileSync(pointerPath, 'utf8'))
        const state = readCurrentJournalState(repo)
        if (
          lease.kind !== 'governance-upgrade-journal-lease'
          || lease.owner?.pid !== nodeModulesCommitChild.pid
          || state.nodeModules?.replacementCompleted !== true
        ) return
        clearInterval(poll)
        clearTimeout(timeout)
        resolvePromise(lease)
      } catch { /* wait for one complete immutable state */ }
    }, 1)
    const timeout = setTimeout(() => {
      clearInterval(poll)
      nodeModulesCommitChild.kill('SIGKILL')
      rejectPromise(new Error(`node_modules commit harness timed out:${nodeModulesCommitStdout}\n${nodeModulesCommitStderr}`))
    }, 30000)
  })
  const commitUnknownCanary = join(repo, 'node_modules/commit-unknown.txt')
  writeFileSync(commitUnknownCanary, 'post-verification pre-commit unknown bytes\n', { flag: 'wx' })
  writeFileSync(
    join(nodeModulesCommitLease.transactionRoot, '.governance-upgrade-test-release-ack'),
    'ACK\n',
    { flag: 'wx', mode: 0o600 },
  )
  const nodeModulesCommitResult = await nodeModulesCommitExit
  const nodeModulesCommitReport = parseReport(
    { stdout: nodeModulesCommitStdout, stderr: nodeModulesCommitStderr },
    'node_modules commit CAS',
  )
  if (
    nodeModulesCommitResult.code !== 1
    || nodeModulesCommitResult.signal !== null
    || nodeModulesCommitReport.rollback?.restored !== false
    || !nodeModulesCommitReport.diagnostics.some((item) => item.message.includes('unknown post-journal node_modules content'))
    || !existsSync(commitUnknownCanary)
    || !existsSync(join(repo, '.governance-upgrade-journal.json'))
  ) throw new Error(`node_modules commit race was erased or accepted:${nodeModulesCommitStdout}\n${nodeModulesCommitStderr}`)
  rmSync(commitUnknownCanary)
  const nodeModulesCommitRecovery = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
  const nodeModulesCommitRecoveryReport = parseReport(nodeModulesCommitRecovery, 'node_modules commit recovery')
  if (
    nodeModulesCommitRecovery.status !== 0
    || !nodeModulesCommitRecoveryReport.diagnostics.some((item) => item.ruleId === 'GOV-UPGRADE-RECOVERY-001')
    || existsSync(join(repo, '.governance-upgrade-journal.json'))
  ) throw new Error(`node_modules commit recovery did not converge:${nodeModulesCommitRecovery.stdout}\n${nodeModulesCommitRecovery.stderr}`)
  assertSnapshotEqual(snapshot(), nodeModulesCommitBefore, 'node_modules commit race recovery')
  console.log('✅ node_modules CAS: post-verification mutation blocks commit, remains preserved, and is recoverable after reconciliation')

  const beforeRealSigkill = snapshot()
  await killAfterJournaledReplacementStarts({ ...baseEnv, FAKE_NPM_MODE: 'success' })
  if (!existsSync(join(repo, '.governance-upgrade-journal.json'))) {
    throw new Error('real SIGKILL phase harness lost its recovery pointer')
  }
  const sigkillRecovery = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
  const sigkillRecoveryReport = parseReport(sigkillRecovery, 'real SIGKILL recovery')
  if (
    sigkillRecovery.status !== 0
    || !sigkillRecoveryReport.diagnostics.some((item) => item.ruleId === 'GOV-UPGRADE-RECOVERY-001')
    || existsSync(join(repo, '.governance-upgrade-journal.json'))
    || run('git', ['status', '--porcelain']).stdout.trim()
  ) throw new Error(`real SIGKILL recovery did not converge:${sigkillRecovery.stdout}\n${sigkillRecovery.stderr}`)
  assertSnapshotEqual(snapshot(), beforeRealSigkill, 'real SIGKILL recovery')
  console.log('✅ recovery: real SIGKILL after a live rename converges to the exact predecessor')

  const providerCliStaticFailureBefore = snapshot()
  const providerCliStaticFailure = run(process.execPath, [
    join(repo, 'scripts/sync-all.mjs'),
    '--apply',
    '--to',
    dsVersion,
    '--json',
  ], {
    env: {
      ...baseEnv,
      FAKE_PROVIDER_CLI_MODE: 'corrupt-content',
    },
  })
  const providerCliStaticFailureReport = parseReport(
    providerCliStaticFailure,
    'provider CLI candidate static-verification failure',
  )
  if (
    providerCliStaticFailure.status === 0
    || providerCliStaticFailureReport.ready !== false
    || providerCliStaticFailureReport.providerCli !== null
    || !providerCliStaticFailureReport.rollback?.restored
    || !providerCliStaticFailureReport.diagnostics.some(item => (
      item.severity === 'BLOCKER'
        && item.message.includes('fixture receipt')
    ))
    || existsSync(providerCliExecutionMarker)
    || existsSync(join(repo, '.governance-upgrade-journal.json'))
    || baseEnv.PROVIDER_CLI_POISON_SECRET !== providerCliPoisonSecret
    || run('git', ['status', '--porcelain']).stdout.trim()
  ) {
    throw new Error(`provider CLI corrupt candidate did not fail closed:${providerCliStaticFailure.stdout}\n${providerCliStaticFailure.stderr}`)
  }
  assertSnapshotEqual(
    snapshot(),
    providerCliStaticFailureBefore,
    'provider CLI candidate static-verification failure',
  )
  console.log('✅ provider CLI lifecycle: corrupt static candidate rolls back with zero provider execution')

  const success = run(process.execPath, [
    join(repo, 'scripts/sync-all.mjs'),
    '--apply',
    '--to',
    dsVersion,
    '--json',
    '--test-transaction-gc-failure',
  ], {
    env: { ...baseEnv, NODE_ENV: 'test', FAKE_NPM_MODE: 'success' },
  })
  const successReport = parseReport(success, 'success transaction')
  if (
    success.status !== 0
    || successReport.syntaxValid !== true
    || successReport.targetVerification !== 'verified'
    || successReport.targetVerified !== true
    || successReport.ready !== true
    || !successReport.provenance?.bomSha256
    || !successReport.verification?.ok
    || successReport.verification?.providerCliExecutableRunsInWriter !== false
    || successReport.rollback
    || successReport.toolchain?.npm !== exactNpmVersion
    || successReport.transactionGarbageCollection?.completed !== false
    || !existsSync(successReport.transactionGarbageCollection?.retainedPath || '')
    || existsSync(join(repo, '.governance-upgrade-journal.json'))
    || !successReport.diagnostics.some((item) => item.ruleId === 'GOV-UPGRADE-GC-001')
  ) {
    throw new Error(`success transaction not certified:${success.stdout}\n${success.stderr}`)
  }
  rmSync(successReport.transactionGarbageCollection.retainedPath, { recursive: true, force: true })
  const expectedProviderCliReportKeys = [
    'authorityDigest',
    'candidateStaticVerified',
    'executablesProbed',
    'liveStaticVerified',
    'lockDigest',
    'platform',
    'role',
    'runtimeCertified',
    'sandboxStaticVerified',
    'staticVerified',
  ].sort()
  const providerCliReport = successReport.providerCli
  const liveProviderCliManifestPath = join(repo, 'governance/provider-cli-toolchain.json')
  const liveProviderCliLockPath = join(repo, 'governance/provider-cli-toolchain.package-lock.json')
  const liveProviderCliManifest = JSON.parse(readFileSync(liveProviderCliManifestPath, 'utf8'))
  const expectedProviderCliPlatform = `${process.platform}-${process.arch}`
  if (
    !providerCliReport
    || JSON.stringify(Object.keys(providerCliReport).sort()) !== JSON.stringify(expectedProviderCliReportKeys)
    || providerCliReport.authorityDigest !== sha(readFileSync(liveProviderCliManifestPath))
    || providerCliReport.lockDigest !== sha(readFileSync(liveProviderCliLockPath))
    || providerCliReport.platform !== expectedProviderCliPlatform
    || providerCliReport.role !== 'consumer'
    || providerCliReport.staticVerified !== true
    || providerCliReport.executablesProbed !== false
    || providerCliReport.runtimeCertified !== false
    || providerCliReport.sandboxStaticVerified !== true
    || providerCliReport.candidateStaticVerified !== true
    || providerCliReport.liveStaticVerified !== true
  ) {
    throw new Error(`success transaction has an open or false provider CLI receipt:${JSON.stringify(providerCliReport)}`)
  }

  const providerCliTargetRelative = [
    liveProviderCliManifest.installPolicy.runtimeDirectory,
    'content-v2',
    expectedProviderCliPlatform,
    providerCliReport.authorityDigest,
  ].join('/')
  const providerCliTarget = join(repo, providerCliTargetRelative)
  const providerCliReceipt = JSON.parse(readFileSync(join(providerCliTarget, 'receipt.json'), 'utf8'))
  const expectedExecutables = liveProviderCliManifest.tools
    .map(tool => tool.executable)
    .sort()
  if (
    JSON.stringify(readdirSync(providerCliTarget).sort()) !== JSON.stringify(['fixture-bin', 'receipt.json'])
    || providerCliReceipt.schemaVersion !== 1
    || providerCliReceipt.kind !== PROVIDER_CLI_SYNC_FIXTURE_RECEIPT_KIND
    || providerCliReceipt.authorityDigest !== providerCliReport.authorityDigest
    || providerCliReceipt.lockDigest !== providerCliReport.lockDigest
    || providerCliReceipt.platform !== expectedProviderCliPlatform
    || providerCliReceipt.executablesProbed !== false
    || JSON.stringify(providerCliReceipt.executables) !== JSON.stringify(expectedExecutables)
  ) {
    throw new Error(`published provider CLI fixture target differs from its static receipt:${JSON.stringify(providerCliReceipt)}`)
  }
  for (const executable of expectedExecutables) {
    const shim = join(repo, 'node_modules/.bin', executable)
    const shimInfo = lstatSync(shim)
    const binaryRelative = `${providerCliTargetRelative}/fixture-bin/${executable}.mjs`
    const binary = join(repo, binaryRelative)
    const binaryInfo = lstatSync(binary)
    if (
      !shimInfo.isFile()
      || shimInfo.isSymbolicLink()
      || shimInfo.nlink !== 1
      || (shimInfo.mode & 0o111) === 0
      || !readFileSync(shim).equals(providerCliFixtureShimBytes(executable, binaryRelative))
      || !binaryInfo.isFile()
      || binaryInfo.isSymbolicLink()
      || binaryInfo.nlink !== 1
      || (binaryInfo.mode & 0o111) === 0
      || !readFileSync(binary, 'utf8').includes('PROVIDER_CLI_EXECUTION_MARKER')
    ) throw new Error(`published provider CLI executable/shim is not the closed static fixture:${executable}`)
  }
  if (
    existsSync(poisonGitMarker)
    ||
    existsSync(providerCliExecutionMarker)
    || existsSync(predecessorLegacyRuntime)
    || readFileSync(join(repo, 'node_modules/.bin/claude'), 'utf8').includes('exit 99')
    || !readFileSync(join(repo, 'node_modules/.bin/claude'), 'utf8').includes(PROVIDER_CLI_SYNC_FIXTURE_SHIM_MARKER)
  ) throw new Error('provider CLI sync executed provider bytes or retained a poisoned predecessor runtime/shim')
  console.log('✅ closed Git: poisoned PATH git was never invoked by the full successful transaction')
  const liveNpmFixtureLink = join(repo, 'node_modules/.bin/npm-fixture')
  const liveNpmFixtureProbe = run(process.execPath, [liveNpmFixtureLink, '--version'], {
    env: { FAKE_NPM_VERSION: exactNpmVersion },
  })
  if (
    !lstatSync(liveNpmFixtureLink).isSymbolicLink()
    || readlinkSync(liveNpmFixtureLink) !== '../npm/bin/npm-cli.js'
    || liveNpmFixtureProbe.status !== 0
    || liveNpmFixtureProbe.stdout.trim() !== exactNpmVersion
  ) throw new Error(`candidate node_modules .bin link was rewritten to the deleted disposable sandbox:${liveNpmFixtureProbe.stderr}`)
  console.log(`✅ success: exact apply certified(${successReport.verification.attestationDigest.slice(0, 16)})`)
  console.log('✅ success: relative npm .bin symlink remains byte-exact and executable after disposable sandbox cleanup')
  must(run('git', ['add', '-A']), 'git add initial refreshed snapshot')
  if (run('git', ['diff', '--cached', '--quiet']).status !== 0) must(run('git', ['commit', '-qm', 'initial refresh fixture']), 'git commit initial refreshed snapshot')

  // A package release may carry a self-consistent workflow body, but ordinary sync-all is not the
  // authority to activate executable control-plane changes. Those require the recurring reviewed
  // control-plane update protocol, even when every candidate digest is internally consistent.
  const deltaCanonical = join(temp, 'delta-ds-canonical')
  cpSync(dsCanonical, deltaCanonical, { recursive: true })
  const deltaFork = join(deltaCanonical, 'fork')
  const deltaManifest = JSON.parse(readFileSync(join(deltaFork, 'manifest.json'), 'utf8'))
  const deltaDestination = '.github/workflows/audit.yml'
  const deltaArtifact = join(deltaFork, deltaManifest.consumer.managedFiles[deltaDestination])
  const deltaBody = readFileSync(deltaArtifact, 'utf8') + '\n# cross-version-managed-body-fixture\n'
  writeFileSync(deltaArtifact, deltaBody)
  const deltaLockPath = join(deltaFork, 'governance.lock')
  const deltaLock = JSON.parse(readFileSync(deltaLockPath, 'utf8'))
  const deltaEntry = deltaLock.entries.find((entry) => entry.file === deltaManifest.consumer.managedFiles[deltaDestination])
  if (!deltaEntry) throw new Error('delta managed artifact is absent from corpus lock')
  deltaEntry.sha256 = sha(deltaBody)
  writeFileSync(deltaLockPath, JSON.stringify(deltaLock, null, 2) + '\n')
  const deltaBomPath = join(deltaFork, 'consumer/lock.json')
  const deltaBom = JSON.parse(readFileSync(deltaBomPath, 'utf8'))
  deltaBom.payload.managedFiles[deltaDestination] = sha(deltaBody)
  deltaBom.payload.forkCorpusLockSha256 = sha(readFileSync(deltaLockPath))
  writeFileSync(deltaBomPath, JSON.stringify(deltaBom, null, 2) + '\n')
  const deltaBeforeWorkflow = readFileSync(join(repo, deltaDestination))
  const deltaBeforePackage = readFileSync(join(repo, 'package.json'))
  const deltaBeforeModules = inventory(join(repo, 'node_modules'))
  const delta = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--apply', '--to', dsVersion, '--json'], {
    env: { ...baseEnv, FAKE_DS_CANONICAL: deltaCanonical, FAKE_NPM_MODE: 'success' },
  })
  const deltaReport = parseReport(delta, 'cross-version managed-file delta')
  if (
    delta.status === 0
    || deltaReport.ok !== false
    || deltaReport.targetVerified !== false
    || deltaReport.ready !== false
    || !deltaReport.diagnostics.some((item) => (
      item.ruleId === 'GOV-UPGRADE-BOOTSTRAP-001'
      && item.message.includes(REVIEWED_CONTROL_PLANE_UPDATE_COMMAND)
    ))
    || run('git', ['status', '--porcelain']).stdout.trim()
    || !readFileSync(join(repo, deltaDestination)).equals(deltaBeforeWorkflow)
    || !readFileSync(join(repo, 'package.json')).equals(deltaBeforePackage)
    || inventory(join(repo, 'node_modules')) !== deltaBeforeModules
  ) throw new Error(`ordinary upgrade activated or leaked a candidate workflow:${delta.stdout}\n${delta.stderr}`)
  console.log('✅ failure: self-consistent candidate workflow cannot cross ordinary sync and is routed to recurring reviewed control-plane update')

  writeFileSync(join(repo, 'node_modules/original-only.txt'), 'original installed tree')

  const assertRollback = (result, label, before) => {
    if (result.status === 0) throw new Error(`${label} unexpectedly reported success`)
    const report = parseReport(result, label)
    const status = run('git', ['status', '--porcelain']).stdout.trim()
    const afterHead = run('git', ['rev-parse', 'HEAD']).stdout.trim()
    if (
      report.ready !== false
      || !report.rollback?.restored || status || before.head !== afterHead
      || !readFileSync(join(repo, 'package.json')).equals(before.package)
      || !readFileSync(join(repo, 'scripts/governance-check.mjs')).equals(before.checker)
      || inventory(join(repo, 'node_modules')) !== before.modules
      || inventoryPaths(repo, before.providerPaths) !== before.provider
      || inventoryPaths(repo, [before.commonPath]) !== before.common
      || existsSync(join(repo, '.governance-upgrade-journal.json'))
      || existsSync(join(repo, 'node_modules/attempt-only.txt'))
    ) throw new Error(`${label} rollback failed:report=${result.stdout};status=${status};head=${before.head}/${afterHead}`)
    return report
  }

  let before = snapshot()
  const installFailure = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--apply', '--to', dsVersion, '--json'], {
    env: { ...baseEnv, FAKE_NPM_MODE: 'install-failure' },
  })
  assertRollback(installFailure, 'install failure', before)
  console.log('✅ failure: partial npm mutation and installed tree rolled back byte-for-byte')

  before = snapshot()
  const signatureFailure = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--apply', '--to', dsVersion, '--json'], {
    env: { ...baseEnv, FAKE_NPM_MODE: 'signature-failure' },
  })
  assertRollback(signatureFailure, 'signature failure', before)
  console.log('✅ failure: unsigned/unverifiable upgraded payload rejected before execution and rolled back')

  before = snapshot()
  const highAuditFailure = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--apply', '--to', dsVersion, '--json'], {
    env: { ...baseEnv, FAKE_NPM_MODE: 'high-audit-failure' },
  })
  const highAuditFailureReport = assertRollback(highAuditFailure, 'high vulnerability audit failure', before)
  if (!highAuditFailureReport.diagnostics.some((item) => item.ruleId === 'GOV-SUPPLY-005')) {
    throw new Error(`high vulnerability audit failure did not reach the trusted supply-chain gate:${highAuditFailure.stdout}`)
  }
  console.log('✅ failure: high-severity vulnerability audit blocks the candidate and restores the exact predecessor')

  before = snapshot()
  const provenanceFailure = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--apply', '--to', dsVersion, '--json'], {
    env: { ...baseEnv, FAKE_NPM_MODE: 'success', FAKE_PROVENANCE_MODE: 'wrong-workflow' },
  })
  const provenanceFailureReport = assertRollback(provenanceFailure, 'provenance failure', before)
  if (!provenanceFailureReport.diagnostics.some((item) => item.ruleId === 'GOV-SUPPLY-003')) {
    throw new Error(`provenance failure did not reach the trusted supply-chain gate:${provenanceFailure.stdout}`)
  }
  console.log('✅ failure: wrong provenance workflow rejected before incoming manifest/checker execution and rolled back')

  const badCanonical = join(temp, 'bad-ds-canonical')
  cpSync(dsCanonical, badCanonical, { recursive: true })
  const badFork = join(badCanonical, 'fork')
  const badManifest = JSON.parse(readFileSync(join(badFork, 'manifest.json'), 'utf8'))
  const candidateSecretMarker = join(temp, 'candidate-secret-marker.txt')
  const candidateExecutionMarker = join(temp, 'candidate-execution-marker.txt')
  writeFileSync(candidateSecretMarker, 'candidate checker must never read this')
  const badCheckerBody = `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
writeFileSync(process.env.CANDIDATE_EXECUTION_MARKER, readFileSync(process.env.CANDIDATE_SECRET_MARKER))
writeFileSync('.git/candidate-checker-executed', 'candidate code reached git metadata')
process.stdout.write(JSON.stringify({ok:true}) + '\\n')
`
  const badInstructionArtifact = badManifest.providerSurfaces.codex.instructionArtifact
  const badInstructionBody = readFileSync(join(badFork, badInstructionArtifact), 'utf8') + '\n<!-- provider rollback fixture -->\n'
  const badCommonArtifact = badManifest.consumer.commonInstruction.artifact
  const badCommonBody = readFileSync(join(badFork, badCommonArtifact), 'utf8') + '\n<!-- common rollback fixture -->\n'
  writeFileSync(join(badFork, 'consumer/governance-check.mjs'), badCheckerBody)
  writeFileSync(join(badFork, badInstructionArtifact), badInstructionBody)
  writeFileSync(join(badFork, badCommonArtifact), badCommonBody)
  const badCorpusLockPath = join(badFork, 'governance.lock')
  const badCorpusLock = JSON.parse(readFileSync(badCorpusLockPath, 'utf8'))
  for (const [file, digest] of [
    ['consumer/governance-check.mjs', sha(badCheckerBody)],
    [badInstructionArtifact, sha(badInstructionBody)],
    [badCommonArtifact, sha(badCommonBody)],
  ]) {
    const entry = badCorpusLock.entries.find((candidate) => candidate.file === file)
    if (!entry) throw new Error(`post-check fixture corpus entry is missing:${file}`)
    entry.sha256 = digest
  }
  writeFileSync(badCorpusLockPath, JSON.stringify(badCorpusLock, null, 2) + '\n')
  const badBomPath = join(badFork, 'consumer/lock.json')
  const badBom = JSON.parse(readFileSync(badBomPath, 'utf8'))
  badBom.payload.forkCorpusLockSha256 = sha(readFileSync(badCorpusLockPath))
  badBom.payload.governanceCheckSha256 = sha(badCheckerBody)
  badBom.payload.commonInstructionSha256 = sha(badCommonBody)
  writeFileSync(badBomPath, JSON.stringify(badBom, null, 2) + '\n')
  before = snapshot()
  const postcheckFailure = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--apply', '--to', dsVersion, '--json'], {
    env: {
      ...baseEnv,
      FAKE_DS_CANONICAL: badCanonical,
      FAKE_NPM_MODE: 'postcheck-failure',
      CANDIDATE_SECRET_MARKER: candidateSecretMarker,
      CANDIDATE_EXECUTION_MARKER: candidateExecutionMarker,
    },
  })
  assertRollback(postcheckFailure, 'protected checker takeover', before)
  if (
    existsSync(candidateExecutionMarker)
    || existsSync(join(repo, '.git/candidate-checker-executed'))
  ) throw new Error(`candidate checker executed or bypassed the reviewed-bootstrap boundary:${postcheckFailure.stdout}\n${postcheckFailure.stderr}`)
  console.log('✅ failure: candidate checker/control-plane takeover rejected before reading secrets, touching git metadata, or executing candidate code')

  before = snapshot()
  const downgrade = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--apply', '--to', '0.1.0-beta.1', '--json'], { env: baseEnv })
  const downgradeReport = parseReport(downgrade, 'downgrade rejection')
  if (
    downgrade.status === 0
    || !downgradeReport.diagnostics.some((item) => item.ruleId === 'GOV-VERSION-003')
    || inventory(join(repo, 'node_modules')) !== before.modules
    || !readFileSync(join(repo, 'package.json')).equals(before.package)
  ) throw new Error(`downgrade was not rejected before mutation:${downgrade.stdout}\n${downgrade.stderr}`)
  console.log('✅ failure: authenticated but older release rejected before mutation')

  // Simulate the only state a finally block cannot catch: process death after journal creation and
  // after node_modules was moved. The next read-only invocation must recover before parsing inputs.
  // This harness deliberately claims process-crash recovery, not storage power-loss durability.
  const canonicalRepo = realpathSync(repo)
  const recoveryId = randomUUID()
  const recoveryRoot = join(dirname(canonicalRepo), `.governance-upgrade-${recoveryId}`)
  mkdirSync(recoveryRoot, { mode: 0o700 })
  writeFileSync(join(recoveryRoot, '.governance-upgrade-owner.json'), JSON.stringify({
    schemaVersion: 2, repoRoot: canonicalRepo, transactionId: recoveryId, owner: DEAD_OWNER,
  }, null, 2) + '\n', { mode: 0o600 })
  const recoveryEntries = TRANSACTION_PATHS.map((path, index) => {
    const source = join(canonicalRepo, path)
    const backup = join(recoveryRoot, String(index))
    const present = existsSync(source)
    if (present) cpSync(source, backup, { recursive: true })
    return withBeforeState({ path, source, backup, present })
  })
  const modulesBackup = join(recoveryRoot, 'node_modules')
  const recoveryPackage = readFileSync(join(repo, 'package.json'))
  const recoveryModules = inventory(join(repo, 'node_modules'))
  renameSync(join(repo, 'node_modules'), modulesBackup)
  mkdirSync(join(repo, 'node_modules'))
  writeFileSync(join(repo, 'node_modules/attempt-only.txt'), 'interrupted install')
  writeFileSync(join(repo, '.governance-upgrade-journal.json'), JSON.stringify({
    schemaVersion: 5,
    repoRoot: canonicalRepo,
    transactionId: recoveryId,
    transactionRoot: recoveryRoot,
    owner: DEAD_OWNER,
    entries: recoveryEntries,
    nodeModules: { source: join(canonicalRepo, 'node_modules'), backup: modulesBackup, present: true },
    providerSnapshot: null,
    commonSnapshot: null,
  }, null, 2) + '\n', { mode: 0o600 })
  const recovery = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
  const recoveryReport = parseReport(recovery, 'journal recovery')
  if (
    recovery.status !== 0
    || !recoveryReport.diagnostics.some((item) => item.ruleId === 'GOV-UPGRADE-RECOVERY-001')
    || !readFileSync(join(repo, 'package.json')).equals(recoveryPackage)
    || inventory(join(repo, 'node_modules')) !== recoveryModules
    || existsSync(join(repo, '.governance-upgrade-journal.json'))
    || existsSync(recoveryRoot)
    || run('git', ['status', '--porcelain']).stdout.trim()
  ) throw new Error(`process-crash recovery failed:${recovery.stdout}\n${recovery.stderr}`)
  console.log('✅ recovery: interrupted process journal restored exact source and node_modules')

  // Crash after the authenticated provider/common snapshot commit point. This proves that the
  // common instruction is neither omitted from rollback nor trusted from an unauthenticated
  // journal path: its destination is re-derived from the staged, locked incoming corpus.
  const authenticatedBefore = snapshot()
  const authenticatedRecoveryId = randomUUID()
  const authenticatedRecoveryRoot = join(dirname(canonicalRepo), `.governance-upgrade-${authenticatedRecoveryId}`)
  mkdirSync(authenticatedRecoveryRoot, { mode: 0o700 })
  writeFileSync(join(authenticatedRecoveryRoot, '.governance-upgrade-owner.json'), JSON.stringify({
    schemaVersion: 2, repoRoot: canonicalRepo, transactionId: authenticatedRecoveryId, owner: DEAD_OWNER,
  }, null, 2) + '\n', { mode: 0o600 })
  const authenticatedEntries = TRANSACTION_PATHS.map((path, index) => {
    const source = join(canonicalRepo, path)
    const backup = join(authenticatedRecoveryRoot, String(index))
    const present = existsSync(source)
    if (present) cpSync(source, backup, { recursive: true })
    return withBeforeState({ path, source, backup, present })
  })
  const evidenceRoot = join(authenticatedRecoveryRoot, 'provider-evidence')
  const stagedDesignSystem = join(evidenceRoot, 'node_modules/@qijenchen/design-system')
  mkdirSync(stagedDesignSystem, { recursive: true })
  for (const runtimePath of ['package.json', 'package-lock.json']) {
    cpSync(join(repo, runtimePath), join(evidenceRoot, runtimePath))
  }
  cpSync(join(repo, 'node_modules/@qijenchen/design-system/package.json'), join(stagedDesignSystem, 'package.json'))
  cpSync(join(repo, 'node_modules/@qijenchen/design-system/ds-canonical/fork'), join(stagedDesignSystem, 'ds-canonical/fork'), { recursive: true })
  mkdirSync(join(stagedDesignSystem, 'src/tokens'), { recursive: true })
  cpSync(join(repo, 'node_modules/@qijenchen/design-system/src/tokens/utility-registry.json'), join(stagedDesignSystem, 'src/tokens/utility-registry.json'))
  const authenticatedCorpus = validateInstalledForkCorpus(evidenceRoot)
  const authenticatedProviderPaths = collectProviderMutationPaths(authenticatedCorpus.manifest)
  const providerStaging = join(authenticatedRecoveryRoot, 'provider-staging')
  mkdirSync(providerStaging)
  const authenticatedProviderEntries = authenticatedProviderPaths.map((record, index) => {
    const source = join(canonicalRepo, record.path)
    const backup = join(providerStaging, String(index))
    const present = existsSync(source)
    if (present) cpSync(source, backup, { recursive: true })
    return withBeforeState({ path: record.path, source, backup, present })
  })
  const authenticatedCommonPath = authenticatedCorpus.manifest.consumer.commonInstruction.destination
  const authenticatedCommonSource = join(canonicalRepo, authenticatedCommonPath)
  const commonStaging = join(authenticatedRecoveryRoot, 'common-staging')
  const authenticatedCommonBackup = join(commonStaging, '0')
  mkdirSync(commonStaging)
  const authenticatedCommonPresent = existsSync(authenticatedCommonSource)
  if (authenticatedCommonPresent) cpSync(authenticatedCommonSource, authenticatedCommonBackup)
  const authenticatedModulesBackup = join(authenticatedRecoveryRoot, 'node_modules')
  renameSync(join(repo, 'node_modules'), authenticatedModulesBackup)
  writeFileSync(join(repo, 'package.json'), '{authenticated-interruption')
  for (const [index, record] of authenticatedProviderPaths.entries()) {
    const target = join(repo, record.path)
    rmSync(target, { recursive: true, force: true })
    if (index === 0) {
      if (record.kind === 'tree') {
        mkdirSync(target, { recursive: true })
        writeFileSync(join(target, 'interrupted.txt'), 'interrupted provider tree')
      } else {
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, 'interrupted provider file')
      }
    }
  }
  mkdirSync(dirname(authenticatedCommonSource), { recursive: true })
  writeFileSync(authenticatedCommonSource, 'interrupted common instruction')
  mkdirSync(join(repo, 'node_modules'))
  writeFileSync(join(repo, 'node_modules/attempt-only.txt'), 'interrupted authenticated install')
  const authenticatedKnownEntries = authenticatedEntries.map(withAfterState)
  const authenticatedKnownProviderEntries = authenticatedProviderEntries.map(withAfterState)
  const authenticatedKnownCommon = withAfterState({
    path: authenticatedCommonPath,
    source: authenticatedCommonSource,
    backup: authenticatedCommonBackup,
    present: authenticatedCommonPresent,
    beforeFingerprint: authenticatedCommonPresent ? pathFingerprint(authenticatedCommonBackup) : null,
    afterRecorded: false,
    afterPresent: false,
    afterFingerprint: null,
  })
  const authenticatedLiveStaging = join(authenticatedRecoveryRoot, 'live-staging')
  for (const [index, entry] of authenticatedKnownEntries.entries()) {
    if (!entry.present) continue
    const destination = join(authenticatedLiveStaging, 'fixed', String(index))
    mkdirSync(dirname(destination), { recursive: true })
    cpSync(entry.backup, destination, { recursive: true })
  }
  for (const [index, entry] of authenticatedKnownProviderEntries.entries()) {
    if (!entry.present) continue
    const destination = join(authenticatedLiveStaging, 'provider', String(index))
    mkdirSync(dirname(destination), { recursive: true })
    cpSync(entry.backup, destination, { recursive: true })
  }
  if (authenticatedKnownCommon.present) {
    const destination = join(authenticatedLiveStaging, 'common', '0')
    mkdirSync(dirname(destination), { recursive: true })
    cpSync(authenticatedKnownCommon.backup, destination)
  }
  writeFileSync(join(repo, '.governance-upgrade-journal.json'), JSON.stringify({
    schemaVersion: 5,
    repoRoot: canonicalRepo,
    transactionId: authenticatedRecoveryId,
    transactionRoot: authenticatedRecoveryRoot,
    owner: DEAD_OWNER,
    entries: authenticatedKnownEntries,
    nodeModules: { source: join(canonicalRepo, 'node_modules'), backup: authenticatedModulesBackup, present: true },
    providerSnapshot: {
      evidence: { ...authenticatedCorpus.evidence },
      evidenceRoot,
      paths: authenticatedProviderPaths.map((record) => ({ ...record })),
      entries: authenticatedKnownProviderEntries,
    },
    commonSnapshot: authenticatedKnownCommon,
  }, null, 2) + '\n', { mode: 0o600 })
  await killRecoveryAfterStagingAppears()
  if (!existsSync(join(repo, '.governance-upgrade-journal.json'))) {
    throw new Error('kill-during-recovery harness lost its recovery pointer')
  }
  const authenticatedRecovery = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
  const authenticatedRecoveryReport = parseReport(authenticatedRecovery, 'authenticated provider/common journal recovery')
  const authenticatedAfter = snapshot()
  if (
    authenticatedRecovery.status !== 0
    || !authenticatedRecoveryReport.diagnostics.some((item) => item.ruleId === 'GOV-UPGRADE-RECOVERY-001')
    || authenticatedAfter.modules !== authenticatedBefore.modules
    || !authenticatedAfter.package.equals(authenticatedBefore.package)
    || !authenticatedAfter.checker.equals(authenticatedBefore.checker)
    || authenticatedAfter.provider !== authenticatedBefore.provider
    || authenticatedAfter.common !== authenticatedBefore.common
    || authenticatedAfter.head !== authenticatedBefore.head
    || existsSync(join(repo, '.governance-upgrade-journal.json'))
    || existsSync(authenticatedRecoveryRoot)
    || run('git', ['status', '--porcelain']).stdout.trim()
  ) throw new Error(`authenticated provider/common crash recovery failed:${authenticatedRecovery.stdout}\n${authenticatedRecovery.stderr}`)
  console.log('✅ recovery: a real SIGKILL during authenticated fixed/provider/common restoration is reentrant and converges byte-for-byte')

  const buildAuthenticatedJournalFixture = (mutate, owner = DEAD_OWNER) => {
    const transactionId = randomUUID()
    const transactionRoot = join(dirname(canonicalRepo), `.governance-upgrade-${transactionId}`)
    mkdirSync(transactionRoot, { mode: 0o700 })
    writeFileSync(join(transactionRoot, '.governance-upgrade-owner.json'), JSON.stringify({
      schemaVersion: 2, repoRoot: canonicalRepo, transactionId, owner,
    }, null, 2) + '\n', { mode: 0o600 })
    const entries = TRANSACTION_PATHS.map((path, index) => {
      const source = join(canonicalRepo, path)
      const backup = join(transactionRoot, String(index))
      const present = existsSync(source)
      if (present) cpSync(source, backup, { recursive: true })
      return withBeforeState({ path, source, backup, present })
    })
    const fixtureEvidenceRoot = join(transactionRoot, 'provider-evidence')
    const fixtureDesignSystem = join(fixtureEvidenceRoot, 'node_modules/@qijenchen/design-system')
    mkdirSync(fixtureDesignSystem, { recursive: true })
    for (const runtimePath of ['package.json', 'package-lock.json']) {
      cpSync(join(repo, runtimePath), join(fixtureEvidenceRoot, runtimePath))
    }
    cpSync(join(repo, 'node_modules/@qijenchen/design-system/package.json'), join(fixtureDesignSystem, 'package.json'))
    cpSync(join(repo, 'node_modules/@qijenchen/design-system/ds-canonical/fork'), join(fixtureDesignSystem, 'ds-canonical/fork'), { recursive: true })
    mkdirSync(join(fixtureDesignSystem, 'src/tokens'), { recursive: true })
    cpSync(join(repo, 'node_modules/@qijenchen/design-system/src/tokens/utility-registry.json'), join(fixtureDesignSystem, 'src/tokens/utility-registry.json'))
    const corpus = validateInstalledForkCorpus(fixtureEvidenceRoot)
    const paths = collectProviderMutationPaths(corpus.manifest)
    const fixtureProviderStaging = join(transactionRoot, 'provider-staging')
    mkdirSync(fixtureProviderStaging)
    const providerEntries = paths.map((record, index) => {
      const source = join(canonicalRepo, record.path)
      const backup = join(fixtureProviderStaging, String(index))
      const present = existsSync(source)
      if (present) cpSync(source, backup, { recursive: true })
      return withBeforeState({ path: record.path, source, backup, present })
    })
    const commonPath = corpus.manifest.consumer.commonInstruction.destination
    const commonSource = join(canonicalRepo, commonPath)
    const commonBackup = join(transactionRoot, 'common-staging', '0')
    mkdirSync(dirname(commonBackup))
    const commonPresent = existsSync(commonSource)
    if (commonPresent) cpSync(commonSource, commonBackup)
    const journal = {
      schemaVersion: 5,
      repoRoot: canonicalRepo,
      transactionId,
      transactionRoot,
      owner,
      entries,
      // Valid pre-rename state: source remains present and the backup has not been created yet.
      nodeModules: { source: join(canonicalRepo, 'node_modules'), backup: join(transactionRoot, 'node_modules'), present: true },
      providerSnapshot: {
        evidence: { ...corpus.evidence },
        evidenceRoot: fixtureEvidenceRoot,
        paths: paths.map((record) => ({ ...record })),
        entries: providerEntries,
      },
      commonSnapshot: withBeforeState({ path: commonPath, source: commonSource, backup: commonBackup, present: commonPresent }),
    }
    mutate(journal)
    writeFileSync(join(repo, '.governance-upgrade-journal.json'), JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 })
    return { transactionRoot }
  }
  for (const [label, mutate] of [
    ['omitted authenticated common snapshot', (journal) => { journal.commonSnapshot = null }],
    ['forged authenticated common destination', (journal) => {
      journal.commonSnapshot.path = 'README.md'
      journal.commonSnapshot.source = join(canonicalRepo, 'README.md')
    }],
  ]) {
    const fixture = buildAuthenticatedJournalFixture(mutate)
    const beforeBlockedRecovery = inventory(repo)
    const blocked = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
    if (
      blocked.status !== 2
      || !blocked.stderr.includes('GOV-UPGRADE-RECOVERY-BLOCKED')
      || inventory(repo) !== beforeBlockedRecovery
    ) throw new Error(`${label} was not rejected before repository mutation:${blocked.stdout}\n${blocked.stderr}`)
    rmSync(join(repo, '.governance-upgrade-journal.json'), { force: true })
    rmSync(fixture.transactionRoot, { recursive: true, force: true })
    console.log(`✅ recovery safety: ${label} rejected before mutation`)
  }

  const buildJournalFixture = (mutate, owner = DEAD_OWNER) => {
    const transactionId = randomUUID()
    const transactionRoot = join(dirname(canonicalRepo), `.governance-upgrade-${transactionId}`)
    mkdirSync(transactionRoot, { mode: 0o700 })
    writeFileSync(join(transactionRoot, '.governance-upgrade-owner.json'), JSON.stringify({
      schemaVersion: 2, repoRoot: canonicalRepo, transactionId, owner,
    }, null, 2) + '\n', { mode: 0o600 })
    const entries = TRANSACTION_PATHS.map((path, index) => {
      const source = join(canonicalRepo, path)
      const backup = join(transactionRoot, String(index))
      const present = existsSync(source)
      if (present) cpSync(source, backup, { recursive: true })
      return withBeforeState({ path, source, backup, present })
    })
    const journal = {
      schemaVersion: 5,
      repoRoot: canonicalRepo,
      transactionId,
      transactionRoot,
      owner,
      entries,
      // This is the valid pre-rename state: original node_modules remains at source.
      nodeModules: { source: join(canonicalRepo, 'node_modules'), backup: join(transactionRoot, 'node_modules'), present: true },
      providerSnapshot: null,
      commonSnapshot: null,
    }
    mutate(journal, { transactionRoot, transactionId })
    writeFileSync(join(repo, '.governance-upgrade-journal.json'), JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 })
    return { transactionRoot, journal }
  }

  // A second invocation must never reinterpret a still-live transaction as a crash. The parent
  // PID is deliberately the owner; the child sync-all process can prove it is alive.
  const liveOwner = { host: hostname(), pid: process.pid }
  const liveFixture = buildJournalFixture(() => {}, liveOwner)
  const beforeLiveOwnerProbe = inventory(repo)
  const liveOwnerProbe = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
  if (
    liveOwnerProbe.status !== 2
    || !liveOwnerProbe.stderr.includes('upgrade transaction is still active')
    || inventory(repo) !== beforeLiveOwnerProbe
    || !existsSync(join(repo, '.governance-upgrade-journal.json'))
    || !existsSync(liveFixture.transactionRoot)
  ) throw new Error(`live transaction owner was not preserved:${liveOwnerProbe.stdout}\n${liveOwnerProbe.stderr}`)
  rmSync(join(repo, '.governance-upgrade-journal.json'), { force: true })
  rmSync(liveFixture.transactionRoot, { recursive: true, force: true })
  console.log('✅ concurrency safety: live transaction owner blocks a second invocation with zero mutation')

  // A dead owner is not sufficient authority to overwrite bytes that differ from both the exact
  // before-image and a journal-committed after-image.
  const unknownFixture = buildJournalFixture(() => {})
  const originalPackageBytes = readFileSync(join(repo, 'package.json'))
  writeFileSync(join(repo, 'package.json'), `${originalPackageBytes.toString('utf8').trimEnd()}\nunknown-user-edit\n`)
  const unknownBytes = readFileSync(join(repo, 'package.json'))
  const beforeUnknownProbe = inventory(repo)
  const unknownProbe = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
  if (
    unknownProbe.status !== 2
    || !unknownProbe.stderr.includes('recovery blocked by unknown post-journal content:package.json')
    || inventory(repo) !== beforeUnknownProbe
    || !readFileSync(join(repo, 'package.json')).equals(unknownBytes)
    || !existsSync(join(repo, '.governance-upgrade-journal.json'))
    || !existsSync(unknownFixture.journal.entries[0].backup)
  ) throw new Error(`unknown post-journal edit was not preserved:${unknownProbe.stdout}\n${unknownProbe.stderr}`)
  writeFileSync(join(repo, 'package.json'), originalPackageBytes)
  rmSync(join(repo, '.governance-upgrade-journal.json'), { force: true })
  rmSync(unknownFixture.transactionRoot, { recursive: true, force: true })
  console.log('✅ recovery safety: unknown post-journal content blocks rollback and remains byte-for-byte intact')

  // Bytes equal to the planned after-image are not sufficient authority. If the candidate still
  // exists and there is no capability-bound moved before-image, those bytes may have been written
  // by an external actor after replacementStarted was journaled.
  let exactEqualExternalBytes
  const exactEqualFixture = buildJournalFixture((journal, { transactionRoot }) => {
    const entry = journal.entries[0]
    exactEqualExternalBytes = Buffer.from(`${readFileSync(entry.source, 'utf8').trimEnd()}\nexternal-equals-candidate\n`)
    writeFileSync(entry.source, exactEqualExternalBytes)
    const candidatePath = join(transactionRoot, 'candidate-staging', entry.path)
    mkdirSync(dirname(candidatePath), { recursive: true })
    writeFileSync(candidatePath, exactEqualExternalBytes)
    entry.afterRecorded = true
    entry.afterPresent = true
    entry.afterFingerprint = pathFingerprint(candidatePath)
    entry.replacementStarted = true
    entry.replacementCompleted = false
  })
  const beforeExactEqualProbe = inventory(repo)
  const exactEqualProbe = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
  if (
    exactEqualProbe.status !== 2
    || !exactEqualProbe.stderr.includes('recovery blocked by unknown post-journal content:package.json')
    || inventory(repo) !== beforeExactEqualProbe
    || !readFileSync(join(repo, 'package.json')).equals(exactEqualExternalBytes)
  ) throw new Error(`exact-equal external after-image was misattributed to the transaction:${exactEqualProbe.stdout}\n${exactEqualProbe.stderr}`)
  cpSync(exactEqualFixture.journal.entries[0].backup, join(repo, 'package.json'))
  rmSync(join(repo, '.governance-upgrade-journal.json'), { force: true })
  rmSync(exactEqualFixture.transactionRoot, { recursive: true, force: true })
  console.log('✅ recovery safety: exact-equal external bytes require capability evidence and are never overwritten')

  const markPackageReplacementStarted = (journal) => {
    const entry = journal.entries[0]
    entry.afterRecorded = true
    entry.afterPresent = true
    entry.afterFingerprint = entry.beforeFingerprint
    entry.replacementStarted = true
    entry.replacementCompleted = false
  }

  const markPackageDeletionStarted = (journal) => {
    const entry = journal.entries[0]
    entry.afterRecorded = true
    entry.afterPresent = false
    entry.afterFingerprint = null
    entry.replacementStarted = true
    entry.replacementCompleted = false
  }

  // Merely claiming "replacement started" is not authority to reinterpret an external deletion
  // as our own rename. The exact moved before-image must also exist under this transaction's
  // capability-bound live-staging path.
  const unboundAbsenceFixture = buildJournalFixture(markPackageDeletionStarted)
  const unboundOriginalPackage = readFileSync(join(repo, 'package.json'))
  rmSync(join(repo, 'package.json'))
  const beforeUnboundAbsenceProbe = inventory(repo)
  const unboundAbsenceProbe = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
  if (
    unboundAbsenceProbe.status !== 2
    || !unboundAbsenceProbe.stderr.includes('recovery blocked by unknown post-journal content:package.json')
    || inventory(repo) !== beforeUnboundAbsenceProbe
    || existsSync(join(repo, 'package.json'))
  ) throw new Error(`unbound replacement absence was not preserved as unknown:${unboundAbsenceProbe.stdout}\n${unboundAbsenceProbe.stderr}`)
  writeFileSync(join(repo, 'package.json'), unboundOriginalPackage)
  rmSync(join(repo, '.governance-upgrade-journal.json'), { force: true })
  rmSync(unboundAbsenceFixture.transactionRoot, { recursive: true, force: true })
  console.log('✅ recovery safety: planned deletion without the exact moved before-image cannot authorize rollback')

  // The real mid-rename state has both facts: source is absent and the exact predecessor was moved
  // to this transaction's deterministic staging slot. That state must recover automatically.
  const boundTransientFixture = buildJournalFixture(markPackageReplacementStarted)
  const boundPackageBytes = readFileSync(join(repo, 'package.json'))
  const boundMovedPath = join(boundTransientFixture.transactionRoot, 'live-staging', 'fixed', '0')
  mkdirSync(dirname(boundMovedPath), { recursive: true })
  renameSync(join(repo, 'package.json'), boundMovedPath)
  const boundTransientRecovery = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
  const boundTransientReport = parseReport(boundTransientRecovery, 'bound transient recovery')
  if (
    boundTransientRecovery.status !== 0
    || !boundTransientReport.diagnostics.some((item) => item.ruleId === 'GOV-UPGRADE-RECOVERY-001')
    || !readFileSync(join(repo, 'package.json')).equals(boundPackageBytes)
    || existsSync(join(repo, '.governance-upgrade-journal.json'))
    || existsSync(boundTransientFixture.transactionRoot)
    || run('git', ['status', '--porcelain']).stdout.trim()
  ) throw new Error(`bound mid-rename state did not recover exactly:${boundTransientRecovery.stdout}\n${boundTransientRecovery.stderr}`)
  console.log('✅ recovery: exact capability-bound mid-rename before-image restores automatically')

  const impossibleCompletionFixture = buildJournalFixture((journal) => {
    const entry = journal.entries[0]
    entry.afterRecorded = true
    entry.afterPresent = entry.present
    entry.afterFingerprint = entry.beforeFingerprint
    entry.replacementStarted = false
    entry.replacementCompleted = true
  })
  const beforeImpossibleCompletion = inventory(repo)
  const impossibleCompletion = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
  if (
    impossibleCompletion.status !== 2
    || !impossibleCompletion.stderr.includes('completed replacement was never started')
    || inventory(repo) !== beforeImpossibleCompletion
  ) throw new Error(`impossible completion state was not rejected before mutation:${impossibleCompletion.stdout}\n${impossibleCompletion.stderr}`)
  rmSync(join(repo, '.governance-upgrade-journal.json'), { force: true })
  rmSync(impossibleCompletionFixture.transactionRoot, { recursive: true, force: true })
  console.log('✅ recovery safety: impossible completion state is rejected before repository mutation')

  for (const [label, mutateRecoverySlot] of [
    ['unowned recovery leaf', (transactionRoot) => {
      const slot = join(transactionRoot, 'recovery-staging', 'fixed', '0')
      mkdirSync(slot, { recursive: true })
      writeFileSync(join(slot, 'attacker'), 'unowned recovery content')
    }],
    ['unknown recovery moved bytes', (transactionRoot) => {
      const slot = join(transactionRoot, 'recovery-staging', 'fixed', '0')
      mkdirSync(slot, { recursive: true })
      writeFileSync(join(slot, 'moved'), 'not a journal-known before or after image')
    }],
  ]) {
    const fixture = buildJournalFixture((journal, { transactionRoot }) => mutateRecoverySlot(transactionRoot))
    const beforeRecoverySlotProbe = inventory(repo)
    const blocked = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
    if (
      blocked.status !== 2
      || !blocked.stderr.includes('GOV-UPGRADE-RECOVERY-BLOCKED')
      || inventory(repo) !== beforeRecoverySlotProbe
    ) throw new Error(`${label} was not rejected before live mutation:${blocked.stdout}\n${blocked.stderr}`)
    rmSync(join(repo, '.governance-upgrade-journal.json'), { force: true })
    rmSync(fixture.transactionRoot, { recursive: true, force: true })
    console.log(`✅ recovery safety: ${label} rejected by the closed recovery-staging topology`)
  }

  const sibling = join(temp, 'work-management-canary')
  mkdirSync(sibling)
  const siblingCanary = join(sibling, 'DO-NOT-DELETE.txt')
  writeFileSync(siblingCanary, 'sibling survives')
  for (const [label, mutate] of [
    ['parent traversal', (journal) => { journal.entries[0].path = '../work-management-canary'; journal.entries[0].source = sibling }],
    ['empty repository path', (journal) => { journal.entries[0].path = ''; journal.entries[0].source = canonicalRepo }],
    ['git metadata target', (journal) => { journal.entries[0].path = '.git'; journal.entries[0].source = join(canonicalRepo, '.git') }],
  ]) {
    const fixture = buildJournalFixture(mutate)
    const beforeRepo = inventory(repo)
    const rejected = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
    if (
      rejected.status !== 2
      || !rejected.stderr.includes('GOV-UPGRADE-RECOVERY-BLOCKED')
      || readFileSync(siblingCanary, 'utf8') !== 'sibling survives'
      || inventory(repo) !== beforeRepo
    ) throw new Error(`${label} journal was not rejected before mutation:${rejected.stdout}\n${rejected.stderr}`)
    rmSync(join(repo, '.governance-upgrade-journal.json'), { force: true })
    rmSync(fixture.transactionRoot, { recursive: true, force: true })
    console.log(`✅ recovery safety: ${label} journal rejected with sibling/repository unchanged`)
  }

  // A dangling/symlink journal is itself untrusted and must not be followed, parsed, or replaced.
  const outsideJournal = join(temp, 'outside-journal.json')
  writeFileSync(outsideJournal, '{}\n')
  symlinkSync(outsideJournal, join(repo, '.governance-upgrade-journal.json'))
  const beforeOutside = readFileSync(outsideJournal)
  const symlinkJournal = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
  if (
    symlinkJournal.status !== 2
    || !symlinkJournal.stderr.includes('GOV-UPGRADE-RECOVERY-BLOCKED')
    || !readFileSync(outsideJournal).equals(beforeOutside)
  ) throw new Error(`symlink journal was not rejected:${symlinkJournal.stdout}\n${symlinkJournal.stderr}`)
  rmSync(join(repo, '.governance-upgrade-journal.json'), { force: true })
  console.log('✅ recovery safety: symlink journal rejected without following external target')

  // Even an exact-looking capability path cannot be a symlink to attacker-owned sibling content.
  const transactionId = randomUUID()
  const expectedRoot = join(dirname(canonicalRepo), `.governance-upgrade-${transactionId}`)
  const externalRoot = join(temp, 'external-transaction-root')
  mkdirSync(externalRoot)
  writeFileSync(join(externalRoot, '.governance-upgrade-owner.json'), JSON.stringify({
    schemaVersion: 2, repoRoot: canonicalRepo, transactionId, owner: DEAD_OWNER,
  }))
  symlinkSync(externalRoot, expectedRoot)
  const symlinkRootJournal = join(repo, '.governance-upgrade-journal.json')
  writeFileSync(symlinkRootJournal, JSON.stringify({
    schemaVersion: 5, repoRoot: canonicalRepo, transactionId, transactionRoot: expectedRoot, owner: DEAD_OWNER,
    entries: [], nodeModules: {}, providerSnapshot: null, commonSnapshot: null,
  }) + '\n', { mode: 0o600 })
  const externalPublishAlias = join(externalRoot, '.governance-upgrade-journal.publish')
  linkSync(symlinkRootJournal, externalPublishAlias)
  const externalPublishBefore = readFileSync(externalPublishAlias)
  const transactionSymlink = run(process.execPath, [join(repo, 'scripts/sync-all.mjs'), '--json'])
  if (
    transactionSymlink.status !== 2
    || !existsSync(join(externalRoot, '.governance-upgrade-owner.json'))
    || !existsSync(externalPublishAlias)
    || !readFileSync(externalPublishAlias).equals(externalPublishBefore)
  ) {
    throw new Error(`symlink transaction root was not rejected:${transactionSymlink.stdout}\n${transactionSymlink.stderr}`)
  }
  rmSync(symlinkRootJournal, { force: true })
  rmSync(expectedRoot, { force: true })
  console.log('✅ recovery safety: symlink transaction root rejected before following or unlinking its hard-link alias')

  console.log('✅ SYNC-ALL TRANSACTION PASS(success + rollback + downgrade + process-crash recovery + hostile journal/symlink rejection)')
} finally {
  rmSync(corpusTemp, { recursive: true, force: true })
  rmSync(temp, { recursive: true, force: true })
}

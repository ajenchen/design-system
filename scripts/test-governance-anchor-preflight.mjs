#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { mkdtemp, mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  createPreinstallEvidence,
  liveRegistry,
  verifyCandidate,
  verifyCandidateLock,
} from './governance-anchor-preflight.mjs'
import {
  NPM_FINALIZATION_RECEIPT_ASSET,
  RELEASE_TRUST_PREFLIGHT_ASSET,
  TRUSTED_UPGRADE_POLICY,
  resolveImmutableReleaseSnapshot,
} from './verify-upgrade-provenance.mjs'
import {
  PRODUCT_TEMPLATE_GENERATED_ENTRIES,
  PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET,
  scaffoldTreeSha256,
} from './product-template-scaffold-lock.mjs'
import { immutableReleaseFixture } from './test-fixtures/immutable-release-fixture.mjs'

const DS = '@qijenchen/design-system'
const SB = '@qijenchen/storybook-config'
const GOV = '@qijenchen/governance'
const COMMIT = '1234567890abcdef1234567890abcdef12345678'
const TREE = 'a'.repeat(40)
const sri = (byte) => `sha512-${Buffer.alloc(64, byte).toString('base64')}`
const packageSri = { [DS]: sri(0x11), [SB]: sri(0x22), [GOV]: sri(0x33) }
const tarball = (name, version) => `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`
const purl = (name, version) => `pkg:npm/${encodeURIComponent(name).replace('%2F', '/')}@${version}`
const digestHex = (integrity) => Buffer.from(integrity.slice('sha512-'.length), 'base64').toString('hex')
const sha256 = value => createHash('sha256').update(value).digest('hex')
const registryMetadataUrl = (name, version) => `https://registry.npmjs.org/${name.replace('/', '%2F')}/${encodeURIComponent(version)}`

function registryHttpResponse({
  name = DS,
  version = '0.1.0-beta.94',
  integrity = packageSri[DS],
  artifact = tarball(name, version),
  status = 200,
  url = registryMetadataUrl(name, version),
  contentType = 'application/json',
  declaredLength,
  bytes,
} = {}) {
  const bodyBytes = bytes ?? Buffer.from(JSON.stringify({
    name,
    version,
    dist: { integrity, tarball: artifact },
  }))
  const headers = new Headers({ 'content-type': contentType })
  if (declaredLength !== false) headers.set('content-length', String(declaredLength ?? bodyBytes.length))
  return {
    status,
    url,
    headers,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bodyBytes)
        controller.close()
      },
    }),
  }
}

function rewriteJsonAsset(snapshot, name, mutate) {
  const value = JSON.parse(snapshot.assetBodies[name].toString('utf8'))
  mutate(value)
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
  snapshot.assetBodies[name] = bytes
  const asset = snapshot.release.assets.find(item => item.name === name)
  asset.size = bytes.length
  asset.digest = `sha256:${sha256(bytes)}`
}

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

function statement(name, version, integrity) {
  const tag = `v${version}`
  return {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{ name: purl(name, version), digest: { sha512: digestHex(integrity) } }],
    predicateType: TRUSTED_UPGRADE_POLICY.provenancePredicate,
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            repository: `https://github.com/${TRUSTED_UPGRADE_POLICY.repository}`,
            path: TRUSTED_UPGRADE_POLICY.workflow,
            ref: TRUSTED_UPGRADE_POLICY.workflowRef,
          },
        },
        resolvedDependencies: [{
          uri: `git+https://github.com/${TRUSTED_UPGRADE_POLICY.repository}@${TRUSTED_UPGRADE_POLICY.workflowRef}`,
          digest: { gitCommit: COMMIT },
        }],
      },
      runDetails: { builder: { id: TRUSTED_UPGRADE_POLICY.builderId } },
    },
  }
}

function verifiedEntry(name, version, integrity) {
  return {
    name,
    version,
    location: `node_modules/${name}`,
    registry: 'https://registry.npmjs.org/',
    attestationBundles: [{
      dsseEnvelope: {
        payloadType: 'application/vnd.in-toto+json',
        payload: Buffer.from(JSON.stringify(statement(name, version, integrity))).toString('base64'),
        signatures: [{ sig: 'cryptographically-verified-by-npm-cli-fixture' }],
      },
      verificationMaterial: { certificate: { rawBytes: 'fixture' } },
    }],
  }
}

function releaseSnapshot(version) {
  const tag = `v${version}`
  const scaffoldEntries = [{ path: 'README.md', mode: '644', size: 1, sha256: 'd'.repeat(64) }]
  const scaffoldLock = {
    schemaVersion: 1, kind: 'qijenchen-product-template-scaffold', releaseVersion: version,
    staticTreeSha256: scaffoldTreeSha256(scaffoldEntries), publishedPathCount: 2,
    entries: scaffoldEntries, generatedEntries: PRODUCT_TEMPLATE_GENERATED_ENTRIES,
  }
  const scaffoldLockBody = Buffer.from(`${JSON.stringify(scaffoldLock, null, 2)}\n`)
  const scaffoldLockSha256 = createHash('sha256').update(scaffoldLockBody).digest('hex')
  const packageEntry = (name) => ({
    name,
    version,
    file: `${name.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`,
    size: 100,
    entryCount: 2,
    shasum: '1'.repeat(40),
    sha256: '2'.repeat(64),
    integrity: packageSri[name],
    packageJsonSha256: '3'.repeat(64),
    sourceManifest: `packages/${name.split('/').at(-1)}/package.json`,
    sourceManifestSha256: '4'.repeat(64),
  })
  const bom = {
    schemaVersion: 5,
    releaseVersion: version,
    npmDistTag: 'beta',
    publishOrder: ['@qijenchen/governance', '@qijenchen/storybook-config', '@qijenchen/design-system'],
    source: {
      repository: TRUSTED_UPGRADE_POLICY.repository,
      repositoryUrl: `git+https://github.com/${TRUSTED_UPGRADE_POLICY.repository}.git`,
      tag,
      gitCommit: COMMIT,
      gitTree: TREE,
    },
    supplyChain: {
      npmProvenance: {
        predicateType: TRUSTED_UPGRADE_POLICY.provenancePredicate,
        builderId: TRUSTED_UPGRADE_POLICY.builderId,
        workflow: TRUSTED_UPGRADE_POLICY.workflow,
        workflowRef: TRUSTED_UPGRADE_POLICY.workflowRef,
      },
      immutableGitHubRelease: {
        required: true,
        bomAsset: TRUSTED_UPGRADE_POLICY.releaseBomAsset,
      },
    },
    packages: TRUSTED_UPGRADE_POLICY.releasePackages.map(packageEntry),
    governance: {
      controlPlane: {
        path: 'governance/control-plane.lock.json', sha256: '5'.repeat(64), role: 'ds-author',
        inputDigest: `sha256:${'6'.repeat(64)}`, contractDigest: `sha256:${'7'.repeat(64)}`,
        snapshotDigest: `sha256:${'8'.repeat(64)}`, generatorVersion: version,
      },
      consumer: {
        path: 'template/ds-product-template/governance/lock.json', sha256: '9'.repeat(64), role: 'template-consumer',
        release: { designSystem: version, storybookConfig: version },
      },
      forkCorpus: { path: 'packages/design-system/ds-canonical/fork/governance.lock', sha256: 'b'.repeat(64) },
      productTemplateScaffold: {
        path: PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET, size: scaffoldLockBody.length, sha256: scaffoldLockSha256,
        schemaVersion: 1, releaseVersion: version, staticTreeSha256: scaffoldLock.staticTreeSha256, publishedPathCount: 2,
      },
    },
    sbom: { file: 'release.sbom.cdx.json', size: 100, sha256: 'c'.repeat(64) },
  }
  return immutableReleaseFixture({
    repository: TRUSTED_UPGRADE_POLICY.repository,
    version,
    commit: COMMIT,
    tree: TREE,
    bom,
    scaffoldLockBody,
  })
}

async function fixture(t, { trustedVersion = '0.1.0-beta.93', candidateVersion = '0.1.0-beta.94' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'governance-anchor-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const trusted = join(root, 'trusted')
  const candidate = join(root, 'candidate')
  await mkdir(join(trusted, 'governance'), { recursive: true })
  await mkdir(join(candidate, 'governance'), { recursive: true })
  await writeJson(join(trusted, 'governance/lock.json'), {
    release: { designSystem: trustedVersion, storybookConfig: trustedVersion },
    upgradeTrust: TRUSTED_UPGRADE_POLICY,
  })
  const bom = {
    release: { designSystem: candidateVersion, storybookConfig: candidateVersion },
    upgradeTrust: TRUSTED_UPGRADE_POLICY,
  }
  const pkg = { private: true, workspaces: ['apps/*'], dependencies: { [DS]: candidateVersion, [SB]: candidateVersion } }
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': { workspaces: ['apps/*'], dependencies: { [DS]: candidateVersion, [SB]: candidateVersion } },
      [`node_modules/${DS}`]: { version: candidateVersion, resolved: tarball(DS, candidateVersion), integrity: packageSri[DS] },
      [`node_modules/${SB}`]: { version: candidateVersion, resolved: tarball(SB, candidateVersion), integrity: packageSri[SB] },
    },
  }
  await writeJson(join(candidate, 'governance/lock.json'), bom)
  await writeJson(join(candidate, 'package.json'), pkg)
  await writeJson(join(candidate, 'package-lock.json'), lock)
  const registryLookup = (name, version) => ({ tarball: tarball(name, version), integrity: packageSri[name] })
  const auditReport = {
    invalid: [],
    missing: [],
    verified: [verifiedEntry(DS, candidateVersion, packageSri[DS]), verifiedEntry(SB, candidateVersion, packageSri[SB])],
  }
  const snapshot = releaseSnapshot(candidateVersion)
  const releaseLookup = async () => snapshot
  return {
    trustedRoot: trusted,
    candidateRoot: candidate,
    trusted,
    candidate,
    bom,
    pkg,
    lock,
    registryLookup,
    auditReport,
    snapshot,
    releaseLookup,
  }
}

test('live registry lookup uses one closed unauthenticated bounded HTTPS metadata request', async () => {
  const version = '0.1.0-beta.94'
  let observed
  const result = await liveRegistry(DS, version, {
    fetchImpl: async (url, options) => {
      observed = { url, options }
      return registryHttpResponse({ name: DS, version })
    },
  })
  assert.deepEqual(result, { integrity: packageSri[DS], tarball: tarball(DS, version) })
  assert.equal(Object.isFrozen(result), true)
  assert.equal(observed.url, registryMetadataUrl(DS, version))
  assert.equal(observed.options.method, 'GET')
  assert.equal(observed.options.redirect, 'error')
  assert.equal(observed.options.credentials, 'omit')
  assert.equal(observed.options.cache, 'no-store')
  assert.equal(observed.options.referrerPolicy, 'no-referrer')
  assert.deepEqual(observed.options.headers, {
    Accept: 'application/json',
    'User-Agent': 'qijenchen-governance-anchor-preflight/1',
  })
  assert.equal(observed.options.signal instanceof AbortSignal, true)

  const source = readFileSync('scripts/governance-anchor-preflight.mjs', 'utf8')
  assert.doesNotMatch(source, /execFileSync\(\s*['"]npm['"]/)
  assert.doesNotMatch(source, /\.\.\.process\.env/)
})

test('live registry lookup rejects transport, framing, encoding and artifact substitution', async () => {
  const version = '0.1.0-beta.94'
  const reject = async (response, pattern) => assert.rejects(
    liveRegistry(DS, version, { fetchImpl: async () => response }),
    pattern,
  )

  await reject(registryHttpResponse({ status: 302 }), /status is not exactly 200/)
  await reject(registryHttpResponse({ url: 'https://registry.npmjs.org/redirected' }), /response URL differs/)
  await reject(registryHttpResponse({ contentType: 'text/json' }), /content type is not exact JSON/)
  await reject(registryHttpResponse({ declaredLength: 1024 * 1024 + 1 }), /exceeds the closed byte limit/)
  await reject(registryHttpResponse({ declaredLength: 'not-a-number' }), /content length is invalid/)
  await reject(registryHttpResponse({ declaredLength: 1 }), /length differs from the declared byte count/)
  await reject(registryHttpResponse({ bytes: Buffer.from([0xff]) }), /not valid UTF-8/)
  await reject(registryHttpResponse({ bytes: Buffer.from('{') }), /not valid JSON/)
  await reject(registryHttpResponse({ name: SB, url: registryMetadataUrl(DS, version) }), /identity or exact artifact binding is invalid/)
  await reject(registryHttpResponse({ version: '0.1.0-beta.95', url: registryMetadataUrl(DS, version) }), /identity or exact artifact binding is invalid/)
  await reject(registryHttpResponse({ artifact: 'https://attacker.invalid/package.tgz' }), /identity or exact artifact binding is invalid/)
  await reject(registryHttpResponse({ integrity: 'sha256-attacker' }), /identity or exact artifact binding is invalid/)
  await reject(registryHttpResponse({
    declaredLength: false,
    bytes: Buffer.alloc(1024 * 1024 + 1, 0x20),
  }), /exceeds the closed byte limit/)
  await assert.rejects(
    liveRegistry('@attacker/package', version, { fetchImpl: async () => registryHttpResponse() }),
    /outside the closed governance set/,
  )
})

test('accepts one exact monotonic lockstep release with end-to-end provenance binding', async (t) => {
  const value = await fixture(t)
  const result = await verifyCandidate(value)
  assert.equal(result.designSystem, '0.1.0-beta.94')
  assert.equal(result.files, 3)
  assert.equal(result.provenance.gitCommit, COMMIT)
  assert.equal(
    result.provenance.releaseAssetDigest,
    value.snapshot.release.assets.find(item => item.name === 'release-bom.json').digest,
  )
})

test('rejects a signed but older governance release', async (t) => {
  const value = await fixture(t, { trustedVersion: '0.1.0-beta.94', candidateVersion: '0.1.0-beta.93' })
  await assert.rejects(verifyCandidateLock(value), /downgrade/)
})

test('rejects BOM drift and DS/Storybook split versions', async (t) => {
  const value = await fixture(t)
  value.bom.release.storybookConfig = '0.1.0-beta.95'
  await writeJson(join(value.candidate, 'governance/lock.json'), value.bom)
  await assert.rejects(verifyCandidateLock(value), /does not match candidate governance lock/)
})

test('rejects alternate registries even when integrity is present', async (t) => {
  const value = await fixture(t)
  value.lock.packages[`node_modules/${DS}`].resolved = 'https://registry.example.invalid/design-system.tgz'
  await writeJson(join(value.candidate, 'package-lock.json'), value.lock)
  await assert.rejects(verifyCandidateLock(value), /canonical exact npm artifact/)
})

test('rejects candidate symlinks before reading governance files', async (t) => {
  const value = await fixture(t)
  await symlink('/etc/passwd', join(value.candidate, 'escape'))
  await assert.rejects(verifyCandidateLock(value), /candidate symlink forbidden/)
})

test('rejects candidate root shrinkwrap before registry lookup', async (t) => {
  const value = await fixture(t)
  await writeFile(join(value.candidate, 'npm-shrinkwrap.json'), '{"lockfileVersion":3,"packages":{}}\n')
  let registryCalled = false
  await assert.rejects(
    verifyCandidateLock({
      ...value,
      registryLookup: () => {
        registryCalled = true
        return {}
      },
    }),
    /npm-shrinkwrap\.json is forbidden/,
  )
  assert.equal(registryCalled, false)
})

test('rejects candidate workspace-root downgrade and dependency-shadow workspace links before npm ci', async (t) => {
  const roots = await fixture(t)
  roots.pkg.workspaces = ['packages/*']
  await writeJson(join(roots.candidate, 'package.json'), roots.pkg)
  await assert.rejects(verifyCandidateLock(roots), /protected product roots/)

  const lockRoots = await fixture(t)
  lockRoots.lock.packages[''].workspaces = ['packages/*']
  await writeJson(join(lockRoots.candidate, 'package-lock.json'), lockRoots.lock)
  await assert.rejects(verifyCandidateLock(lockRoots), /root lock workspaces must equal the protected product roots/)

  const shadow = await fixture(t)
  shadow.lock.packages['node_modules/typescript'] = { link: true, resolved: 'apps/tool-shadow' }
  await writeJson(join(shadow.candidate, 'package-lock.json'), shadow.lock)
  await assert.rejects(verifyCandidateLock(shadow), /unsafe or non-product workspace link/)
})

test('preinstall evidence permits only the npm-created dependency tree after npm ci', async (t) => {
  const value = await fixture(t)
  await writeJson(join(value.candidate, 'apps/example/package.json'), {
    name: '@product/example',
    private: true,
    version: '1.0.0',
  })
  value.lock.packages['apps/example'] = { name: '@product/example', version: '1.0.0' }
  value.lock.packages['node_modules/@product/example'] = { resolved: 'apps/example', link: true }
  await writeJson(join(value.candidate, 'package-lock.json'), value.lock)
  const locked = await verifyCandidateLock(value)
  const evidence = createPreinstallEvidence(locked, value.candidate)

  const installFixture = join(value.candidate, '..', 'npm-ci-fixture')
  await mkdir(join(installFixture, 'apps/example'), { recursive: true })
  await writeJson(join(installFixture, 'package.json'), {
    private: true,
    workspaces: ['apps/*'],
  })
  await writeJson(join(installFixture, 'apps/example/package.json'), {
    name: '@product/example',
    private: true,
    version: '1.0.0',
  })
  const npmEnvironment = {
    ...process.env,
    NPM_CONFIG_USERCONFIG: join(installFixture, 'empty-user.npmrc'),
    NPM_CONFIG_GLOBALCONFIG: join(installFixture, 'empty-global.npmrc'),
  }
  execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: installFixture, env: npmEnvironment })
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: installFixture, env: npmEnvironment })
  assert.equal(lstatSync(join(installFixture, 'node_modules/@product/example')).isSymbolicLink(), true)
  await rename(join(installFixture, 'node_modules'), join(value.candidate, 'node_modules'))

  await assert.rejects(verifyCandidateLock(value), /preinstall dependency tree forbidden/)
  const result = await verifyCandidate({ ...value, preinstallEvidence: evidence })
  assert.equal(result.designSystem, value.pkg.dependencies[DS])
})

test('preinstall evidence does not permit source mutation or symlinks outside node_modules', async (t) => {
  const changed = await fixture(t)
  const changedEvidence = createPreinstallEvidence(await verifyCandidateLock(changed), changed.candidate)
  changed.pkg.description = 'mutated after preinstall verification'
  await writeJson(join(changed.candidate, 'package.json'), changed.pkg)
  await assert.rejects(
    verifyCandidate({ ...changed, preinstallEvidence: changedEvidence }),
    /candidate source changed after the preinstall trust check/,
  )

  const linked = await fixture(t)
  const linkedEvidence = createPreinstallEvidence(await verifyCandidateLock(linked), linked.candidate)
  await symlink('/etc/passwd', join(linked.candidate, 'post-install-escape'))
  await assert.rejects(
    verifyCandidate({ ...linked, preinstallEvidence: linkedEvidence }),
    /candidate symlink forbidden/,
  )

  const nested = await fixture(t)
  const nestedEvidence = createPreinstallEvidence(await verifyCandidateLock(nested), nested.candidate)
  await mkdir(join(nested.candidate, 'src/node_modules'), { recursive: true })
  await assert.rejects(
    verifyCandidate({ ...nested, preinstallEvidence: nestedEvidence }),
    /installed dependency tree is outside canonical npm roots/,
  )

  const dependencyRootLink = await fixture(t)
  const dependencyRootEvidence = createPreinstallEvidence(await verifyCandidateLock(dependencyRootLink), dependencyRootLink.candidate)
  await symlink('/tmp', join(dependencyRootLink.candidate, 'node_modules'))
  await assert.rejects(
    verifyCandidate({ ...dependencyRootLink, preinstallEvidence: dependencyRootEvidence }),
    /installed dependency root must be a real directory/,
  )

  const unexpectedWorkspace = await fixture(t)
  const unexpectedWorkspaceEvidence = createPreinstallEvidence(await verifyCandidateLock(unexpectedWorkspace), unexpectedWorkspace.candidate)
  await mkdir(join(unexpectedWorkspace.candidate, 'node_modules/@product'), { recursive: true })
  await symlink(unexpectedWorkspace.candidate, join(unexpectedWorkspace.candidate, 'node_modules/@product/escape'), 'dir')
  await assert.rejects(
    verifyCandidate({ ...unexpectedWorkspace, preinstallEvidence: unexpectedWorkspaceEvidence }),
    /installed tree contains an unexpected workspace symlink/,
  )
})

test('rejects candidate mutation of the protected closed upgrade policy', async (t) => {
  const value = await fixture(t)
  value.bom.upgradeTrust = { ...TRUSTED_UPGRADE_POLICY, repository: 'attacker/repository' }
  await writeJson(join(value.candidate, 'governance/lock.json'), value.bom)
  await assert.rejects(verifyCandidateLock(value), /upgrade trust policy repository/)
})

for (const [label, mutate, pattern] of [
  ['wrong repository', (value) => {
    const entry = value.auditReport.verified[0]
    const bundle = entry.attestationBundles[0]
    const body = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8'))
    body.predicate.buildDefinition.externalParameters.workflow.repository = 'https://github.com/attacker/repository'
    bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(body)).toString('base64')
  }, /workflow identity/],
  ['wrong workflow', (value) => {
    const bundle = value.auditReport.verified[0].attestationBundles[0]
    const body = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8'))
    body.predicate.buildDefinition.externalParameters.workflow.path = '.github/workflows/attacker.yml'
    bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(body)).toString('base64')
  }, /workflow identity/],
  ['tag-loaded workflow ref', (value) => {
    const bundle = value.auditReport.verified[0].attestationBundles[0]
    const body = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8'))
    body.predicate.buildDefinition.externalParameters.workflow.ref = `refs/tags/v${value.pkg.dependencies[DS]}`
    bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(body)).toString('base64')
  }, /workflow identity/],
  ['feature-branch workflow ref', (value) => {
    const bundle = value.auditReport.verified[0].attestationBundles[0]
    const body = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8'))
    body.predicate.buildDefinition.externalParameters.workflow.ref = 'refs/heads/feature'
    bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(body)).toString('base64')
  }, /workflow identity/],
  ['wrong commit', (value) => {
    const bundle = value.auditReport.verified[0].attestationBundles[0]
    const body = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8'))
    body.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = 'f'.repeat(40)
    bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(body)).toString('base64')
  }, /exact protected-main release commit/],
  ['wrong immutable tag target', (value) => { value.snapshot.tagIdentity.commit = 'f'.repeat(40) }, /exact trusted repository, tag object, commit, and tree/],
  ['wrong npm SRI', (value) => {
    const bom = JSON.parse(value.snapshot.assetBodies['release-bom.json'].toString('utf8'))
    bom.packages.find((item) => item.name === DS).integrity = sri(0x44)
    const bytes = Buffer.from(`${JSON.stringify(bom, null, 2)}\n`)
    value.snapshot.assetBodies['release-bom.json'] = bytes
    const asset = value.snapshot.release.assets.find(item => item.name === 'release-bom.json')
    asset.size = bytes.length
    asset.digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  }, /npm SRI does not match/],
  ['missing scaffold-lock release asset', (value) => {
    value.snapshot.release.assets = value.snapshot.release.assets.filter(item => item.name !== PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET)
  }, /closed release asset set/],
  ['substituted scaffold-lock bytes', (value) => {
    value.snapshot.assetBodies[PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET] = Buffer.from('{}\n')
  }, /failed exact metadata\/byte readback/],
  ['missing permanent receipt asset', (value) => {
    delete value.snapshot.assetBodies[NPM_FINALIZATION_RECEIPT_ASSET]
    value.snapshot.release.assets = value.snapshot.release.assets.filter(item => item.name !== NPM_FINALIZATION_RECEIPT_ASSET)
  }, /exactly|closed release asset set/],
  ['rogue ninth release asset', (value) => {
    value.snapshot.assetBodies['rogue.txt'] = Buffer.from('rogue\n')
    value.snapshot.release.assets.push({
      id: 999999,
      name: 'rogue.txt',
      state: 'uploaded',
      size: 6,
      digest: `sha256:${sha256('rogue\n')}`,
      browser_download_url: `https://github.com/${TRUSTED_UPGRADE_POLICY.repository}/releases/download/v${value.pkg.dependencies[DS]}/rogue.txt`,
    })
  }, /exactly|closed release asset set/],
  ['receipt tag-object substitution', (value) => {
    rewriteJsonAsset(value.snapshot, NPM_FINALIZATION_RECEIPT_ASSET, receipt => { receipt.releaseTrust.tagObject = 'a'.repeat(40) })
  }, /same exact tag object/],
  ['trust evidence tag-object substitution', (value) => {
    rewriteJsonAsset(value.snapshot, RELEASE_TRUST_PREFLIGHT_ASSET, trust => { trust.release.tagObject = 'a'.repeat(40) })
  }, /release trust preflight tagObject mismatch/],
  ['unverified tag signature', (value) => {
    value.snapshot.tagIdentity.verification.verified = false
    value.snapshot.tagIdentity.verification.reason = 'unsigned'
  }, /not a direct GitHub-verified signed annotated tag object/],
  ['missing release', (value) => { value.snapshot.release = null }, /missing, draft, mutable/],
  ['mutable release', (value) => { value.snapshot.release.immutable = false }, /missing, draft, mutable/],
]) {
  test(`rejects ${label} before incoming package code`, async (t) => {
    const value = await fixture(t)
    mutate(value)
    await assert.rejects(verifyCandidate(value), pattern)
  })
}

function releaseFetch(snapshot, { reference = snapshot.tagApi.reference, tagObject = snapshot.tagApi.tagObject } = {}) {
  return async url => {
    const tag = snapshot.tagIdentity.tag
    if (url.endsWith(`/releases/tags/${tag}`)) return { ok: true, json: async () => snapshot.release }
    const asset = snapshot.release.assets.find(item => item.browser_download_url === url)
    if (asset) return { ok: true, arrayBuffer: async () => snapshot.assetBodies[asset.name] }
    if (url.endsWith(`/git/ref/tags/${tag}`)) return { ok: true, json: async () => reference }
    if (url.endsWith(`/git/tags/${snapshot.tagIdentity.tagObject}`)) return { ok: true, json: async () => tagObject }
    if (url.endsWith(`/git/commits/${snapshot.tagIdentity.commit}`)) {
      return { ok: true, json: async () => ({ sha: snapshot.tagIdentity.commit, tree: { sha: snapshot.tagIdentity.tree } }) }
    }
    return { ok: false, status: 404 }
  }
}

test('live ordinary immutable resolver accepts one exact lightweight commit tag', async () => {
  const snapshot = releaseSnapshot('0.1.0-beta.94')
  snapshot.tagApi.reference = {
    ref: `refs/tags/${snapshot.tagIdentity.tag}`,
    object: { type: 'commit', sha: snapshot.tagIdentity.commit },
  }
  const resolved = await resolveImmutableReleaseSnapshot({
    repository: TRUSTED_UPGRADE_POLICY.repository,
    tag: snapshot.tagIdentity.tag,
    assetName: TRUSTED_UPGRADE_POLICY.releaseBomAsset,
    fetchImpl: releaseFetch(snapshot),
    ordinaryRelease: true,
  })
  assert.equal(resolved.tagIdentity.ref, `refs/tags/${snapshot.tagIdentity.tag}`)
  assert.equal(resolved.tagIdentity.tagObject, snapshot.tagIdentity.commit)
  assert.equal(resolved.tagIdentity.commit, snapshot.tagIdentity.commit)
  assert.deepEqual(resolved.tagIdentity.verification, {
    verified: false,
    reason: 'unsigned',
    verifiedAt: null,
    signatureSha256: null,
    payloadSha256: null,
  })
})

for (const [label, mutate, pattern] of [
  ['lightweight release tag in the high-assurance lane', snapshot => {
    snapshot.tagApi.reference = { ref: `refs/tags/${snapshot.tagIdentity.tag}`, object: { type: 'commit', sha: snapshot.tagIdentity.commit } }
  }, /high-assurance.*annotated tag object/],
  ['multiple tag references', snapshot => {
    snapshot.tagApi.reference = [
      snapshot.tagApi.reference,
      { ref: `refs/tags/${snapshot.tagIdentity.tag}`, object: { type: 'commit', sha: snapshot.tagIdentity.commit } },
    ]
  }, /one exact.*tag ref/],
  ['wrong exact tag ref', snapshot => {
    snapshot.tagApi.reference.ref = `refs/tags/${snapshot.tagIdentity.tag}-other`
  }, /one exact.*tag ref/],
  ['non-commit lightweight target', snapshot => {
    snapshot.tagApi.reference.object.type = 'blob'
  }, /one exact.*tag ref/],
  ['indirect annotated tag target', snapshot => { snapshot.tagApi.tagObject.object.type = 'tag' }, /direct commit binding is invalid/],
  ['wrong annotated tag name', snapshot => { snapshot.tagApi.tagObject.tag = 'v9.9.9' }, /object\/name\/direct commit binding is invalid/],
  ['invalid annotated tag signature', snapshot => {
    snapshot.tagApi.tagObject.verification.verified = false
    snapshot.tagApi.tagObject.verification.reason = 'invalid'
  }, /not an acceptable direct annotated tag object/],
]) {
  test(`live immutable resolver rejects ${label}`, async () => {
    const snapshot = releaseSnapshot('0.1.0-beta.94')
    mutate(snapshot)
    await assert.rejects(resolveImmutableReleaseSnapshot({
      repository: TRUSTED_UPGRADE_POLICY.repository,
      tag: snapshot.tagIdentity.tag,
      assetName: TRUSTED_UPGRADE_POLICY.releaseBomAsset,
      fetchImpl: releaseFetch(snapshot),
    }), pattern)
  })
}

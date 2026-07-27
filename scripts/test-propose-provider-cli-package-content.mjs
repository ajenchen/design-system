import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import {
  proposeProviderCliPackageContent,
  verifyProviderCliPackageContentProposal,
} from './propose-provider-cli-package-content.mjs'

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST_PATH = 'infra/governance/providers/provider-cli-toolchain.json'
const LOCK_PATH = 'infra/governance/providers/provider-cli-toolchain.package-lock.json'
const PROPOSER_PATH = 'scripts/propose-provider-cli-package-content.mjs'
const PARSER_SETUP_PATH = 'scripts/setup-provider-cli-toolchain.mjs'
const VERIFIER_CHILD_PATH = 'scripts/test-fixtures/provider-cli-proposal-verifier-child.mjs'
const PROPOSAL_SCHEMA_PATH = 'infra/governance/schemas/provider-cli-package-content-proposal.schema.json'
const PROPOSAL_SCHEMA_ID = 'https://qijenchen.dev/schemas/provider-cli-package-content-proposal-v1.json'
const BASE_MANIFEST = JSON.parse(readFileSync(join(REPOSITORY_ROOT, MANIFEST_PATH), 'utf8'))
const BASE_LOCK = JSON.parse(readFileSync(join(REPOSITORY_ROOT, LOCK_PATH), 'utf8'))

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function integrity(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

function writeAscii(target, offset, length, value) {
  const bytes = Buffer.from(value, 'ascii')
  assert.ok(bytes.length <= length)
  bytes.copy(target, offset)
}

function writeOctal(target, offset, length, value) {
  const encoded = `${value.toString(8).padStart(length - 1, '0')}\0`
  writeAscii(target, offset, length, encoded)
}

function tarHeader({ name, size, type = '0' }) {
  const header = Buffer.alloc(512)
  writeAscii(header, 0, 100, name)
  writeOctal(header, 100, 8, type === '5' ? 0o755 : 0o644)
  writeOctal(header, 108, 8, 0)
  writeOctal(header, 116, 8, 0)
  writeOctal(header, 124, 12, size)
  writeOctal(header, 136, 12, 0)
  header.fill(0x20, 148, 156)
  writeAscii(header, 156, 1, type)
  writeAscii(header, 257, 6, 'ustar\0')
  writeAscii(header, 263, 2, '00')
  let checksum = 0
  for (const byte of header) checksum += byte
  writeAscii(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `)
  return header
}

function strictPackageTarball(entries) {
  const blocks = []
  for (const entry of entries) {
    const body = Buffer.from(entry.body ?? '')
    blocks.push(tarHeader({ name: entry.name, size: body.length, type: entry.type }))
    blocks.push(body)
    const padding = (512 - (body.length % 512)) % 512
    if (padding) blocks.push(Buffer.alloc(padding))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 })
}

const VALID_TARBALL = strictPackageTarball([
  { name: 'package/package.json', body: '{"name":"fixture","version":"1.0.0"}\n' },
  { name: 'package/bin/tool.js', body: '#!/usr/bin/env node\n' },
])

function platformPackageName(tool, platform) {
  return tool.platformPackage.nameTemplate.replace('{platform}', platform)
}

function activePaths(manifest) {
  const paths = []
  for (const tool of manifest.tools) {
    paths.push(`node_modules/${tool.packageName}`)
    if (tool.platformPackage === null) continue
    for (const platform of manifest.installPolicy.supportedPlatforms) {
      paths.push(`node_modules/${platformPackageName(tool, platform)}`)
    }
  }
  return paths.sort()
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function manifestWithPackageContent(manifest, packageContent) {
  return {
    $schema: manifest.$schema,
    schemaVersion: manifest.schemaVersion,
    kind: manifest.kind,
    registry: manifest.registry,
    packageLock: manifest.packageLock,
    packageContent,
    installPolicy: manifest.installPolicy,
    providerBindings: manifest.providerBindings,
    tools: manifest.tools,
  }
}

function fixture(t, {
  archives = null,
  mutateLock = () => {},
  mutateManifest = () => {},
} = {}) {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'provider-cli-content-proposal-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const manifest = structuredClone(BASE_MANIFEST)
  const lock = structuredClone(BASE_LOCK)
  delete manifest.packageContent
  const paths = activePaths(manifest)
  const archiveByPath = new Map(paths.map(path => [path, archives?.get(path) ?? VALID_TARBALL]))
  for (const path of paths) lock.packages[path].integrity = integrity(archiveByPath.get(path))
  mutateLock(lock, { paths })
  manifest.packageLock.packageCount = Object.keys(lock.packages).length - 1
  const lockBytes = Buffer.from(`${JSON.stringify(lock, null, 2)}\n`)
  manifest.packageLock.sha256 = sha256(lockBytes)
  mutateManifest(manifest, { lock, paths })
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(root, 'manifest.before'), manifestBytes)
  writeFileSync(join(root, 'lock.before'), lockBytes)
  writeJson(join(root, MANIFEST_PATH), manifest)
  mkdirSync(dirname(join(root, LOCK_PATH)), { recursive: true })
  writeFileSync(join(root, LOCK_PATH), lockBytes)
  return { archiveByPath, lock, lockBytes, manifest, manifestBytes, paths, root }
}

function successfulFetch(fixtureState, { override = null } = {}) {
  const pathByUrl = new Map(fixtureState.paths.map(path => [fixtureState.lock.packages[path].resolved, path]))
  const calls = []
  let active = 0
  let maxActive = 0
  const fetchImpl = async (url, options) => {
    calls.push({ options, url })
    active += 1
    maxActive = Math.max(maxActive, active)
    await new Promise(resolvePromise => setImmediate(resolvePromise))
    active -= 1
    const path = pathByUrl.get(url)
    if (!path) throw new Error(`fixture received an unexpected URL:${url}`)
    const body = override?.(path, fixtureState.archiveByPath.get(path)) ?? fixtureState.archiveByPath.get(path)
    const response = new Response(body, { status: 200 })
    Object.defineProperty(response, 'url', { value: url })
    return response
  }
  return { calls, fetchImpl, maxActive: () => maxActive }
}

test('proposal is deterministic, sequential, closed to ten active rows, and never writes authority', async (t) => {
  const state = fixture(t)
  const authorityBefore = readFileSync(join(state.root, MANIFEST_PATH))
  const lockBefore = readFileSync(join(state.root, LOCK_PATH))
  const firstFetch = successfulFetch(state)
  const secondFetch = successfulFetch(state)
  const first = await proposeProviderCliPackageContent({ rootPath: state.root, fetchImpl: firstFetch.fetchImpl })
  const second = await proposeProviderCliPackageContent({ rootPath: state.root, fetchImpl: secondFetch.fetchImpl })

  assert.deepEqual(second, first)
  assert.equal(first.$schema, PROPOSAL_SCHEMA_ID)
  assert.equal(first.kind, 'provider-cli-package-content-proposal')
  assert.equal(first.proposalOnly, true)
  assert.equal(first.activePackageCount, 10)
  assert.equal(first.proposedPackageContent.packages.length, 10)
  assert.deepEqual(
    first.proposedPackageContent.packages.map(record => record.lockPath),
    [...state.paths].sort(),
  )
  assert.equal(
    first.proposedPackageContent.packages.filter(record => record.platforms.length === 4).length,
    2,
  )
  assert.equal(
    first.proposedPackageContent.packages.filter(record => record.platforms.length === 1).length,
    8,
  )
  assert.equal(first.manifestTransition.inputManifestSha256, sha256(authorityBefore))
  assert.equal(first.authority.lockSha256, sha256(lockBefore))
  assert.equal(
    first.manifestTransition.proposedManifestSha256,
    sha256(Buffer.from(`${JSON.stringify(
      manifestWithPackageContent(state.manifest, first.proposedPackageContent),
      null,
      2,
    )}\n`)),
  )
  assert.equal(
    first.proposedPackageContentSha256,
    sha256(Buffer.from(`${JSON.stringify(first.proposedPackageContent, null, 2)}\n`)),
  )
  assert.deepEqual(first.derivation, {
    protocol: 'npm-ustar-package-tree-v1',
    modePolicy: 'excluded-portable-content-only',
    digestDomain: 'qijenchen-provider-cli-package-content-v1',
    proposer: {
      path: PROPOSER_PATH,
      sha256: sha256(readFileSync(join(REPOSITORY_ROOT, PROPOSER_PATH))),
    },
    parserSetup: {
      path: PARSER_SETUP_PATH,
      sha256: sha256(readFileSync(join(REPOSITORY_ROOT, PARSER_SETUP_PATH))),
    },
    proposalSchema: {
      path: PROPOSAL_SCHEMA_PATH,
      sha256: sha256(readFileSync(join(REPOSITORY_ROOT, PROPOSAL_SCHEMA_PATH))),
    },
  })
  assert.equal(Object.hasOwn(first, 'generatedAt'), false)
  assert.equal(first.reviewApplyHandoff.writesAuthority, false)
  assert.equal(first.reviewApplyHandoff.directApplySupported, false)
  assert.equal(firstFetch.maxActive(), 1)
  assert.equal(secondFetch.maxActive(), 1)
  assert.deepEqual(
    firstFetch.calls.map(call => call.url),
    state.paths.map(path => state.lock.packages[path].resolved),
  )
  for (const call of firstFetch.calls) {
    assert.equal(call.options.redirect, 'manual')
    assert.ok(call.options.signal instanceof AbortSignal)
  }
  assert.equal(readFileSync(join(state.root, MANIFEST_PATH)).equals(authorityBefore), true)
  assert.equal(readFileSync(join(state.root, LOCK_PATH)).equals(lockBefore), true)
})

test('SRI mismatch is rejected by the shared strict package-content helper', async (t) => {
  const state = fixture(t)
  const fetch = successfulFetch(state, {
    override: (path, bytes) => path === state.paths[0] ? Buffer.concat([bytes, Buffer.from([0])]) : bytes,
  })
  await assert.rejects(
    proposeProviderCliPackageContent({ rootPath: state.root, fetchImpl: fetch.fetchImpl }),
    /package tarball SHA-512 differs from the exact lock/,
  )
})

for (const [label, archive, expected] of [
  [
    'link entry',
    strictPackageTarball([{ name: 'package/link', type: '2' }]),
    /contains a link, special, PAX, or extension entry/,
  ],
  [
    'path traversal',
    strictPackageTarball([{ name: 'package/../escape', body: 'escape' }]),
    /portable repository-relative path/,
  ],
  [
    'duplicate path',
    strictPackageTarball([
      { name: 'package/duplicate', body: 'first' },
      { name: 'package/duplicate', body: 'second' },
    ]),
    /contains a duplicate path/,
  ],
]) {
  test(`shared strict parser rejects ${label}`, async (t) => {
    const manifest = structuredClone(BASE_MANIFEST)
    delete manifest.packageContent
    const firstPath = activePaths(manifest)[0]
    const archives = new Map([[firstPath, archive]])
    const state = fixture(t, { archives })
    const fetch = successfulFetch(state)
    await assert.rejects(
      proposeProviderCliPackageContent({ rootPath: state.root, fetchImpl: fetch.fetchImpl }),
      expected,
    )
  })
}

test('mutable registry and non-exact resolved URL are rejected before download', async (t) => {
  const mutableRegistry = fixture(t, {
    mutateManifest: manifest => { manifest.registry = 'https://registry.example.invalid/' },
  })
  let mutableFetchCalls = 0
  await assert.rejects(
    proposeProviderCliPackageContent({
      rootPath: mutableRegistry.root,
      fetchImpl: async () => { mutableFetchCalls += 1; throw new Error('must not fetch') },
    }),
    /provider CLI registry is not canonical/,
  )
  assert.equal(mutableFetchCalls, 0)

  const mutableResolved = fixture(t, {
    mutateLock: (lock, { paths }) => {
      lock.packages[paths[0]].resolved += '?tag=latest'
    },
  })
  let resolvedFetchCalls = 0
  await assert.rejects(
    proposeProviderCliPackageContent({
      rootPath: mutableResolved.root,
      fetchImpl: async () => { resolvedFetchCalls += 1; throw new Error('must not fetch') },
    }),
    /provider CLI package artifact is not the canonical registry tarball/,
  )
  assert.equal(resolvedFetchCalls, 0)
})

test('cross-origin redirects and oversized responses fail closed', async (t) => {
  const redirected = fixture(t)
  await assert.rejects(
    proposeProviderCliPackageContent({
      rootPath: redirected.root,
      fetchImpl: async () => new Response(null, {
        status: 302,
        headers: { location: 'https://attacker.invalid/provider-cli.tgz' },
      }),
    }),
    /cross-origin redirect is forbidden/,
  )

  const oversized = fixture(t)
  await assert.rejects(
    proposeProviderCliPackageContent({
      rootPath: oversized.root,
      maxCompressedBytes: VALID_TARBALL.length - 1,
      fetchImpl: async (url) => {
        const response = new Response(VALID_TARBALL, {
          status: 200,
          headers: { 'content-length': String(VALID_TARBALL.length) },
        })
        Object.defineProperty(response, 'url', { value: url })
        return response
      },
    }),
    /exceeds compressed-byte bound/,
  )
})

test('each sequential request has a hard timeout', async (t) => {
  const pendingFetch = fixture(t)
  await assert.rejects(
    proposeProviderCliPackageContent({
      rootPath: pendingFetch.root,
      requestTimeoutMs: 10,
      fetchImpl: async () => new Promise(() => {}),
    }),
    /package request timed out/,
  )

  const pendingBody = fixture(t)
  await assert.rejects(
    proposeProviderCliPackageContent({
      rootPath: pendingBody.root,
      requestTimeoutMs: 10,
      fetchImpl: async (url) => {
        const response = new Response(new ReadableStream({ start() {} }), { status: 200 })
        Object.defineProperty(response, 'url', { value: url })
        return response
      },
    }),
    /package request timed out/,
  )
})

test('authority changes during download invalidate the proposal', async (t) => {
  const state = fixture(t)
  const fetch = successfulFetch(state)
  let changed = false
  const mutatingFetch = async (url, options) => {
    if (!changed) {
      changed = true
      const manifest = JSON.parse(readFileSync(join(state.root, MANIFEST_PATH), 'utf8'))
      writeFileSync(join(state.root, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n\n`)
    }
    return fetch.fetchImpl(url, options)
  }
  await assert.rejects(
    proposeProviderCliPackageContent({ rootPath: state.root, fetchImpl: mutatingFetch }),
    /authority manifest changed while the operation was running/,
  )
})

test('required dependency growth outside the manifest-derived closure is rejected', async (t) => {
  const state = fixture(t, {
    mutateLock: (lock, { paths }) => {
      lock.packages[paths[0]].dependencies = { '@future-ai/extra-runtime': '1.0.0' }
      lock.packages['node_modules/@future-ai/extra-runtime'] = {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/@future-ai/extra-runtime/-/extra-runtime-1.0.0.tgz',
        integrity: `sha512-${Buffer.alloc(64, 7).toString('base64')}`,
      }
    },
  })
  let calls = 0
  await assert.rejects(
    proposeProviderCliPackageContent({
      rootPath: state.root,
      fetchImpl: async () => { calls += 1; throw new Error('must not fetch') },
    }),
    /required dependency escapes the content-authorized active closure/,
  )
  assert.equal(calls, 0)
})

test('read-only verifier rederives the bound input transition and accepts the exact proposed state', async (t) => {
  const state = fixture(t)
  const fetch = successfulFetch(state)
  const proposal = await proposeProviderCliPackageContent({
    rootPath: state.root,
    fetchImpl: fetch.fetchImpl,
  })
  const proposalPath = join(state.root, 'provider-cli-package-content-proposal.json')
  writeJson(proposalPath, proposal)
  const inputManifestBefore = readFileSync(join(state.root, MANIFEST_PATH))
  const lockBefore = readFileSync(join(state.root, LOCK_PATH))

  const inputRefetch = successfulFetch(state)
  const inputVerification = await verifyProviderCliPackageContentProposal({
    rootPath: state.root,
    proposalPath,
    fetchImpl: inputRefetch.fetchImpl,
  })
  assert.equal(inputVerification.ok, true)
  assert.equal(inputVerification.mode, 'read-only-proposal-verification')
  assert.equal(inputVerification.authorityState, 'input')
  assert.equal(inputVerification.activePackageCount, 10)
  assert.equal(inputVerification.independentlyRederivedPackageCount, 10)
  assert.equal(inputVerification.exactArtifactsRefetched, true)
  assert.equal(inputVerification.writesAuthority, false)
  assert.equal(inputRefetch.calls.length, 10)
  assert.equal(inputRefetch.maxActive(), 1)
  assert.equal(readFileSync(join(state.root, MANIFEST_PATH)).equals(inputManifestBefore), true)
  assert.equal(readFileSync(join(state.root, LOCK_PATH)).equals(lockBefore), true)

  const child = spawnSync(process.execPath, [
    '--',
    VERIFIER_CHILD_PATH,
    state.root,
    proposalPath,
    VALID_TARBALL.toString('base64'),
  ], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    shell: false,
  })
  assert.equal(child.status, 0, child.stderr)
  assert.equal(JSON.parse(child.stdout).authorityState, 'input')
  assert.equal(readFileSync(join(state.root, MANIFEST_PATH)).equals(inputManifestBefore), true)
  assert.equal(readFileSync(join(state.root, LOCK_PATH)).equals(lockBefore), true)

  const proposedManifestBytes = Buffer.from(`${JSON.stringify(
    manifestWithPackageContent(state.manifest, proposal.proposedPackageContent),
    null,
    2,
  )}\n`)
  assert.equal(sha256(proposedManifestBytes), proposal.manifestTransition.proposedManifestSha256)
  writeFileSync(join(state.root, MANIFEST_PATH), proposedManifestBytes)
  const postRefetch = successfulFetch(state)
  const postVerification = await verifyProviderCliPackageContentProposal({
    rootPath: state.root,
    proposalPath,
    fetchImpl: postRefetch.fetchImpl,
  })
  assert.equal(postVerification.ok, true)
  assert.equal(postVerification.authorityState, 'proposed')
  assert.equal(postRefetch.calls.length, 10)
  assert.equal(readFileSync(join(state.root, MANIFEST_PATH)).equals(proposedManifestBytes), true)
  assert.equal(readFileSync(join(state.root, LOCK_PATH)).equals(lockBefore), true)
})

test('verifier fails closed on open shape, source drift, digest drift, and unrelated authority state', async (t) => {
  const state = fixture(t)
  const fetch = successfulFetch(state)
  const proposal = await proposeProviderCliPackageContent({
    rootPath: state.root,
    fetchImpl: fetch.fetchImpl,
  })
  const manifestBefore = readFileSync(join(state.root, MANIFEST_PATH))
  const lockBefore = readFileSync(join(state.root, LOCK_PATH))
  const verifyTamper = async (name, mutate, expected) => {
    const tampered = structuredClone(proposal)
    mutate(tampered)
    const path = join(state.root, `${name}.json`)
    writeJson(path, tampered)
    let fetchCalls = 0
    await assert.rejects(
      verifyProviderCliPackageContentProposal({
        rootPath: state.root,
        proposalPath: path,
        fetchImpl: async () => {
          fetchCalls += 1
          throw new Error('invalid proposal must fail before network')
        },
      }),
      expected,
    )
    assert.equal(fetchCalls, 0)
    assert.equal(readFileSync(join(state.root, MANIFEST_PATH)).equals(manifestBefore), true)
    assert.equal(readFileSync(join(state.root, LOCK_PATH)).equals(lockBefore), true)
  }

  await verifyTamper('open-shape', value => { value.generatedAt = '2026-07-24T00:00:00.000Z' }, /violates its closed schema/)
  await verifyTamper('source-drift', value => { value.derivation.proposer.sha256 = '0'.repeat(64) }, /proposer source digest differs/)
  await verifyTamper('content-digest-drift', value => { value.proposedPackageContent.packages[0].treeSha256 = '0'.repeat(64) }, /package-content digest is invalid/)
  await verifyTamper('transition-drift', value => { value.manifestTransition.proposedManifestSha256 = '0'.repeat(64) }, /proposed-manifest digest does not match/)
  await verifyTamper('lock-drift', value => { value.authority.lockSha256 = '0'.repeat(64) }, /package-lock digest differs/)

  const forged = structuredClone(proposal)
  forged.proposedPackageContent.packages[0].treeSha256 = '0'.repeat(64)
  forged.proposedPackageContentSha256 = sha256(
    Buffer.from(`${JSON.stringify(forged.proposedPackageContent, null, 2)}\n`),
  )
  forged.manifestTransition.proposedManifestSha256 = sha256(Buffer.from(`${JSON.stringify(
    manifestWithPackageContent(state.manifest, forged.proposedPackageContent),
    null,
    2,
  )}\n`))
  const forgedPath = join(state.root, 'structurally-valid-forgery.json')
  writeJson(forgedPath, forged)
  const forgedRefetch = successfulFetch(state)
  await assert.rejects(
    verifyProviderCliPackageContentProposal({
      rootPath: state.root,
      proposalPath: forgedPath,
      fetchImpl: forgedRefetch.fetchImpl,
    }),
    /rows differ from independently rederived exact-lock tarball content/,
  )
  assert.equal(forgedRefetch.calls.length, 10)
  assert.equal(forgedRefetch.maxActive(), 1)

  const validPath = join(state.root, 'valid-proposal.json')
  writeJson(validPath, proposal)
  const noncanonicalPath = join(state.root, 'noncanonical-proposal.json')
  writeFileSync(noncanonicalPath, JSON.stringify(proposal))
  await assert.rejects(
    verifyProviderCliPackageContentProposal({
      rootPath: state.root,
      proposalPath: noncanonicalPath,
      fetchImpl: async () => { throw new Error('must not fetch') },
    }),
    /must use exact canonical 2-space-plus-newline JSON bytes/,
  )
  const unrelated = JSON.parse(manifestBefore.toString('utf8'))
  unrelated.installPolicy.auditLevel = 'critical'
  writeJson(join(state.root, MANIFEST_PATH), unrelated)
  await assert.rejects(
    verifyProviderCliPackageContentProposal({
      rootPath: state.root,
      proposalPath: validPath,
      fetchImpl: async () => { throw new Error('must not fetch') },
    }),
    /install policy diluted its hard gates|neither the bound input nor the reviewed proposed state/,
  )
  writeFileSync(join(state.root, MANIFEST_PATH), manifestBefore)
})

test('CLI verify mode rejects malformed proposal without network or authority writes', (t) => {
  const state = fixture(t)
  const proposalPath = join(state.root, 'invalid-proposal.json')
  writeJson(proposalPath, {})
  const manifestBefore = readFileSync(join(REPOSITORY_ROOT, MANIFEST_PATH))
  const lockBefore = readFileSync(join(REPOSITORY_ROOT, LOCK_PATH))
  const result = spawnSync(process.execPath, [
    '--',
    'scripts/propose-provider-cli-package-content.mjs',
    '--verify-proposal',
    proposalPath,
  ], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    shell: false,
  })
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /violates its closed schema/)
  assert.equal(readFileSync(join(REPOSITORY_ROOT, MANIFEST_PATH)).equals(manifestBefore), true)
  assert.equal(readFileSync(join(REPOSITORY_ROOT, LOCK_PATH)).equals(lockBefore), true)
})

test('CLI has no apply mode and rejects it before reading network or writing authority', () => {
  const manifestBefore = readFileSync(join(REPOSITORY_ROOT, MANIFEST_PATH))
  const lockBefore = readFileSync(join(REPOSITORY_ROOT, LOCK_PATH))
  const result = spawnSync(process.execPath, [
    '--',
    'scripts/propose-provider-cli-package-content.mjs',
    '--apply',
  ], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    shell: false,
  })
  assert.equal(result.status, 2)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /proposal-only; it has no apply mode and never writes authority/)
  assert.equal(readFileSync(join(REPOSITORY_ROOT, MANIFEST_PATH)).equals(manifestBefore), true)
  assert.equal(readFileSync(join(REPOSITORY_ROOT, LOCK_PATH)).equals(lockBefore), true)
})

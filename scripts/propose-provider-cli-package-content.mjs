#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  deriveActivePackageContentPlan,
  deriveLockedPackageContentFromTarball,
  PROVIDER_CLI_PACKAGE_CONTENT_CONTRACT,
  resolveProviderCliToolchainCandidateAuthority,
} from './setup-provider-cli-toolchain.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ERROR_PREFIX = 'GOV-PROVIDER-CLI-CONTENT-PROPOSAL-001'
const AUTHORITY_MANIFEST_PATH = 'infra/governance/providers/provider-cli-toolchain.json'
const AUTHORITY_LOCK_PATH = 'infra/governance/providers/provider-cli-toolchain.package-lock.json'
const PROPOSER_PATH = 'scripts/propose-provider-cli-package-content.mjs'
const PARSER_SETUP_PATH = 'scripts/setup-provider-cli-toolchain.mjs'
const PROPOSAL_SCHEMA_PATH = 'infra/governance/schemas/provider-cli-package-content-proposal.schema.json'
const PROPOSAL_SCHEMA_ID = 'https://qijenchen.dev/schemas/provider-cli-package-content-proposal-v1.json'
const REQUEST_TIMEOUT_MS = 30_000

function invariant(condition, message) {
  if (!condition) throw new Error(`${ERROR_PREFIX}:${message}`)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function portableRepoPath(value, label) {
  invariant(
    typeof value === 'string'
      && value.length > 0
      && !isAbsolute(value)
      && !value.includes('\\')
      && !/[\0\n\r]/.test(value)
      && value.split('/').every(part => part && part !== '.' && part !== '..'),
    `${label} must be a portable repository-relative path`,
  )
  return value
}

function containedPath(root, repoPath, label) {
  portableRepoPath(repoPath, label)
  const absolute = resolve(root, repoPath)
  const rel = relative(root, absolute)
  invariant(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label} escapes the repository`)
  return absolute
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino
}

function sameFileState(left, right) {
  return sameIdentity(left, right)
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
}

function readStableExactFile(absolutePath, label) {
  const absolute = resolve(absolutePath)
  const before = lstatSync(absolute, { bigint: true })
  invariant(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n, `${label} must be one regular no-link file`)
  invariant(realpathSync(absolute) === absolute, `${label} must not traverse a symbolic-link alias`)
  const bytes = readFileSync(absolute)
  const after = lstatSync(absolute, { bigint: true })
  invariant(
    after.isFile()
      && !after.isSymbolicLink()
      && after.nlink === 1n
      && sameFileState(before, after)
      && BigInt(bytes.length) === after.size,
    `${label} changed while it was read`,
  )
  return Object.freeze({ absolute, bytes, info: after })
}

function readStableRepoFile(root, repoPath, label) {
  return readStableExactFile(containedPath(root, repoPath, label), label)
}

function assertFileUnchanged(initial, label) {
  const current = readStableExactFile(initial.absolute, label)
  invariant(
    sameFileState(current.info, initial.info) && current.bytes.equals(initial.bytes),
    `${label} changed while the operation was running`,
  )
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new Error(`${ERROR_PREFIX}:${label} is invalid JSON:${error.message}`, { cause: error })
  }
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function manifestWithProposedPackageContent(manifest, proposedPackageContent) {
  return {
    $schema: manifest.$schema,
    schemaVersion: manifest.schemaVersion,
    kind: manifest.kind,
    registry: manifest.registry,
    packageLock: manifest.packageLock,
    packageContent: proposedPackageContent,
    installPolicy: manifest.installPolicy,
    providerBindings: manifest.providerBindings,
    tools: manifest.tools,
  }
}

function readDerivationSources() {
  return Object.freeze({
    proposer: readStableRepoFile(ROOT, PROPOSER_PATH, 'provider CLI package-content proposer source'),
    parserSetup: readStableRepoFile(ROOT, PARSER_SETUP_PATH, 'provider CLI package-content parser/setup source'),
    proposalSchema: readStableRepoFile(ROOT, PROPOSAL_SCHEMA_PATH, 'provider CLI package-content proposal schema source'),
  })
}

function sourceBinding(path, source) {
  return Object.freeze({ path, sha256: sha256(source.bytes) })
}

function validateProposalAgainstSchema(proposal, schemaBytes) {
  const schema = parseJson(schemaBytes, 'provider CLI package-content proposal schema')
  invariant(schema.$id === PROPOSAL_SCHEMA_ID, 'provider CLI package-content proposal schema identity drifted')
  let validate
  try {
    validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  } catch (error) {
    throw new Error(`${ERROR_PREFIX}:provider CLI package-content proposal schema is invalid:${error.message}`, { cause: error })
  }
  invariant(
    validate(proposal),
    `provider CLI package-content proposal violates its closed schema:${new Ajv2020().errorsText(validate.errors, { separator: '; ' })}`,
  )
}

function readAuthoritySnapshot(rootPath) {
  const root = realpathSync(resolve(rootPath))
  const manifestFile = readStableRepoFile(root, AUTHORITY_MANIFEST_PATH, 'provider CLI authority manifest')
  const lockFile = readStableRepoFile(root, AUTHORITY_LOCK_PATH, 'provider CLI exact package-lock')
  const authority = resolveProviderCliToolchainCandidateAuthority(root, { requirePackageContent: false })
  invariant(authority.role === 'authority', 'provider CLI package-content proposal requires the canonical DS authority')
  invariant(authority.manifestPath === AUTHORITY_MANIFEST_PATH, 'provider CLI authority manifest path drifted')
  invariant(authority.lockPath === AUTHORITY_LOCK_PATH, 'provider CLI authority package-lock path drifted')
  invariant(authority.manifestBytes.equals(manifestFile.bytes), 'provider CLI authority resolver read different manifest bytes')
  invariant(authority.lockBytes.equals(lockFile.bytes), 'provider CLI authority resolver read different package-lock bytes')
  invariant(authority.authorityDigest === sha256(manifestFile.bytes), 'provider CLI authority manifest digest drifted')
  invariant(authority.lockDigest === sha256(lockFile.bytes), 'provider CLI authority package-lock digest drifted')
  const activePlan = deriveActivePackageContentPlan(authority.manifest, authority.lock)
  return Object.freeze({ activePlan, authority, lockFile, manifestFile, root })
}

function validateNetworkOptions({ fetchImpl, maxCompressedBytes, requestTimeoutMs }) {
  invariant(typeof fetchImpl === 'function', 'provider CLI package-content network read requires a fetch implementation')
  invariant(
    Number.isSafeInteger(maxCompressedBytes)
      && maxCompressedBytes >= 1
      && maxCompressedBytes <= PROVIDER_CLI_PACKAGE_CONTENT_CONTRACT.maxCompressedBytes,
    'provider CLI package-content compressed-byte bound is invalid',
  )
  invariant(
    Number.isSafeInteger(requestTimeoutMs) && requestTimeoutMs >= 1 && requestTimeoutMs <= REQUEST_TIMEOUT_MS,
    'provider CLI package-content request timeout is invalid',
  )
}

async function readBoundedResponse(response, { controller, lockPath, maxCompressedBytes }) {
  invariant(response.body, `provider CLI package response has no body:${lockPath}`)
  const lengthHeader = response.headers?.get?.('content-length')
  if (lengthHeader !== null && lengthHeader !== undefined) {
    invariant(/^(0|[1-9][0-9]*)$/.test(lengthHeader), `provider CLI package content-length is invalid:${lockPath}`)
    invariant(Number(lengthHeader) <= maxCompressedBytes, `provider CLI package exceeds compressed-byte bound:${lockPath}`)
  }
  const chunks = []
  let total = 0
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk)
    total += bytes.length
    if (total > maxCompressedBytes) {
      controller.abort()
      throw new Error(`${ERROR_PREFIX}:provider CLI package exceeds compressed-byte bound:${lockPath}`)
    }
    chunks.push(bytes)
  }
  invariant(total > 0, `provider CLI package response is empty:${lockPath}`)
  return Buffer.concat(chunks, total)
}

async function downloadExactTarball(row, {
  fetchImpl,
  maxCompressedBytes,
  requestTimeoutMs,
}) {
  const requested = row.resolved
  const requestedUrl = new URL(requested)
  const controller = new AbortController()
  let timeout
  const timeoutFailure = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      const error = new Error('provider CLI package request timed out')
      controller.abort(error)
      reject(error)
    }, requestTimeoutMs)
  })
  try {
    const request = (async () => {
      const response = await fetchImpl(requested, {
        headers: { accept: 'application/octet-stream' },
        redirect: 'manual',
        signal: controller.signal,
      })
      invariant(response && typeof response.status === 'number', `provider CLI package fetch returned an invalid response:${row.lockPath}`)
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers?.get?.('location')
        invariant(typeof location === 'string' && location.length > 0, `provider CLI package redirect lacks Location:${row.lockPath}`)
        const destination = new URL(location, requestedUrl)
        invariant(destination.origin === requestedUrl.origin, `provider CLI package cross-origin redirect is forbidden:${row.lockPath}`)
        throw new Error(`${ERROR_PREFIX}:provider CLI package redirect violates the exact resolved URL:${row.lockPath}`)
      }
      invariant(response.status === 200, `provider CLI package fetch failed:${row.lockPath}:HTTP ${response.status}`)
      invariant(typeof response.url === 'string' && response.url.length > 0, `provider CLI package response omitted its final URL:${row.lockPath}`)
      if (response.redirected || response.url !== requested) {
        const finalUrl = new URL(response.url)
        invariant(finalUrl.origin === requestedUrl.origin, `provider CLI package cross-origin redirect is forbidden:${row.lockPath}`)
        throw new Error(`${ERROR_PREFIX}:provider CLI package fetch did not remain on the exact resolved URL:${row.lockPath}`)
      }
      return readBoundedResponse(response, { controller, lockPath: row.lockPath, maxCompressedBytes })
    })()
    return await Promise.race([request, timeoutFailure])
  } catch (error) {
    if (controller.signal.aborted && !String(error?.message || error).includes(ERROR_PREFIX)) {
      throw new Error(`${ERROR_PREFIX}:provider CLI package request timed out:${row.lockPath}`, { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function assertPackageContentMatchesPlan(proposedPackageContent, activePlan) {
  invariant(
    proposedPackageContent.packages.length === activePlan.length,
    'provider CLI package-content proposal row count differs from the shared active plan',
  )
  for (let index = 0; index < activePlan.length; index += 1) {
    const expected = activePlan[index]
    const actual = proposedPackageContent.packages[index]
    invariant(actual.lockPath === expected.lockPath, `provider CLI package-content active lockPath drifted at row ${index}`)
    invariant(
      JSON.stringify(actual.platforms) === JSON.stringify(expected.platforms),
      `provider CLI package-content platform binding drifted:${expected.lockPath}`,
    )
  }
}

async function derivePackageContentRows(activePlan, networkOptions) {
  const packages = []
  for (const row of activePlan) {
    const tarballBytes = await downloadExactTarball(row, networkOptions)
    const derived = deriveLockedPackageContentFromTarball(tarballBytes, row)
    packages.push(Object.freeze({
      lockPath: derived.lockPath,
      platforms: [...row.platforms],
      treeSha256: derived.treeSha256,
      fileCount: derived.fileCount,
      totalBytes: derived.totalBytes,
    }))
  }
  return Object.freeze(packages)
}

function buildProposal({
  activePlan,
  authority,
  manifestFile,
  packages,
  sources,
}) {
  const proposedPackageContent = {
    protocol: PROVIDER_CLI_PACKAGE_CONTENT_CONTRACT.protocol,
    modePolicy: PROVIDER_CLI_PACKAGE_CONTENT_CONTRACT.modePolicy,
    packages,
  }
  assertPackageContentMatchesPlan(proposedPackageContent, activePlan)
  const proposedManifestBytes = canonicalJsonBytes(
    manifestWithProposedPackageContent(authority.manifest, proposedPackageContent),
  )
  const proposal = {
    $schema: PROPOSAL_SCHEMA_ID,
    schemaVersion: 1,
    kind: 'provider-cli-package-content-proposal',
    proposalOnly: true,
    authority: {
      manifestPath: AUTHORITY_MANIFEST_PATH,
      lockPath: AUTHORITY_LOCK_PATH,
      lockSha256: authority.lockDigest,
    },
    derivation: {
      protocol: PROVIDER_CLI_PACKAGE_CONTENT_CONTRACT.protocol,
      modePolicy: PROVIDER_CLI_PACKAGE_CONTENT_CONTRACT.modePolicy,
      digestDomain: PROVIDER_CLI_PACKAGE_CONTENT_CONTRACT.digestDomain,
      proposer: sourceBinding(PROPOSER_PATH, sources.proposer),
      parserSetup: sourceBinding(PARSER_SETUP_PATH, sources.parserSetup),
      proposalSchema: sourceBinding(PROPOSAL_SCHEMA_PATH, sources.proposalSchema),
    },
    manifestTransition: {
      inputManifestSha256: sha256(manifestFile.bytes),
      proposedManifestSha256: sha256(proposedManifestBytes),
    },
    activePackageCount: packages.length,
    proposedPackageContentSha256: sha256(canonicalJsonBytes(proposedPackageContent)),
    proposedPackageContent,
    reviewApplyHandoff: {
      status: 'independent-review-required',
      writesAuthority: false,
      directApplySupported: false,
      targetPath: AUTHORITY_MANIFEST_PATH,
      reviewInstruction: 'Verify the proposal schema, derivation source hashes, exact authority transition, active package plan and package-content digest before approving any authority edit.',
      applyInstruction: 'After independent review, replace only the canonical manifest packageContent in a protected DS PR, then use the canonical governance graph to regenerate and check projections.',
    },
  }
  validateProposalAgainstSchema(proposal, sources.proposalSchema.bytes)
  return Object.freeze(proposal)
}

export async function proposeProviderCliPackageContent({
  fetchImpl = globalThis.fetch,
  maxCompressedBytes = PROVIDER_CLI_PACKAGE_CONTENT_CONTRACT.maxCompressedBytes,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  rootPath = ROOT,
} = {}) {
  const networkOptions = { fetchImpl, maxCompressedBytes, requestTimeoutMs }
  validateNetworkOptions(networkOptions)
  const sources = readDerivationSources()
  const snapshot = readAuthoritySnapshot(rootPath)
  const packages = await derivePackageContentRows(snapshot.activePlan, networkOptions)
  const proposal = buildProposal({
    activePlan: snapshot.activePlan,
    authority: snapshot.authority,
    manifestFile: snapshot.manifestFile,
    packages,
    sources,
  })
  assertFileUnchanged(snapshot.manifestFile, 'provider CLI authority manifest')
  assertFileUnchanged(snapshot.lockFile, 'provider CLI exact package-lock')
  assertFileUnchanged(sources.proposer, 'provider CLI package-content proposer source')
  assertFileUnchanged(sources.parserSetup, 'provider CLI package-content parser/setup source')
  assertFileUnchanged(sources.proposalSchema, 'provider CLI package-content proposal schema source')
  return proposal
}

export async function verifyProviderCliPackageContentProposal({
  fetchImpl = globalThis.fetch,
  maxCompressedBytes = PROVIDER_CLI_PACKAGE_CONTENT_CONTRACT.maxCompressedBytes,
  proposalPath,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  rootPath = ROOT,
} = {}) {
  const networkOptions = { fetchImpl, maxCompressedBytes, requestTimeoutMs }
  validateNetworkOptions(networkOptions)
  invariant(typeof proposalPath === 'string' && proposalPath.length > 0, 'proposal verification requires one proposal path')
  const proposalFile = readStableExactFile(proposalPath, 'provider CLI package-content proposal')
  const proposal = parseJson(proposalFile.bytes, 'provider CLI package-content proposal')
  invariant(
    proposalFile.bytes.equals(canonicalJsonBytes(proposal)),
    'provider CLI package-content proposal must use exact canonical 2-space-plus-newline JSON bytes',
  )
  const sources = readDerivationSources()
  validateProposalAgainstSchema(proposal, sources.proposalSchema.bytes)

  invariant(
    proposal.derivation.protocol === PROVIDER_CLI_PACKAGE_CONTENT_CONTRACT.protocol
      && proposal.derivation.modePolicy === PROVIDER_CLI_PACKAGE_CONTENT_CONTRACT.modePolicy
      && proposal.derivation.digestDomain === PROVIDER_CLI_PACKAGE_CONTENT_CONTRACT.digestDomain,
    'provider CLI package-content derivation contract differs from the current parser/setup authority',
  )
  for (const [key, path] of [
    ['proposer', PROPOSER_PATH],
    ['parserSetup', PARSER_SETUP_PATH],
    ['proposalSchema', PROPOSAL_SCHEMA_PATH],
  ]) {
    invariant(proposal.derivation[key].path === path, `provider CLI proposal ${key} source path drifted`)
    invariant(
      proposal.derivation[key].sha256 === sha256(sources[key].bytes),
      `provider CLI proposal ${key} source digest differs from the current direct source`,
    )
  }

  const snapshot = readAuthoritySnapshot(rootPath)
  invariant(proposal.authority.manifestPath === AUTHORITY_MANIFEST_PATH, 'provider CLI proposal manifest path drifted')
  invariant(proposal.authority.lockPath === AUTHORITY_LOCK_PATH, 'provider CLI proposal package-lock path drifted')
  invariant(
    proposal.authority.lockSha256 === snapshot.authority.lockDigest,
    'provider CLI proposal package-lock digest differs from the exact current authority bytes',
  )
  assertPackageContentMatchesPlan(proposal.proposedPackageContent, snapshot.activePlan)
  invariant(
    proposal.proposedPackageContentSha256 === sha256(canonicalJsonBytes(proposal.proposedPackageContent)),
    'provider CLI proposal package-content digest is invalid',
  )

  const currentManifestSha256 = sha256(snapshot.manifestFile.bytes)
  const { inputManifestSha256, proposedManifestSha256 } = proposal.manifestTransition
  invariant(
    currentManifestSha256 === inputManifestSha256 || currentManifestSha256 === proposedManifestSha256,
    'current provider CLI authority manifest is neither the bound input nor the reviewed proposed state',
  )
  const expectedProposedManifestBytes = canonicalJsonBytes(
    manifestWithProposedPackageContent(snapshot.authority.manifest, proposal.proposedPackageContent),
  )
  invariant(
    sha256(expectedProposedManifestBytes) === proposedManifestSha256,
    'provider CLI proposal proposed-manifest digest does not match canonical 2-space-plus-newline replacement bytes',
  )
  const authorityState = currentManifestSha256 === proposedManifestSha256 ? 'proposed' : 'input'
  if (authorityState === 'proposed') {
    invariant(
      snapshot.manifestFile.bytes.equals(expectedProposedManifestBytes),
      'current provider CLI authority does not equal the exact reviewed proposed bytes',
    )
    invariant(
      JSON.stringify(snapshot.authority.manifest.packageContent) === JSON.stringify(proposal.proposedPackageContent),
      'current provider CLI authority packageContent differs from the reviewed proposal',
    )
  }

  const independentlyDerivedRows = await derivePackageContentRows(snapshot.activePlan, networkOptions)
  invariant(
    canonicalJsonBytes(independentlyDerivedRows).equals(
      canonicalJsonBytes(proposal.proposedPackageContent.packages),
    ),
    'provider CLI proposal rows differ from independently rederived exact-lock tarball content',
  )

  assertFileUnchanged(proposalFile, 'provider CLI package-content proposal')
  assertFileUnchanged(snapshot.manifestFile, 'provider CLI authority manifest')
  assertFileUnchanged(snapshot.lockFile, 'provider CLI exact package-lock')
  assertFileUnchanged(sources.proposer, 'provider CLI package-content proposer source')
  assertFileUnchanged(sources.parserSetup, 'provider CLI package-content parser/setup source')
  assertFileUnchanged(sources.proposalSchema, 'provider CLI package-content proposal schema source')

  return Object.freeze({
    ok: true,
    mode: 'read-only-proposal-verification',
    authorityState,
    proposalPath: proposalFile.absolute,
    proposalSha256: sha256(proposalFile.bytes),
    activePackageCount: snapshot.activePlan.length,
    proposedPackageContentSha256: proposal.proposedPackageContentSha256,
    inputManifestSha256,
    proposedManifestSha256,
    independentlyRederivedPackageCount: independentlyDerivedRows.length,
    exactArtifactsRefetched: true,
    writesAuthority: false,
  })
}

function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

function printUsage() {
  console.error('Usage: node scripts/propose-provider-cli-package-content.mjs [--verify-proposal <path>]')
  console.error('This command is proposal-only; it has no apply mode and never writes authority.')
}

if (isMain()) {
  const args = process.argv.slice(2)
  try {
    if (args.length === 0) {
      const proposal = await proposeProviderCliPackageContent()
      process.stdout.write(`${JSON.stringify(proposal, null, 2)}\n`)
    } else if (args.length === 2 && args[0] === '--verify-proposal' && args[1].length > 0) {
      const verification = await verifyProviderCliPackageContentProposal({ proposalPath: args[1] })
      process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`)
    } else {
      printUsage()
      process.exitCode = 2
    }
  } catch (error) {
    const message = String(error?.message || error)
    console.error(message.startsWith(`${ERROR_PREFIX}:`) ? message : `${ERROR_PREFIX}:${message}`)
    process.exitCode = 1
  }
}

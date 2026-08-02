#!/usr/bin/env node
// Read-only final certification after npm platform confirmation and interactive channel promotion.

import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertTokenlessNpmEnvironment,
  inspectDigestBoundEvidenceFile,
  loadReleaseContext,
  readAndPlanChannel,
  readTagVersions,
  sha256File,
  validateRegistryPackage,
  validateStageReceipt,
  verifyRegistrySignatures,
  writeAtomicJson,
  FINALIZER_WORKFLOW_EVENT,
  FINALIZER_WORKFLOW_PATH,
} from './release-npm-lib.mjs'
import {
  assertVerifiedReleaseTag,
  requestGitHubJson,
  resolveRemoteTagIdentity,
} from './release-remote-tag.mjs'
import { validateStageRunIdentityDocument } from './release-stage-run-identity.mjs'
import {
  assertVerifiedExactNpmRuntimeCapability,
  prepareVerifiedExactNpmRuntime,
  resolveExactNpmRuntimeContract,
} from './lib/verified-exact-npm-runtime.mjs'

function parseArgs(argv) {
  const allowed = new Set([
    '--artifacts', '--bom', '--repository', '--tag', '--git-head', '--stage-receipt',
    '--stage-receipt-sha256', '--stage-run-identity', '--stage-run-id', '--stage-run-attempt',
    '--stage-artifact-digest', '--finalizer-run-id', '--finalizer-run-attempt',
    '--release-authorization-digest', '--release-trust-evidence-digest', '--release-trust-artifact-digest',
    '--release-trust-evidence-file', '--release-trust-evidence-file-sha256',
    '--tag-object', '--github-token-env', '--output',
  ])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(name) || !value || value.startsWith('--')) throw new Error(`invalid argument: ${name || '<missing>'}`)
    values[name] = value
  }
  for (const required of [
    '--artifacts', '--bom', '--repository', '--tag', '--git-head', '--stage-receipt',
    '--stage-receipt-sha256', '--stage-run-identity', '--stage-run-id', '--stage-run-attempt',
    '--stage-artifact-digest', '--finalizer-run-id', '--finalizer-run-attempt',
    '--release-authorization-digest', '--release-trust-evidence-digest', '--release-trust-artifact-digest',
    '--release-trust-evidence-file', '--release-trust-evidence-file-sha256',
    '--tag-object', '--github-token-env', '--output',
  ]) {
    if (!values[required]) throw new Error(`${required} is required`)
  }
  for (const name of [
    '--stage-receipt-sha256', '--stage-artifact-digest', '--release-authorization-digest',
    '--release-trust-evidence-digest', '--release-trust-evidence-file-sha256', '--release-trust-artifact-digest',
  ]) {
    if (!/^[0-9a-f]{64}$/.test(values[name])) throw new Error(`${name} must be a lowercase SHA-256`)
  }
  for (const name of ['--stage-run-id', '--stage-run-attempt', '--finalizer-run-id', '--finalizer-run-attempt']) {
    if (!/^[1-9][0-9]*$/.test(values[name])) throw new Error(`${name} must be a positive integer`)
  }
  return values
}

async function recheckRemoteTag(identity, expectedTagObject, token) {
  const actual = await resolveRemoteTagIdentity({
    repository: identity.repository,
    tag: identity.tag,
    requestJson: (path) => requestGitHubJson({ token, path }),
  })
  assertVerifiedReleaseTag({ identity: actual, expectedCommit: identity.gitHead, expectedTagObject })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  assertTokenlessNpmEnvironment(process.env)
  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const expectedNpmRuntime = resolveExactNpmRuntimeContract(repositoryRoot)
  const npmRuntime = await prepareVerifiedExactNpmRuntime({
    repositoryRoot,
  })
  assertVerifiedExactNpmRuntimeCapability(npmRuntime, expectedNpmRuntime)
  const npmCli = npmRuntime.cli
  try {
    const npmVersion = execFileSync(npmCli, ['--version'], { encoding: 'utf8' }).trim()
    if (npmVersion !== '11.19.0' || npmRuntime.toolchain?.npm !== npmVersion) {
      throw new Error(`lock-bound npm 11.19.0 is required for final certification; found ${npmVersion}`)
    }
  const context = loadReleaseContext({
    artifacts: resolve(args['--artifacts']),
    bomPath: resolve(args['--bom']),
    repository: args['--repository'],
    tag: args['--tag'],
    gitHead: args['--git-head'],
  })
  inspectDigestBoundEvidenceFile(args['--release-trust-evidence-file'], {
    expectedSha256: args['--release-trust-evidence-file-sha256'],
    expectedName: 'release-trust-preflight.json',
    label: 'retained release trust evidence',
  })
  const stageRunIdentityPath = resolve(args['--stage-run-identity'])
  const stageRunIdentityStats = lstatSync(stageRunIdentityPath)
  if (!stageRunIdentityStats.isFile() || stageRunIdentityStats.isSymbolicLink() || realpathSync(stageRunIdentityPath) !== stageRunIdentityPath) {
    throw new Error('stage run identity must be a regular file (no symlink)')
  }
  const stageRunExpected = {
    repository: context.identity.repository,
    tag: context.identity.tag,
    gitHead: context.identity.gitHead,
    runId: args['--stage-run-id'],
    runAttempt: args['--stage-run-attempt'],
    artifactDigest: args['--stage-artifact-digest'],
    releaseTrustArtifactDigest: args['--release-trust-artifact-digest'],
  }
  const stageRunIdentity = validateStageRunIdentityDocument(
    JSON.parse(readFileSync(stageRunIdentityPath, 'utf8')),
    stageRunExpected,
  )
  const stageReceiptPath = resolve(args['--stage-receipt'])
  const stats = lstatSync(stageReceiptPath)
  if (!stats.isFile() || stats.isSymbolicLink() || realpathSync(stageReceiptPath) !== stageReceiptPath) {
    throw new Error('stage receipt must be a regular file (no symlink)')
  }
  if (sha256File(stageReceiptPath) !== args['--stage-receipt-sha256']) {
    throw new Error('stage receipt differs from the digest retained by the original staging run')
  }
  const releaseTrustExpected = {
    authorizationDigest: args['--release-authorization-digest'],
    evidenceSha256: args['--release-trust-evidence-digest'],
    evidenceFileSha256: args['--release-trust-evidence-file-sha256'],
    tagObject: args['--tag-object'],
    artifactDigest: args['--release-trust-artifact-digest'],
    runId: args['--stage-run-id'],
    runAttempt: args['--stage-run-attempt'],
    headSha: context.identity.gitHead,
  }
  const stageReceipt = validateStageReceipt(
    JSON.parse(readFileSync(stageReceiptPath, 'utf8')),
    context,
    { requireComplete: true, releaseTrustExpected },
  )
  if (stageReceipt.releaseTrust.artifact.name !== stageRunIdentity.releaseTrustArtifact.name
    || stageReceipt.releaseTrust.artifact.digest !== stageRunIdentity.releaseTrustArtifact.digest
    || stageReceipt.releaseTrust.artifact.workflow.path !== stageRunIdentity.workflow.path
    || stageReceipt.releaseTrust.artifact.workflow.event !== stageRunIdentity.workflow.event
    || stageReceipt.releaseTrust.artifact.workflow.headBranch !== stageRunIdentity.workflow.headBranch
    || stageReceipt.releaseTrust.artifact.workflow.headSha !== stageRunIdentity.workflow.headSha
    || stageReceipt.releaseTrust.artifact.workflow.runId !== stageRunIdentity.workflow.runId
    || stageReceipt.releaseTrust.artifact.workflow.runAttempt !== stageRunIdentity.workflow.runAttempt) {
    throw new Error('stage receipt release trust artifact does not belong to the original successful workflow run')
  }
  const githubToken = process.env[args['--github-token-env']]
  if (!githubToken) throw new Error(`GitHub token environment variable is empty: ${args['--github-token-env']}`)
  await recheckRemoteTag(context.identity, args['--tag-object'], githubToken)
  for (const item of context.ordered) await validateRegistryPackage(npmCli, item, context.identity)
  const isolatedTags = readTagVersions(npmCli, context.ordered, context.stagingTag)
  for (const item of context.ordered) {
    if (isolatedTags[item.name] !== context.targetVersion) {
      throw new Error(`${item.name}: isolated tag ${context.stagingTag} is not ${context.targetVersion}`)
    }
  }
  const targetChannel = readAndPlanChannel(npmCli, context.ordered, context.targetVersion, context.targetTag)
  if (targetChannel.status !== 'complete') {
    throw new Error(`${context.targetTag} promotion is incomplete or split; GitHub Release publication is forbidden`)
  }
  verifyRegistrySignatures(npmCli, context.ordered)
  for (const item of context.ordered) await validateRegistryPackage(npmCli, item, context.identity)
  await recheckRemoteTag(context.identity, args['--tag-object'], githubToken)

  const finalization = {
    schemaVersion: 3,
    state: 'certified',
    source: { ...context.identity, gitTree: context.bom.source.gitTree },
    releaseTrust: stageReceipt.releaseTrust,
    releaseSetSha256: context.releaseSet.sha256,
    bomSha256: sha256File(context.bomPath),
    stageReceiptSha256: args['--stage-receipt-sha256'],
    stageRun: stageRunIdentity,
    finalizerRun: {
      workflow: FINALIZER_WORKFLOW_PATH,
      event: FINALIZER_WORKFLOW_EVENT,
      runId: args['--finalizer-run-id'],
      runAttempt: Number(args['--finalizer-run-attempt']),
    },
    stagingTag: context.stagingTag,
    targetTag: context.targetTag,
    targetVersion: context.targetVersion,
    publishOrder: context.bom.publishOrder,
    stageIds: Object.fromEntries(stageReceipt.packages.map((item) => [item.name, item.stageId])),
    isolatedTags,
    targetTags: targetChannel.baselineVersions,
    packages: context.ordered.map((item) => ({
      name: item.name,
      version: item.version,
      integrity: item.integrity,
      shasum: item.shasum,
    })),
    certifiedAt: new Date().toISOString(),
  }
  writeAtomicJson(args['--output'], finalization)
  console.log(`✅ final npm read-back certified for ${context.identity.tag}; immutable GitHub Release may proceed`)
  } finally {
    npmRuntime.cleanup?.()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  })
}

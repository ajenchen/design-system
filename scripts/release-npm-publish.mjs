#!/usr/bin/env node
// Stage the exact release train through npm's native stage-only trusted publisher.

import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareVerifiedExactNpmRuntime } from './lib/verified-exact-npm-runtime.mjs'
import {
  assertExpectedChannelProgress,
  assertTokenlessNpmEnvironment,
  classifyNpmViewResult,
  compareReleaseVersions,
  createStageReceipt,
  decideNpmStageAction,
  loadReleaseContext,
  minimumStagedNpmVersion,
  npmRegistry,
  npmResult,
  npmView,
  planReleaseChannelPromotion,
  readAndPlanChannel,
  stagingTagForVersion,
  validateProvenanceStatement,
  validateStagePublishJson,
  validateStageReceipt,
  writeAtomicJson,
} from './release-npm-lib.mjs'
import {
  assertVerifiedReleaseTag,
  requestGitHubJson,
  resolveRemoteTagIdentity,
} from './release-remote-tag.mjs'

export {
  assertExpectedChannelProgress,
  assertTokenlessNpmEnvironment,
  classifyNpmViewResult,
  compareReleaseVersions,
  decideNpmStageAction,
  planReleaseChannelPromotion,
  stagingTagForVersion,
  validateProvenanceStatement,
  validateStagePublishJson,
  validateStageReceipt,
}

function parseArgs(argv) {
  const allowed = new Set([
    '--artifacts', '--bom', '--repository', '--tag', '--git-head', '--tag-object', '--github-token-env', '--receipt',
    '--authorization-digest', '--release-trust-evidence-digest', '--release-trust-evidence-file-sha256',
    '--trust-artifact-name', '--trust-artifact-digest',
    '--trust-run-id', '--trust-run-attempt',
  ])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(name) || !value || value.startsWith('--')) throw new Error(`invalid argument: ${name || '<missing>'}`)
    values[name] = value
  }
  for (const required of [
    '--artifacts', '--bom', '--repository', '--tag', '--git-head', '--tag-object', '--github-token-env', '--receipt',
    '--authorization-digest', '--release-trust-evidence-digest', '--release-trust-evidence-file-sha256',
    '--trust-artifact-name', '--trust-artifact-digest',
    '--trust-run-id', '--trust-run-attempt',
  ]) {
    if (!values[required]) throw new Error(`${required} is required`)
  }
  for (const name of [
    '--authorization-digest', '--release-trust-evidence-digest', '--release-trust-evidence-file-sha256',
    '--trust-artifact-digest',
  ]) {
    if (!/^[a-f0-9]{64}$/.test(values[name])) throw new Error(`${name} must be a lowercase SHA-256`)
  }
  for (const name of ['--trust-run-id', '--trust-run-attempt']) {
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

function readReceipt(path, context, releaseTrustExpected) {
  const absolute = resolve(path)
  if (!existsSync(absolute)) return null
  const stats = lstatSync(absolute)
  if (!stats.isFile() || stats.isSymbolicLink() || realpathSync(absolute) !== absolute) {
    throw new Error(`stage receipt must be a regular file (no symlink): ${absolute}`)
  }
  return validateStageReceipt(JSON.parse(readFileSync(absolute, 'utf8')), context, { releaseTrustExpected })
}

function assertNativeStageRuntime(npmCli) {
  const version = execFileSync(npmCli, ['--version'], { encoding: 'utf8' }).trim()
  if (version !== '11.18.0' || compareReleaseVersions(version, minimumStagedNpmVersion) < 0) {
    throw new Error(`lock-bound npm 11.18.0 is required for native staged publishing; found ${version}`)
  }
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
    throw new Error('stage-only OIDC publishing is restricted to a GitHub-hosted Actions runner')
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  assertTokenlessNpmEnvironment(process.env)
  const npmRuntime = await prepareVerifiedExactNpmRuntime({ repositoryRoot: resolve(dirname(fileURLToPath(import.meta.url)), '..') })
  const npmCli = npmRuntime.cli
  try {
    assertNativeStageRuntime(npmCli)
  const context = loadReleaseContext({
    artifacts: resolve(args['--artifacts']),
    bomPath: resolve(args['--bom']),
    repository: args['--repository'],
    tag: args['--tag'],
    gitHead: args['--git-head'],
  })
  const githubToken = process.env[args['--github-token-env']]
  if (!githubToken) throw new Error(`GitHub token environment variable is empty: ${args['--github-token-env']}`)
  const receiptPath = resolve(args['--receipt'])
  const releaseTrustExpected = {
    authorizationDigest: args['--authorization-digest'],
    evidenceSha256: args['--release-trust-evidence-digest'],
    evidenceFileSha256: args['--release-trust-evidence-file-sha256'],
    tagObject: args['--tag-object'],
    artifactName: args['--trust-artifact-name'],
    artifactDigest: args['--trust-artifact-digest'],
    runId: args['--trust-run-id'],
    runAttempt: args['--trust-run-attempt'],
    headSha: context.identity.gitHead,
  }
  const releaseTrust = {
    authorizationDigest: releaseTrustExpected.authorizationDigest,
    evidenceSha256: releaseTrustExpected.evidenceSha256,
    evidenceFileSha256: releaseTrustExpected.evidenceFileSha256,
    tagObject: releaseTrustExpected.tagObject,
    artifact: {
      name: releaseTrustExpected.artifactName,
      digest: `sha256:${releaseTrustExpected.artifactDigest}`,
      workflow: {
        path: '.github/workflows/release.yml',
        event: 'repository_dispatch',
        headBranch: 'main',
        headSha: context.identity.gitHead,
        runId: String(releaseTrustExpected.runId),
        runAttempt: Number(releaseTrustExpected.runAttempt),
      },
    },
  }
  let receipt = readReceipt(receiptPath, context, releaseTrustExpected) || createStageReceipt(context, releaseTrust)
  writeAtomicJson(receiptPath, receipt)

  await recheckRemoteTag(context.identity, args['--tag-object'], githubToken)

  // Validate every package before the first irreversible stage request. Native staging cannot
  // create a brand-new package, so a missing bootstrap must stop the entire train up front.
  for (const item of context.ordered) {
    const receiptItem = receipt.packages.find((candidate) => candidate.name === item.name)
    if (receiptItem.status === 'staged') continue
    if (receiptItem.status !== 'planned') {
      throw new Error(
        `${item.name}: receipt is ${receiptItem.status}; do not retry blindly after an ambiguous request. `
        + 'Recover it interactively with release-npm-stage-recover.mjs.',
      )
    }
    const versionState = npmView(npmCli, `${item.name}@${item.version}`, 'dist')
    const packageState = npmView(npmCli, item.name, 'name')
    decideNpmStageAction({ name: item.name, version: item.version, versionState, packageState })
  }

  for (const item of context.ordered) {
    const receiptItem = receipt.packages.find((candidate) => candidate.name === item.name)
    if (receiptItem.status === 'staged') continue
    receiptItem.status = 'submitting'
    receiptItem.attemptedAt = new Date().toISOString()
    receipt.state = 'staging'
    writeAtomicJson(receiptPath, receipt)
    await recheckRemoteTag(context.identity, args['--tag-object'], githubToken)

    const archive = resolve(context.releaseSet.artifacts, item.file)
    const staged = npmResult(npmCli, [
      'stage', 'publish', archive,
      '--access', 'public',
      '--tag', context.stagingTag,
      '--provenance',
      '--ignore-scripts',
      '--json',
      `--registry=${npmRegistry}`,
    ])
    if (staged.status !== 0) {
      receiptItem.status = 'ambiguous'
      receiptItem.failure = (staged.stderr || staged.stdout || '').trim().slice(0, 2000)
      receipt.state = 'recovery-required'
      writeAtomicJson(receiptPath, receipt)
      throw new Error(
        `npm stage publish returned exit ${staged.status ?? 'unknown'} for ${item.name}@${item.version}. `
        + 'The registry may have accepted the request before the client failed; the durable receipt is marked ambiguous. '
        + 'Do not retry until an interactive maintainer lists/views the staged version and repairs the receipt.',
      )
    }

    let parsed
    try {
      parsed = JSON.parse(staged.stdout)
    } catch {
      receiptItem.status = 'ambiguous'
      receiptItem.failure = `successful command returned invalid JSON: ${(staged.stdout || '').trim().slice(0, 1200)}`
      receipt.state = 'recovery-required'
      writeAtomicJson(receiptPath, receipt)
      throw new Error(`${item.name}: stage request succeeded but the stageId response was not parseable; interactive recovery is required`)
    }
    const evidence = validateStagePublishJson(parsed, item)
    receiptItem.stageId = evidence.stageId
    receiptItem.status = 'staged'
    receiptItem.stagedAt = new Date().toISOString()
    delete receiptItem.failure
    writeAtomicJson(receiptPath, receipt)
    await recheckRemoteTag(context.identity, args['--tag-object'], githubToken)
    console.log(`✅ staged ${item.name}@${item.version} as ${evidence.stageId}`)
  }

  receipt.state = 'awaiting-platform-confirmation'
  receipt.awaitingPlatformConfirmationAt = new Date().toISOString()
  validateStageReceipt(receipt, context, { requireComplete: true })
  writeAtomicJson(receiptPath, receipt)
  await recheckRemoteTag(context.identity, args['--tag-object'], githubToken)
  console.log(`✅ all three packages are staged under immutable tag ${context.stagingTag}`)
  console.log('⏸️  npm now requires an account-holder platform action: inspect each stageId and complete npm 2FA confirmation')
  console.log(`   durable receipt: ${receiptPath}`)
  } finally {
    npmRuntime.cleanup()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  })
}

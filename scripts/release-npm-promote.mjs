#!/usr/bin/env node
// Provider-neutral promotion of an engineering-authorized native-stage train to beta/latest.
// A real TTY is retained only for npm's platform-enforced proof-of-presence/2FA;
// engineering authorization comes from the signed, exact release train.

import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertExpectedChannelProgress,
  assertInteractivePromotionEnvironment,
  loadReleaseContext,
  npmRegistry,
  npmResult,
  npmView,
  readAndPlanChannel,
  readTagVersions,
  sha256File,
  validateRegistryPackage,
  validateStageReceipt,
  verifyRegistrySignatures,
  writeAtomicJson,
} from './release-npm-lib.mjs'
import {
  assertVerifiedReleaseTag,
  requestGitHubJson,
  resolveRemoteTagIdentity,
} from './release-remote-tag.mjs'

function parseArgs(argv) {
  const allowed = new Set([
    '--artifacts', '--bom', '--repository', '--tag', '--git-head', '--tag-object', '--github-token-env',
    '--receipt', '--receipt-sha256', '--output', '--npm',
  ])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(name) || !value || value.startsWith('--')) throw new Error(`invalid argument: ${name || '<missing>'}`)
    values[name] = value
  }
  for (const required of [
    '--artifacts', '--bom', '--repository', '--tag', '--git-head', '--tag-object', '--github-token-env',
    '--receipt', '--receipt-sha256', '--output',
  ]) {
    if (!values[required]) throw new Error(`${required} is required`)
  }
  if (!/^[0-9a-f]{64}$/.test(values['--receipt-sha256'])) throw new Error('--receipt-sha256 must be a lowercase SHA-256')
  return values
}

async function assertRemoteTag(context, expectedTagObject, token) {
  const identity = await resolveRemoteTagIdentity({
    repository: context.identity.repository,
    tag: context.identity.tag,
    requestJson: path => requestGitHubJson({ token, path }),
  })
  assertVerifiedReleaseTag({ identity, expectedCommit: context.identity.gitHead, expectedTagObject })
}

function readRegularJson(path, label) {
  const absolute = resolve(path)
  const stats = lstatSync(absolute)
  if (!stats.isFile() || stats.isSymbolicLink() || realpathSync(absolute) !== absolute) {
    throw new Error(`${label} must be a regular file (no symlink)`)
  }
  return JSON.parse(readFileSync(absolute, 'utf8'))
}

async function verifyAuthorizedTrain(npmCli, context) {
  for (const item of context.ordered) await validateRegistryPackage(npmCli, item, context.identity)
  const isolated = readTagVersions(npmCli, context.ordered, context.stagingTag)
  for (const item of context.ordered) {
    if (isolated[item.name] !== item.version) {
      throw new Error(`${item.name}: isolated stage tag ${context.stagingTag} is ${isolated[item.name] || '<missing>'}, expected ${item.version}`)
    }
  }
  verifyRegistrySignatures(npmCli, context.ordered)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  assertInteractivePromotionEnvironment({
    environment: process.env,
    stdinIsTTY: process.stdin.isTTY,
    stdoutIsTTY: process.stdout.isTTY,
  })
  const context = loadReleaseContext({
    artifacts: resolve(args['--artifacts']),
    bomPath: resolve(args['--bom']),
    repository: args['--repository'],
    tag: args['--tag'],
    gitHead: args['--git-head'],
  })
  const receiptPath = resolve(args['--receipt'])
  if (sha256File(receiptPath) !== args['--receipt-sha256']) {
    throw new Error('stage receipt SHA-256 does not match the exact authorized plan digest')
  }
  const receipt = validateStageReceipt(readRegularJson(receiptPath, 'stage receipt'), context, { requireComplete: true })
  if (args['--tag-object'] !== receipt.releaseTrust.tagObject) {
    throw new Error('promotion tag object differs from the exact object bound by the stage receipt')
  }
  const npmCli = args['--npm'] || 'npm'
  const githubToken = process.env[args['--github-token-env']]
  if (!githubToken) throw new Error(`GitHub token environment variable is empty: ${args['--github-token-env']}`)
  await assertRemoteTag(context, receipt.releaseTrust.tagObject, githubToken)

  const whoami = npmResult(npmCli, ['whoami', `--registry=${npmRegistry}`])
  if (whoami.status !== 0) {
    throw new Error(`interactive npm session is not authenticated: ${(whoami.stderr || whoami.stdout || '').trim().slice(0, 1200)}`)
  }
  await verifyAuthorizedTrain(npmCli, context)
  const initialChannel = readAndPlanChannel(npmCli, context.ordered, context.targetVersion, context.targetTag)
  const plan = {
    schemaVersion: 1,
    state: initialChannel.status === 'complete' ? 'complete' : 'authorized-awaiting-platform-confirmation',
    source: { ...context.identity, gitTree: context.bom.source.gitTree },
    releaseSetSha256: context.releaseSet.sha256,
    bomSha256: sha256File(context.bomPath),
    stageReceiptSha256: args['--receipt-sha256'],
    stageIds: Object.fromEntries(receipt.packages.map((item) => [item.name, item.stageId])),
    targetVersion: context.targetVersion,
    targetTag: context.targetTag,
    stagingTag: context.stagingTag,
    publishOrder: context.bom.publishOrder,
    initialChannel,
    promotedCount: initialChannel.promotedCount,
    operator: whoami.stdout.trim(),
    createdAt: new Date().toISOString(),
  }
  writeAtomicJson(args['--output'], plan)

  if (initialChannel.status === 'complete') {
    await assertRemoteTag(context, receipt.releaseTrust.tagObject, githubToken)
    console.log(`✅ ${context.targetTag} already points to ${context.targetVersion} for the complete train; no mutation performed`)
    return
  }

  console.log(JSON.stringify({
    repository: context.identity.repository,
    tag: context.identity.tag,
    commit: context.identity.gitHead,
    releaseSetSha256: context.releaseSet.sha256,
    stageReceiptSha256: args['--receipt-sha256'],
    stagingTag: context.stagingTag,
    targetTag: context.targetTag,
    targetVersion: context.targetVersion,
    publishOrder: context.bom.publishOrder,
    currentTargetTags: initialChannel.baselineVersions,
  }, null, 2))
  let expectedChannel = initialChannel
  plan.state = 'promoting'
  writeAtomicJson(args['--output'], plan)
  for (let index = initialChannel.promotedCount; index < context.ordered.length; index += 1) {
    const item = context.ordered[index]
    assertExpectedChannelProgress(
      readAndPlanChannel(npmCli, context.ordered, context.targetVersion, context.targetTag),
      expectedChannel,
    )
    await validateRegistryPackage(npmCli, item, context.identity)
    const isolated = npmView(npmCli, `${item.name}@${context.stagingTag}`, 'version')
    if (isolated.kind !== 'found' || isolated.value !== item.version) {
      throw new Error(`${item.name}: isolated staging tag drifted immediately before target promotion`)
    }

    // Keep the trust read adjacent to the authority use. Registry validation
    // above may perform network I/O and must never widen the tag-race window.
    await assertRemoteTag(context, receipt.releaseTrust.tagObject, githubToken)
    const promoted = npmResult(npmCli, [
      'dist-tag', 'add', `${item.name}@${context.targetVersion}`, context.targetTag,
      `--registry=${npmRegistry}`,
    ], { stdio: 'inherit' })
    if (promoted.status !== 0) {
      plan.state = 'partial'
      plan.failure = `${item.name}: npm channel mutation exited ${promoted.status ?? 'unknown'}`
      writeAtomicJson(args['--output'], plan)
      throw new Error(`${plan.failure}; rerun only with this exact BOM/receipt to resume the publishOrder prefix`)
    }
    const readback = npmView(npmCli, `${item.name}@${context.targetTag}`, 'version')
    if (readback.kind !== 'found' || readback.value !== context.targetVersion) {
      plan.state = 'partial'
      plan.failure = `${item.name}: target tag read-back did not equal ${context.targetVersion}`
      writeAtomicJson(args['--output'], plan)
      throw new Error(`${plan.failure}; exact-plan recovery is required`)
    }
    expectedChannel = {
      status: index + 1 === context.ordered.length ? 'complete' : 'partial',
      baselineVersions: { ...expectedChannel.baselineVersions, [item.name]: context.targetVersion },
      promotedCount: index + 1,
    }
    plan.state = expectedChannel.status
    plan.promotedCount = expectedChannel.promotedCount
    plan.observedTargetTags = expectedChannel.baselineVersions
    delete plan.failure
    writeAtomicJson(args['--output'], plan)
    await assertRemoteTag(context, receipt.releaseTrust.tagObject, githubToken)
  }

  const finalChannel = readAndPlanChannel(npmCli, context.ordered, context.targetVersion, context.targetTag)
  if (finalChannel.status !== 'complete') throw new Error(`${context.targetTag} is not complete after promotion`)
  await verifyAuthorizedTrain(npmCli, context)
  await assertRemoteTag(context, receipt.releaseTrust.tagObject, githubToken)
  plan.state = 'complete'
  plan.promotedCount = context.ordered.length
  plan.observedTargetTags = finalChannel.baselineVersions
  plan.completedAt = new Date().toISOString()
  writeAtomicJson(args['--output'], plan)
  console.log(`✅ interactive promotion complete: all three ${context.targetTag} tags -> ${context.targetVersion}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  })
}

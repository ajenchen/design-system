#!/usr/bin/env node
// Engineering-authorized approval of a native-stage train with a fresh
// verified-tag check before each npm platform 2FA mutation.

import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertInteractivePromotionEnvironment,
  loadReleaseContext,
  npmRegistry,
  npmResult,
  npmView,
  parseJsonOutput,
  sha256File,
  validateStageReceipt,
  waitForPublishedPackage,
} from './release-npm-lib.mjs'
import {
  assertVerifiedReleaseTag,
  requestGitHubJson,
  resolveRemoteTagIdentity,
} from './release-remote-tag.mjs'

function parseArgs(argv) {
  const allowed = new Set([
    '--artifacts', '--bom', '--repository', '--tag', '--git-head', '--tag-object', '--github-token-env',
    '--receipt', '--receipt-sha256', '--npm',
  ])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(name) || !value || value.startsWith('--')) throw new Error(`invalid argument: ${name || '<missing>'}`)
    values[name] = value
  }
  for (const required of allowed) {
    if (required !== '--npm' && !values[required]) throw new Error(`${required} is required`)
  }
  if (!/^[0-9a-f]{64}$/.test(values['--receipt-sha256'])) throw new Error('--receipt-sha256 must be a lowercase SHA-256')
  return values
}

function readRegularJson(path, label) {
  const absolute = resolve(path)
  const stats = lstatSync(absolute)
  if (!stats.isFile() || stats.isSymbolicLink() || realpathSync(absolute) !== absolute) {
    throw new Error(`${label} must be a regular file (no symlink)`)
  }
  return JSON.parse(readFileSync(absolute, 'utf8'))
}

async function recheckRemoteTag(context, expectedTagObject, token) {
  const identity = await resolveRemoteTagIdentity({
    repository: context.identity.repository,
    tag: context.identity.tag,
    requestJson: path => requestGitHubJson({ token, path }),
  })
  assertVerifiedReleaseTag({ identity, expectedCommit: context.identity.gitHead, expectedTagObject })
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
    throw new Error('stage receipt SHA-256 does not match the retained staging-run digest')
  }
  const receipt = validateStageReceipt(readRegularJson(receiptPath, 'stage receipt'), context, { requireComplete: true })
  if (args['--tag-object'] !== receipt.releaseTrust.tagObject) {
    throw new Error('approval tag object differs from the exact object bound by the stage receipt')
  }
  const githubToken = process.env[args['--github-token-env']]
  if (!githubToken) throw new Error(`GitHub token environment variable is empty: ${args['--github-token-env']}`)
  const npmCli = args['--npm'] || 'npm'
  await recheckRemoteTag(context, receipt.releaseTrust.tagObject, githubToken)

  for (const item of context.ordered) {
    const receiptItem = receipt.packages.find(candidate => candidate.name === item.name)
    const publicState = npmView(npmCli, `${item.name}@${item.version}`, 'version')
    if (publicState.kind === 'found') {
      if (publicState.value !== item.version) throw new Error(`${item.name}: public version read-back is not exact`)
      await waitForPublishedPackage(npmCli, item, context.identity)
      continue
    }
    const viewed = parseJsonOutput(npmResult(npmCli, [
      'stage', 'view', receiptItem.stageId, '--json', `--registry=${npmRegistry}`,
    ]), `npm stage view ${receiptItem.stageId}`)
    if (viewed.id !== receiptItem.stageId
      || viewed.packageName !== item.name
      || viewed.version !== item.version
      || viewed.tag !== context.stagingTag
      || viewed.shasum !== item.shasum) {
      throw new Error(`${item.name}: staged registry record does not match the exact receipt/BOM`)
    }

    await recheckRemoteTag(context, receipt.releaseTrust.tagObject, githubToken)
    const approved = npmResult(npmCli, [
      'stage', 'approve', receiptItem.stageId, `--registry=${npmRegistry}`,
    ], { stdio: 'inherit' })
    if (approved.status !== 0) throw new Error(`${item.name}: npm stage approve exited ${approved.status ?? 'unknown'}`)
    await waitForPublishedPackage(npmCli, item, context.identity)
    await recheckRemoteTag(context, receipt.releaseTrust.tagObject, githubToken)
    console.log(`✅ approved and verified ${item.name}@${item.version} from ${receiptItem.stageId}`)
  }
  console.log(`✅ all native stages are approved under the unchanged verified tag object ${receipt.releaseTrust.tagObject}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  })
}

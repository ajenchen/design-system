#!/usr/bin/env node
// Repair an ambiguous native-stage receipt only after an authenticated maintainer views the stage.

import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertInteractivePromotionEnvironment,
  loadReleaseContext,
  npmRegistry,
  npmResult,
  parseJsonOutput,
  validateStageReceipt,
  writeAtomicJson,
} from './release-npm-lib.mjs'

function parseArgs(argv) {
  const allowed = new Set([
    '--artifacts', '--bom', '--repository', '--tag', '--git-head', '--receipt', '--package', '--stage-id', '--npm',
  ])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(name) || !value || value.startsWith('--')) throw new Error(`invalid argument: ${name || '<missing>'}`)
    values[name] = value
  }
  for (const required of [
    '--artifacts', '--bom', '--repository', '--tag', '--git-head', '--receipt', '--package', '--stage-id',
  ]) {
    if (!values[required]) throw new Error(`${required} is required`)
  }
  return values
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
  const stats = lstatSync(receiptPath)
  if (!stats.isFile() || stats.isSymbolicLink() || realpathSync(receiptPath) !== receiptPath) {
    throw new Error('stage receipt must be a regular file (no symlink)')
  }
  const receipt = validateStageReceipt(JSON.parse(readFileSync(receiptPath, 'utf8')), context)
  const item = context.ordered.find((candidate) => candidate.name === args['--package'])
  const receiptItem = receipt.packages.find((candidate) => candidate.name === args['--package'])
  if (!item || !receiptItem) throw new Error(`package is not in the exact publish plan: ${args['--package']}`)
  if (!['ambiguous', 'submitting'].includes(receiptItem.status)) {
    throw new Error(`${item.name}: recovery is allowed only from ambiguous/submitting, got ${receiptItem.status}`)
  }
  if (receipt.packages.some((candidate) => candidate.name !== item.name && candidate.stageId === args['--stage-id'])) {
    throw new Error('stageId is already assigned to a different package in this receipt')
  }

  const npmCli = args['--npm'] || 'npm'
  const viewed = parseJsonOutput(npmResult(npmCli, [
    'stage', 'view', args['--stage-id'], '--json', `--registry=${npmRegistry}`,
  ]), `npm stage view ${args['--stage-id']}`)
  if (viewed.id !== args['--stage-id']
    || viewed.packageName !== item.name
    || viewed.version !== item.version
    || viewed.tag !== context.stagingTag
    || viewed.shasum !== item.shasum) {
    throw new Error(`${item.name}: staged registry record does not match package/version/tag/SHA-1 in the exact BOM`)
  }

  receiptItem.stageId = viewed.id
  receiptItem.status = 'staged'
  receiptItem.recoveredAt = new Date().toISOString()
  delete receiptItem.failure
  if (receipt.packages.every((candidate) => candidate.status === 'staged')) {
    receipt.state = 'awaiting-platform-confirmation'
    receipt.awaitingPlatformConfirmationAt = new Date().toISOString()
    validateStageReceipt(receipt, context, { requireComplete: true })
  } else {
    receipt.state = 'staging'
  }
  writeAtomicJson(receiptPath, receipt)
  console.log(`✅ recovered exact stageId ${viewed.id} for ${item.name}@${item.version}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  })
}

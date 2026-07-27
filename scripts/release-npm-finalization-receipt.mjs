#!/usr/bin/env node
// Rebind a downloaded finalization receipt before repository write authority is used.

import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  inspectDigestBoundEvidenceFile,
  loadReleaseContext,
  sha256File,
  validateFinalizationReceipt,
} from './release-npm-lib.mjs'

const argv = process.argv.slice(2)
const allowed = new Set([
  '--artifacts', '--bom', '--repository', '--tag', '--git-head', '--tag-object', '--receipt', '--receipt-sha256', '--stage-receipt-sha256',
  '--stage-run-identity', '--stage-run-id', '--stage-run-attempt', '--stage-artifact-digest',
  '--release-authorization-digest', '--release-trust-evidence-digest', '--release-trust-evidence-file',
  '--release-trust-evidence-file-sha256', '--release-trust-artifact-digest',
  '--finalizer-run-id', '--finalizer-run-attempt',
])
const args = {}
for (let index = 0; index < argv.length; index += 2) {
  const name = argv[index]
  const value = argv[index + 1]
  if (!allowed.has(name) || !value || value.startsWith('--')) throw new Error(`invalid argument: ${name || '<missing>'}`)
  args[name] = value
}
for (const required of allowed) if (!args[required]) throw new Error(`${required} is required`)
for (const name of [
  '--receipt-sha256', '--stage-receipt-sha256', '--stage-artifact-digest', '--release-authorization-digest',
  '--release-trust-evidence-digest', '--release-trust-evidence-file-sha256', '--release-trust-artifact-digest',
]) {
  if (!/^[0-9a-f]{64}$/.test(args[name])) throw new Error(`${name} must be a lowercase SHA-256`)
}
for (const name of ['--stage-run-id', '--stage-run-attempt', '--finalizer-run-id', '--finalizer-run-attempt']) {
  if (!/^[1-9][0-9]*$/.test(args[name])) throw new Error(`${name} must be a positive integer`)
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
const receiptPath = resolve(args['--receipt'])
const stats = lstatSync(receiptPath)
if (!stats.isFile() || stats.isSymbolicLink() || realpathSync(receiptPath) !== receiptPath) {
  throw new Error('npm finalization receipt must be a regular file (no symlink)')
}
if (sha256File(receiptPath) !== args['--receipt-sha256']) {
  throw new Error('npm finalization receipt digest differs from the certifier output')
}
const stageRunIdentityPath = resolve(args['--stage-run-identity'])
const stageRunIdentityStats = lstatSync(stageRunIdentityPath)
if (!stageRunIdentityStats.isFile() || stageRunIdentityStats.isSymbolicLink() || realpathSync(stageRunIdentityPath) !== stageRunIdentityPath) {
  throw new Error('stage run identity must be a regular file (no symlink)')
}
const stageRunIdentity = JSON.parse(readFileSync(stageRunIdentityPath, 'utf8'))
validateFinalizationReceipt(JSON.parse(readFileSync(receiptPath, 'utf8')), context, {
  stageReceiptSha256: args['--stage-receipt-sha256'],
  stageRunIdentity,
  stageRunExpected: {
    repository: context.identity.repository,
    tag: context.identity.tag,
    gitHead: context.identity.gitHead,
    runId: args['--stage-run-id'],
    runAttempt: args['--stage-run-attempt'],
    artifactDigest: args['--stage-artifact-digest'],
    releaseTrustArtifactDigest: args['--release-trust-artifact-digest'],
  },
  releaseTrustExpected: {
    authorizationDigest: args['--release-authorization-digest'],
    evidenceSha256: args['--release-trust-evidence-digest'],
    evidenceFileSha256: args['--release-trust-evidence-file-sha256'],
    tagObject: args['--tag-object'],
    artifactDigest: args['--release-trust-artifact-digest'],
    runId: args['--stage-run-id'],
    runAttempt: args['--stage-run-attempt'],
    headSha: context.identity.gitHead,
  },
  finalizerRunId: args['--finalizer-run-id'],
  finalizerRunAttempt: args['--finalizer-run-attempt'],
})
console.log('✅ npm finalization receipt is rebound to the exact release set and stage plan')

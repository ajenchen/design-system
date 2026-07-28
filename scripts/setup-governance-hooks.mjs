#!/usr/bin/env node

import { realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertClosedGitLocalConfiguration,
  runClosedGit,
  validateCanonicalGovernanceHook,
} from './lib/closed-tool-execution.mjs'
import {
  assertGitVisibleWorktreeUnchanged,
  captureGitVisibleWorktree,
} from './lib/worktree-fingerprint.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const GOVERNANCE_HOOK_SETUP_COMMAND = 'node scripts/setup-governance-hooks.mjs'

function invariant(condition, message) {
  if (!condition) throw new Error(`GOV-HOOK-SETUP-001:${message}`)
}

export function setupGovernanceHooks({
  root: requestedRoot = ROOT,
  runner,
} = {}) {
  const root = realpathSync(resolve(requestedRoot))
  const hook = validateCanonicalGovernanceHook(root)
  const hookRoot = hook.hookRoot
  const run = runner === undefined
    ? (args => runClosedGit(args, { cwd: root, output: 'capture', maxOutputBytes: 4 * 1024 * 1024 }))
    : (args => runClosedGit(args, { cwd: root, output: 'capture', maxOutputBytes: 4 * 1024 * 1024, runner }))
  const execute = args => {
    const result = run(args)
    invariant(!result.error && result.signal === null && result.status === 0, `closed Git ${args[0]} failed`)
    return result.stdout.trim()
  }
  invariant(realpathSync(execute(['rev-parse', '--show-toplevel'])) === root, 'setup target is not the exact Git checkout root')
  assertClosedGitLocalConfiguration(root, {
    allowHookPathMigration: true,
    ...(runner === undefined ? {} : { runner }),
  })
  const before = captureGitVisibleWorktree(root, runner === undefined ? {} : { runner })
  // Write the repo-relative binding, never a machine-absolute path: an absolute value
  // breaks linked worktrees (which share this config), re-clones, and mount renames.
  execute(['config', '--local', '--replace-all', 'core.hooksPath', '.husky'])
  assertClosedGitLocalConfiguration(root, runner === undefined ? {} : { runner })
  const observed = execute(['config', '--local', '--no-includes', '--get-all', 'core.hooksPath']).split(/\r?\n/).filter(Boolean)
  invariant(observed.length === 1 && observed[0] === '.husky', 'canonical hook path readback failed')
  assertGitVisibleWorktreeUnchanged(root, before, {
    label: 'governance hook setup',
    ...(runner === undefined ? {} : { runner }),
  })
  return Object.freeze({
    schemaVersion: 1,
    kind: 'governance-hook-setup-result',
    root,
    hookRoot,
    hook: '.husky/pre-commit',
    configured: true,
  })
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    invariant(process.argv.length === 2, 'usage: setup-governance-hooks.mjs')
    const result = setupGovernanceHooks()
    console.log(`✅ canonical governance Git hook configured:${result.hookRoot}`)
  } catch (error) {
    console.error(`❌ governance hook setup failed:${error.message}`)
    process.exit(1)
  }
}

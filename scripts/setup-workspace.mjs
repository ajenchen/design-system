#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertGitVisibleWorktreeUnchanged,
  captureGitVisibleWorktree,
} from './lib/worktree-fingerprint.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SETUP_ALL_COMMAND = 'node scripts/setup-workspace.mjs'
const HOOK_SETUP_COMMAND = 'node scripts/setup-governance-hooks.mjs'
const ROLE_SETUPS = Object.freeze(new Map([
  ['node scripts/setup-authority-governance.mjs', Object.freeze({
    path: 'scripts/setup-authority-governance.mjs',
    hookSetup: true,
  })],
  ['node scripts/setup-governance.mjs', Object.freeze({
    path: 'scripts/setup-governance.mjs',
    hookSetup: false,
  })],
]))
export const WORKSPACE_SETUP_ASSURANCE = Object.freeze({
  scope: 'local-bootstrap',
  providerCertification: 'not-checked',
  externalActivationRequired: true,
})

function invariant(condition, message) {
  if (!condition) throw new Error(`GOV-WORKSPACE-SETUP-002:${message}`)
}

function regularFile(root, path) {
  const absolute = join(root, path)
  const info = lstatSync(absolute)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && realpathSync(absolute) === absolute, `setup file is unsafe:${path}`)
  return absolute
}

function run(command, args, { root, environment, runner, label }) {
  try {
    runner(command, args, {
      cwd: root,
      env: environment,
      shell: false,
      stdio: 'inherit',
      timeout: 6 * 60 * 60 * 1_000,
      windowsHide: true,
    })
  } catch (error) {
    throw new Error(`GOV-WORKSPACE-SETUP-002:${label} failed:${error.message}`)
  }
}

export function runWorkspaceSetup({
  root: requestedRoot = ROOT,
  environment = process.env,
  runner = execFileSync,
} = {}) {
  const root = realpathSync(resolve(requestedRoot))
  const manifest = JSON.parse(readFileSync(regularFile(root, 'package.json'), 'utf8'))
  invariant(manifest.scripts?.['setup:all'] === SETUP_ALL_COMMAND, 'package.json setup:all command drifted')
  const roleSetup = ROLE_SETUPS.get(manifest.scripts?.['setup:governance'])
  invariant(roleSetup, 'package.json has an unknown role-specific governance setup')
  const governance = regularFile(root, roleSetup.path)
  const providerCli = regularFile(root, 'scripts/setup-provider-cli-toolchain.mjs')
  const hookSetup = roleSetup.hookSetup
    ? regularFile(root, 'scripts/setup-governance-hooks.mjs')
    : null
  if (roleSetup.hookSetup) invariant(manifest.scripts?.['setup:hooks'] === HOOK_SETUP_COMMAND, 'package.json authority hook setup command drifted')
  const before = captureGitVisibleWorktree(root)

  if (hookSetup) {
    run(process.execPath, [hookSetup], { root, environment, runner, label: 'canonical Git hook setup' })
    assertGitVisibleWorktreeUnchanged(root, before, { label: 'setup:all Git hook phase' })
  }
  run(process.execPath, [governance], { root, environment, runner, label: 'role-specific governance setup' })
  assertGitVisibleWorktreeUnchanged(root, before, { label: 'setup:all governance phase' })
  run(process.execPath, [providerCli], { root, environment, runner, label: 'provider CLI setup' })
  assertGitVisibleWorktreeUnchanged(root, before, { label: 'setup:all provider CLI phase' })
  return {
    root,
    roleSetup: roleSetup.path,
    steps: [
      ...(hookSetup ? ['canonical-git-hook'] : []),
      'role-specific-governance',
      'provider-cli-toolchain',
    ],
    ...WORKSPACE_SETUP_ASSURANCE,
  }
}

export function formatWorkspaceSetupResult(result) {
  invariant(result?.scope === WORKSPACE_SETUP_ASSURANCE.scope, 'workspace setup result scope is invalid')
  invariant(
    result.providerCertification === WORKSPACE_SETUP_ASSURANCE.providerCertification,
    'workspace setup result provider certification is invalid',
  )
  invariant(
    result.externalActivationRequired === WORKSPACE_SETUP_ASSURANCE.externalActivationRequired,
    'workspace setup result external activation claim is invalid',
  )
  return [
    `✅ local workspace bootstrap verified:${result.root}`,
    `scope=${result.scope}`,
    `providerCertification=${result.providerCertification}`,
    `externalActivationRequired=${result.externalActivationRequired}`,
  ].join('\n')
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    invariant(process.argv.length === 2, 'usage: setup-workspace.mjs')
    const result = runWorkspaceSetup()
    console.log(formatWorkspaceSetupResult(result))
  } catch (error) {
    console.error(`❌ complete workspace setup failed:${error.message}`)
    process.exit(1)
  }
}

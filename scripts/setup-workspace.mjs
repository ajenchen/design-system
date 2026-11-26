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
  // Ordinary bootstrap is complete on its own. External activation/readback is the
  // opt-in high-assurance lane, never a precondition for ordinary setup or sync.
  externalActivationRequired: false,
})

function invariant(condition, message) {
  if (!condition) throw new Error(`GOV-WORKSPACE-SETUP-002:${message}`)
}

// 產品自有的內容欠債基準(2026-11-26,產品 canary 缺陷 2)。setup 跑的那支 checker 已用它判定過
// (基準內的不擋、新增的擋、已不存在的要求移除);這裡只把已登記的數量照實印出來,不宣稱內容合規。
export const CONTENT_DEBT_BASELINE_PATH = 'governance/content-debt-baseline.json'

export function readRecordedContentDebt(root) {
  const absolute = join(root, CONTENT_DEBT_BASELINE_PATH)
  let info
  try {
    info = lstatSync(absolute)
  } catch (error) {
    if (error?.code === 'ENOENT') return 0
    throw error
  }
  invariant(info.isFile() && !info.isSymbolicLink(), `${CONTENT_DEBT_BASELINE_PATH} must be one regular file`)
  let baseline
  try {
    baseline = JSON.parse(readFileSync(absolute, 'utf8'))
  } catch (error) {
    invariant(false, `${CONTENT_DEBT_BASELINE_PATH} is not valid JSON:${error.message}`)
  }
  invariant(Array.isArray(baseline?.entries), `${CONTENT_DEBT_BASELINE_PATH} has no entries array`)
  return baseline.entries.length
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
    recordedContentDebt: readRecordedContentDebt(root),
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
  invariant(
    Number.isSafeInteger(result.recordedContentDebt) && result.recordedContentDebt >= 0,
    'workspace setup result recorded content debt is invalid',
  )
  return [
    `✅ local workspace bootstrap verified:${result.root}`,
    `scope=${result.scope}`,
    `providerCertification=${result.providerCertification}`,
    `externalActivationRequired=${result.externalActivationRequired}`,
    // 已登記的既有內容欠債(governance/content-debt-baseline.json);登記 ≠ 內容合規。
    `recordedContentDebt=${result.recordedContentDebt}`,
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

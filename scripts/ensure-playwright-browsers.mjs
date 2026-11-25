#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { lstatSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveProvisionedPlaywrightRuntime } from '../infra/governance/lib/playwright-runtime.mjs'
import { verifiedNodeTrustArgs } from './lib/verified-exact-npm-runtime.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BLOCKED_PLAYWRIGHT_ENVIRONMENT = /^(?:PLAYWRIGHT_BROWSERS_PATH|PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT|PLAYWRIGHT_DOWNLOAD_HOST|PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST|PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD|PLAYWRIGHT_HOST_PLATFORM_OVERRIDE|NODE_OPTIONS|NODE_PATH|LD_PRELOAD|DYLD_.*)$/
const SMOKE_ENVIRONMENT = /^(?:HOME|USERPROFILE|LOCALAPPDATA|PATH|SystemRoot|SYSTEMROOT|WINDIR|TMPDIR|TMP|TEMP|LANG|LC_ALL)$/
const BROWSER_SMOKE_TIMEOUT_MS = 15_000

export function verifyPlaywrightBrowserReadback({
  root,
  runtime,
  environment = process.env,
  runner = spawnSync,
} = {}) {
  if (!runtime || typeof runtime !== 'object') throw new Error('Playwright setup blocked:resolved runtime is required for browser readback')
  if (!/^\d+(?:\.\d+){3}$/.test(runtime.browserVersion ?? '')) {
    throw new Error('Playwright setup blocked:resolved Chromium version is invalid')
  }
  const expectedVersion = new RegExp(`(?:^|[^0-9.])${runtime.browserVersion.replaceAll('.', '\\.')}([^0-9.]|$)`)
  const smokeEnvironment = Object.fromEntries(Object.entries(environment).filter(([name]) => SMOKE_ENVIRONMENT.test(name)))
  for (const [label, executablePath] of [
    ['Chromium', runtime.chromiumExecutablePath],
    ['Chromium headless-shell', runtime.headlessShellExecutablePath],
  ]) {
    if (typeof executablePath !== 'string' || executablePath.length === 0) {
      throw new Error(`Playwright setup blocked:${label} executable path is missing`)
    }
    const result = runner(executablePath, ['--version'], {
      cwd: root,
      env: smokeEnvironment,
      shell: false,
      encoding: 'utf8',
      timeout: BROWSER_SMOKE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
    if (result.error) {
      throw new Error(`Playwright setup blocked:${label} version readback failed:${result.error.message}`, { cause: result.error })
    }
    if (result.status !== 0) {
      throw new Error(`Playwright setup blocked:${label} version readback exited ${result.signal || result.status || 'without a status'}`)
    }
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    if (!expectedVersion.test(output)) {
      throw new Error(`Playwright setup blocked:${label} version readback does not match ${runtime.browserVersion}`)
    }
  }
  return runtime
}

export function ensurePlaywrightBrowsers({
  root: requestedRoot = ROOT,
  args = [],
  environment = process.env,
  runner = spawnSync,
  resolver = resolveProvisionedPlaywrightRuntime,
} = {}) {
  if (args.some((arg) => arg !== '--with-deps') || new Set(args).size !== args.length) {
    throw new Error('Usage: node scripts/ensure-playwright-browsers.mjs [--with-deps]')
  }
  const root = realpathSync(resolve(requestedRoot))
  const setupEnvironment = {
    ...Object.fromEntries(Object.entries(environment).filter(([name]) => !BLOCKED_PLAYWRIGHT_ENVIRONMENT.test(name))),
    PLAYWRIGHT_BROWSERS_PATH: '0',
  }
  const currentRuntime = () => resolver({ repoRoot: root, environment: setupEnvironment })
  // Provisioner semantics:this script's job is to CREATE the pinned runtime, so a
  // missing .local-browsers before the first install is work-to-do, not tampering.
  // The resolver (correctly) fails closed on the explicit PLAYWRIGHT_BROWSERS_PATH pin,
  // which deadlocked every fresh CI checkout — install could never run. Only this exact
  // "not provisioned yet" shape is tolerated; every other resolver error still throws,
  // and the post-install resolution + version readback below keep full strictness.
  let runtime
  try {
    runtime = currentRuntime()
  } catch (error) {
    if (!String(error?.message).includes('explicit browser runtime is invalid')) throw error
    runtime = null
  }
  if (!runtime || args.includes('--with-deps')) {
    const cli = join(root, 'node_modules', 'playwright', 'cli.js')
    const cliInfo = lstatSync(cli)
    if (!cliInfo.isFile() || cliInfo.isSymbolicLink() || cliInfo.nlink !== 1 || realpathSync(cli) !== cli) {
      throw new Error('Playwright setup blocked:installed lock-resolved CLI is not one regular no-link file')
    }
    // 瀏覽器下載與鎖定 npm 同一條 TLS 信任規則(內建 bundle + 主機系統憑證庫,不取自環境變數;2026-11-26 P0)。
    // Playwright CLI 以不帶 options 的 child_process.fork() 開下載子行程,execArgv 預設 = process.execArgv,旗標會傳下去
    //(依據與出處:scripts/lib/verified-exact-npm-runtime.mjs「TLS 信任錨」段;fork 呼叫形狀由 test-verified-exact-npm-runtime.mjs 守)。
    const installArgs = [...verifiedNodeTrustArgs(), cli, 'install', ...(args.includes('--with-deps') ? ['--with-deps'] : []), 'chromium']
    const result = runner(process.execPath, installArgs, {
      cwd: root,
      env: setupEnvironment,
      shell: false,
      stdio: 'inherit',
    })
    if (result.error) throw result.error
    if (result.status !== 0) {
      throw new Error(`Playwright setup failed:${result.signal || result.status || 'unknown error'}`)
    }
    runtime = currentRuntime()
  }

  if (!runtime) throw new Error('Playwright setup completed without an exact-revision browser readback')
  return verifyPlaywrightBrowserReadback({ root, runtime, environment: setupEnvironment, runner })
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const runtime = ensurePlaywrightBrowsers({ args: process.argv.slice(2) })
    console.log(`[setup:playwright] exact runtime ready: Playwright ${runtime.playwrightVersion}, Chromium ${runtime.browserVersion} (revision ${runtime.chromiumRevision})`)
  } catch (error) {
    console.error(error.message)
    process.exit(error.message.startsWith('Usage:') ? 2 : 1)
  }
}

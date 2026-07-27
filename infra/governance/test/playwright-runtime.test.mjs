import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { arch as hostArchitecture, cpus, tmpdir } from 'node:os'
import { dirname, join, resolve, win32 } from 'node:path'
import test from 'node:test'
import {
  playwrightBrowserCacheCandidate,
  resolveProvisionedPlaywrightRuntime,
} from '../lib/playwright-runtime.mjs'
import { ensurePlaywrightBrowsers, verifyPlaywrightBrowserReadback } from '../../../scripts/ensure-playwright-browsers.mjs'

const BROWSER_VERSION = '147.0.7727.15'

function effectiveArchitecture(platform = process.platform) {
  if (platform === 'win32') return 'x64'
  if (platform === 'darwin' && cpus().some(cpu => cpu.model.includes('Apple'))) return 'arm64'
  return hostArchitecture()
}

function executableRelativePaths(platform = process.platform, architecture = effectiveArchitecture(platform)) {
  const layouts = {
    darwin: {
      x64: {
        chromium: ['chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
        headlessShell: ['chrome-headless-shell-mac-x64', 'chrome-headless-shell'],
      },
      arm64: {
        chromium: ['chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
        headlessShell: ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell'],
      },
    },
    linux: {
      x64: { chromium: ['chrome-linux64', 'chrome'], headlessShell: ['chrome-headless-shell-linux64', 'chrome-headless-shell'] },
      arm64: { chromium: ['chrome-linux', 'chrome'], headlessShell: ['chrome-linux', 'headless_shell'] },
    },
    win32: {
      x64: { chromium: ['chrome-win64', 'chrome.exe'], headlessShell: ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'] },
    },
  }
  return layouts[platform][architecture]
}

function writeJson(path, value) {
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value)}\n`)
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'playwright-runtime-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeJson(join(root, 'package-lock.json'), {
    lockfileVersion: 3,
    packages: {
      'node_modules/playwright': { version: '1.59.1' },
      'node_modules/playwright-core': { version: '1.59.1' },
    },
  })
  writeJson(join(root, 'node_modules/playwright/package.json'), { version: '1.59.1' })
  writeJson(join(root, 'node_modules/playwright-core/package.json'), { version: '1.59.1' })
  writeJson(join(root, 'node_modules/playwright-core/browsers.json'), {
    browsers: [
      { name: 'chromium', revision: '1217', browserVersion: BROWSER_VERSION, installByDefault: true },
      { name: 'chromium-headless-shell', revision: '1217', browserVersion: BROWSER_VERSION, installByDefault: true },
    ],
  })
  return root
}

function provision(root, { platform = process.platform, architecture = effectiveArchitecture(platform) } = {}) {
  const layout = executableRelativePaths(platform, architecture)
  const paths = {}
  for (const name of ['chromium-1217', 'chromium_headless_shell-1217']) {
    const directory = join(root, name)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'INSTALLATION_COMPLETE'), '')
  }
  for (const [key, parts] of Object.entries(layout)) {
    const directory = key === 'chromium' ? 'chromium-1217' : 'chromium_headless_shell-1217'
    const executable = join(root, directory, ...parts)
    mkdirSync(dirname(executable), { recursive: true })
    writeFileSync(executable, `fixture ${key}\n`)
    chmodSync(executable, 0o755)
    paths[key] = executable
  }
  return paths
}

test('portable cache candidates honor platform defaults, XDG/LOCALAPPDATA and hermetic 0', () => {
  const repoRoot = '/workspace/repo'
  assert.equal(
    playwrightBrowserCacheCandidate({ repoRoot, platform: 'darwin', environment: { HOME: '/Users/test' } }).path,
    '/Users/test/Library/Caches/ms-playwright',
  )
  assert.equal(
    playwrightBrowserCacheCandidate({ repoRoot, platform: 'linux', environment: { HOME: '/home/test', XDG_CACHE_HOME: '/cache/test' } }).path,
    '/cache/test/ms-playwright',
  )
  assert.equal(
    playwrightBrowserCacheCandidate({ repoRoot, platform: 'win32', environment: { USERPROFILE: 'C:\\Users\\test', LOCALAPPDATA: 'D:\\Cache' } }).path,
    win32.join('D:\\Cache', 'ms-playwright'),
  )
  assert.deepEqual(
    playwrightBrowserCacheCandidate({ repoRoot, platform: 'linux', environment: { PLAYWRIGHT_BROWSERS_PATH: '0' } }),
    { explicit: true, path: '/workspace/repo/node_modules/playwright-core/.local-browsers', environmentValue: '0' },
  )
  assert.throws(
    () => playwrightBrowserCacheCandidate({ repoRoot, platform: 'linux', environment: { PLAYWRIGHT_BROWSERS_PATH: 'relative/cache' } }),
    /must be absolute or the literal 0/,
  )
})

test('resolver accepts only exact lock-matched Chromium and headless-shell markers', t => {
  const root = fixture(t)
  const cache = join(root, 'browser-cache')
  provision(cache)
  const runtime = resolveProvisionedPlaywrightRuntime({
    repoRoot: root,
    platform: process.platform,
    environment: { PLAYWRIGHT_BROWSERS_PATH: cache },
  })
  assert.equal(runtime.playwrightVersion, '1.59.1')
  assert.equal(runtime.playwrightCoreVersion, '1.59.1')
  assert.equal(runtime.chromiumRevision, '1217')
  assert.equal(runtime.headlessShellRevision, '1217')
  assert.equal(runtime.browserVersion, BROWSER_VERSION)
  assert.equal(runtime.platform, process.platform)
  assert.equal(runtime.architecture, effectiveArchitecture())
  assert.equal(runtime.chromiumExecutablePath, join(realpathSync(cache), 'chromium-1217', ...executableRelativePaths().chromium))
  assert.equal(runtime.headlessShellExecutablePath, join(realpathSync(cache), 'chromium_headless_shell-1217', ...executableRelativePaths().headlessShell))
  assert.equal(runtime.canonicalRoot, realpathSync(cache))
  assert.equal(runtime.environmentValue, realpathSync(cache))

  unlinkSync(join(cache, 'chromium_headless_shell-1217', 'INSTALLATION_COMPLETE'))
  assert.throws(
    () => resolveProvisionedPlaywrightRuntime({ repoRoot: root, environment: { PLAYWRIGHT_BROWSERS_PATH: cache } }),
    /browser marker is unsafe|ENOENT/,
  )
  assert.equal(resolveProvisionedPlaywrightRuntime({ repoRoot: root, environment: { HOME: join(root, 'missing-home') } }), null)
})

test('resolver rejects lock drift and redirected markers, and supports package-local browsers', t => {
  const root = fixture(t)
  const local = join(root, 'node_modules/playwright-core/.local-browsers')
  provision(local)
  const hermetic = resolveProvisionedPlaywrightRuntime({
    repoRoot: root,
    environment: { PLAYWRIGHT_BROWSERS_PATH: '0' },
  })
  assert.equal(hermetic.environmentValue, '0')
  assert.equal(hermetic.canonicalRoot, realpathSync(local))
  const preferredHermetic = resolveProvisionedPlaywrightRuntime({
    repoRoot: root,
    environment: { HOME: join(root, 'empty-home') },
  })
  assert.equal(preferredHermetic.environmentValue, '0')
  assert.equal(preferredHermetic.canonicalRoot, realpathSync(local))

  const marker = join(local, 'chromium-1217', 'INSTALLATION_COMPLETE')
  unlinkSync(marker)
  const target = join(root, 'marker-target')
  writeFileSync(target, '')
  symlinkSync(target, marker)
  assert.throws(
    () => resolveProvisionedPlaywrightRuntime({ repoRoot: root, environment: { PLAYWRIGHT_BROWSERS_PATH: '0' } }),
    /browser marker is unsafe/,
  )
  unlinkSync(marker)
  writeFileSync(marker, '')
  chmodSync(marker, 0o644)
  writeJson(join(root, 'node_modules/playwright/package.json'), { version: '1.59.0' })
  assert.throws(
    () => resolveProvisionedPlaywrightRuntime({ repoRoot: root, environment: { PLAYWRIGHT_BROWSERS_PATH: '0' } }),
    /differs from package-lock/,
  )
})

test('resolver rejects missing, symlink-escaped and non-executable browser payloads despite valid markers', t => {
  const root = fixture(t)
  const cache = join(root, 'browser-cache')
  const executables = provision(cache)
  const resolveExplicit = () => resolveProvisionedPlaywrightRuntime({
    repoRoot: root,
    environment: { PLAYWRIGHT_BROWSERS_PATH: cache },
  })

  unlinkSync(executables.headlessShell)
  assert.throws(resolveExplicit, /explicit browser runtime is invalid:.*ENOENT/)
  writeFileSync(executables.headlessShell, 'restored headless shell\n')
  chmodSync(executables.headlessShell, 0o755)

  unlinkSync(executables.chromium)
  const outside = join(root, 'outside-chromium')
  writeFileSync(outside, 'outside\n')
  chmodSync(outside, 0o755)
  symlinkSync(outside, executables.chromium)
  assert.throws(resolveExplicit, /Chromium executable must be one regular no-link file/)
  unlinkSync(executables.chromium)
  writeFileSync(executables.chromium, 'restored chromium\n')
  chmodSync(executables.chromium, 0o755)

  if (process.platform !== 'win32') {
    chmodSync(executables.headlessShell, 0o644)
    assert.throws(resolveExplicit, /Chromium headless-shell executable has no execute permission/)
  }
})

test('resolver binds cache payloads to the requested platform and rejects host-platform overrides', t => {
  const root = fixture(t)
  const cache = join(root, 'linux-x64-cache')
  provision(cache, { platform: 'linux', architecture: 'x64' })
  const linux = resolveProvisionedPlaywrightRuntime({
    repoRoot: root,
    environment: { PLAYWRIGHT_BROWSERS_PATH: cache },
    platform: 'linux',
    architecture: 'x64',
  })
  assert.equal(linux.platform, 'linux')
  assert.equal(linux.architecture, 'x64')
  assert.match(linux.chromiumExecutablePath, /chrome-linux64[/\\]chrome$/)
  assert.throws(
    () => resolveProvisionedPlaywrightRuntime({
      repoRoot: root,
      environment: { PLAYWRIGHT_BROWSERS_PATH: cache },
      platform: 'darwin',
      architecture: 'arm64',
    }),
    /explicit browser runtime is invalid:.*ENOENT/,
  )
  assert.throws(
    () => resolveProvisionedPlaywrightRuntime({
      repoRoot: root,
      environment: { PLAYWRIGHT_BROWSERS_PATH: cache, PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: 'ubuntu20.04-x64' },
      platform: 'linux',
      architecture: 'x64',
    }),
    /PLAYWRIGHT_HOST_PLATFORM_OVERRIDE is not allowed/,
  )
})

test('setup is hermetic, strips hostile Playwright overrides, and never skips Linux dependency setup', t => {
  const root = fixture(t)
  const local = join(root, 'node_modules/playwright-core/.local-browsers')
  provision(local)
  writeFileSync(join(root, 'node_modules/playwright/cli.js'), '')
  const calls = []
  const runtime = ensurePlaywrightBrowsers({
    root,
    args: ['--with-deps'],
    environment: {
      HOME: join(root, 'poison-home'),
      PLAYWRIGHT_BROWSERS_PATH: join(root, 'poison-cache'),
      PLAYWRIGHT_DOWNLOAD_HOST: 'https://unreviewed.invalid',
      PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST: 'https://unreviewed.invalid',
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
      PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: 'ubuntu20.04-x64',
      NODE_OPTIONS: '--require=/tmp/poison.cjs',
    },
    runner(command, args, options) {
      calls.push({ command, args, options })
      if (args[0] === '--version') return { status: 0, stdout: `Google Chrome for Testing ${BROWSER_VERSION}\n`, stderr: '' }
      return { status: 0 }
    },
  })
  assert.equal(runtime.environmentValue, '0')
  assert.equal(calls.length, 3, '--with-deps plus two browser readbacks must execute even when exact markers already exist')
  assert.equal(calls[0].command, process.execPath)
  assert.deepEqual(calls[0].args, [join(realpathSync(root), 'node_modules/playwright/cli.js'), 'install', '--with-deps', 'chromium'])
  assert.equal(calls[0].options.shell, false)
  assert.equal(calls[0].options.env.PLAYWRIGHT_BROWSERS_PATH, '0')
  assert.equal(Object.hasOwn(calls[0].options.env, 'PLAYWRIGHT_DOWNLOAD_HOST'), false)
  assert.equal(Object.hasOwn(calls[0].options.env, 'PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST'), false)
  assert.equal(Object.hasOwn(calls[0].options.env, 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD'), false)
  assert.equal(Object.hasOwn(calls[0].options.env, 'PLAYWRIGHT_HOST_PLATFORM_OVERRIDE'), false)
  assert.equal(Object.hasOwn(calls[0].options.env, 'NODE_OPTIONS'), false)
  assert.equal(calls[1].command, runtime.chromiumExecutablePath)
  assert.equal(calls[2].command, runtime.headlessShellExecutablePath)
  for (const call of calls.slice(1)) {
    assert.deepEqual(call.args, ['--version'])
    assert.equal(call.options.shell, false)
    assert.equal(call.options.timeout, 15_000)
    assert.equal(call.options.maxBuffer, 1024 * 1024)
    assert.equal(Object.hasOwn(call.options.env, 'NODE_OPTIONS'), false)
    assert.equal(Object.hasOwn(call.options.env, 'PLAYWRIGHT_HOST_PLATFORM_OVERRIDE'), false)
  }
})

test('browser smoke readback fails closed on version drift and launch errors', () => {
  const runtime = {
    browserVersion: BROWSER_VERSION,
    chromiumExecutablePath: '/controlled/chromium',
    headlessShellExecutablePath: '/controlled/headless-shell',
  }
  assert.throws(
    () => verifyPlaywrightBrowserReadback({
      root: '/controlled',
      runtime,
      runner: () => ({ status: 0, stdout: `Google Chrome for Testing 1${BROWSER_VERSION}0\n`, stderr: '' }),
    }),
    /version readback does not match/,
  )
  assert.throws(
    () => verifyPlaywrightBrowserReadback({
      root: '/controlled',
      runtime,
      runner: () => ({ status: null, error: new Error('timed out') }),
    }),
    /version readback failed:timed out/,
  )
})

import { accessSync, constants, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { arch as hostArchitecture, cpus } from 'node:os'
import { isAbsolute, join, parse, relative, resolve, sep, win32 } from 'node:path'

const EXECUTABLE_LAYOUTS = Object.freeze({
  darwin: Object.freeze({
    x64: Object.freeze({
      chromium: Object.freeze(['chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing']),
      headlessShell: Object.freeze(['chrome-headless-shell-mac-x64', 'chrome-headless-shell']),
    }),
    arm64: Object.freeze({
      chromium: Object.freeze(['chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing']),
      headlessShell: Object.freeze(['chrome-headless-shell-mac-arm64', 'chrome-headless-shell']),
    }),
  }),
  linux: Object.freeze({
    x64: Object.freeze({
      chromium: Object.freeze(['chrome-linux64', 'chrome']),
      headlessShell: Object.freeze(['chrome-headless-shell-linux64', 'chrome-headless-shell']),
    }),
    arm64: Object.freeze({
      chromium: Object.freeze(['chrome-linux', 'chrome']),
      headlessShell: Object.freeze(['chrome-linux', 'headless_shell']),
    }),
  }),
  win32: Object.freeze({
    x64: Object.freeze({
      chromium: Object.freeze(['chrome-win64', 'chrome.exe']),
      headlessShell: Object.freeze(['chrome-headless-shell-win64', 'chrome-headless-shell.exe']),
    }),
  }),
})

function invariant(condition, message) {
  if (!condition) throw new Error(`Playwright runtime blocked:${message}`)
}

function contained(root, target) {
  const path = relative(root, target)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function effectiveArchitecture(platform, requestedArchitecture) {
  if (requestedArchitecture !== undefined) return requestedArchitecture
  if (platform === 'win32') return 'x64'
  if (platform === 'darwin' && cpus().some(cpu => cpu.model.includes('Apple'))) return 'arm64'
  return hostArchitecture()
}

function executableLayout(platform, architecture) {
  invariant(typeof architecture === 'string' && architecture.length > 0, 'host architecture is required')
  const layout = EXECUTABLE_LAYOUTS[platform]?.[architecture]
  invariant(layout, `unsupported Playwright browser platform:${platform}/${architecture}`)
  return layout
}

function readRegularJson(path, label) {
  const info = lstatSync(path)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, `${label} must be one regular no-link file`)
  invariant(realpathSync(path) === path, `${label} must not traverse a symbolic-link alias`)
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch (error) { throw new Error(`Playwright runtime blocked:${label} is not valid JSON:${error.message}`, { cause: error }) }
}

function candidatePath({ repoRoot, environment, platform }) {
  const explicit = Object.hasOwn(environment, 'PLAYWRIGHT_BROWSERS_PATH')
    ? environment.PLAYWRIGHT_BROWSERS_PATH
    : undefined
  if (explicit !== undefined) {
    invariant(typeof explicit === 'string' && explicit.length > 0, 'explicit PLAYWRIGHT_BROWSERS_PATH is empty')
    if (explicit === '0') {
      return {
        explicit: true,
        path: join(repoRoot, 'node_modules', 'playwright-core', '.local-browsers'),
        environmentValue: '0',
      }
    }
    const absolute = platform === 'win32' ? win32.isAbsolute(explicit) : isAbsolute(explicit)
    invariant(absolute, 'explicit PLAYWRIGHT_BROWSERS_PATH must be absolute or the literal 0')
    return { explicit: true, path: explicit, environmentValue: explicit }
  }

  const home = environment.HOME || environment.USERPROFILE
  if (typeof home !== 'string' || home.length === 0) return null
  if (platform === 'darwin') {
    return { explicit: false, path: join(home, 'Library', 'Caches', 'ms-playwright'), environmentValue: null }
  }
  if (platform === 'win32') {
    const localAppData = environment.LOCALAPPDATA || win32.join(home, 'AppData', 'Local')
    return { explicit: false, path: win32.join(localAppData, 'ms-playwright'), environmentValue: null }
  }
  const cacheHome = environment.XDG_CACHE_HOME || join(home, '.cache')
  return { explicit: false, path: join(cacheHome, 'ms-playwright'), environmentValue: null }
}

export function playwrightBrowserCacheCandidate({
  repoRoot,
  environment = process.env,
  platform = process.platform,
} = {}) {
  invariant(typeof repoRoot === 'string' && repoRoot.length > 0, 'repository root is required')
  invariant(environment && typeof environment === 'object' && !Array.isArray(environment), 'environment must be an object')
  invariant(['darwin', 'linux', 'win32'].includes(platform), `unsupported platform:${String(platform)}`)
  return candidatePath({ repoRoot: resolve(repoRoot), environment, platform })
}

function validateMarker(root, directoryName) {
  const directory = join(root, directoryName)
  const directoryInfo = lstatSync(directory)
  invariant(directoryInfo.isDirectory() && !directoryInfo.isSymbolicLink(), `browser directory is not a real directory:${directoryName}`)
  invariant(realpathSync(directory) === directory, `browser directory is redirected:${directoryName}`)
  const marker = join(directory, 'INSTALLATION_COMPLETE')
  const markerInfo = lstatSync(marker)
  invariant(markerInfo.isFile() && !markerInfo.isSymbolicLink() && markerInfo.nlink === 1, `browser marker is unsafe:${directoryName}`)
  invariant(realpathSync(marker) === marker, `browser marker is redirected:${directoryName}`)
  return directory
}

function validateExecutable({ cacheRoot, browserDirectory, relativePath, label, platform }) {
  const executable = join(browserDirectory, ...relativePath)
  const info = lstatSync(executable)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, `${label} executable must be one regular no-link file`)
  const canonical = realpathSync(executable)
  invariant(canonical === executable, `${label} executable traverses a symbolic-link alias`)
  invariant(contained(cacheRoot, canonical) && canonical !== cacheRoot, `${label} executable escapes the browser cache`)
  if (platform !== 'win32') {
    invariant((info.mode & 0o111) !== 0, `${label} executable has no execute permission`)
  }
  try { accessSync(canonical, constants.X_OK) }
  catch (error) { throw new Error(`Playwright runtime blocked:${label} executable is not executable:${error.message}`, { cause: error }) }
  return canonical
}

/**
 * Resolve an already-provisioned, lock-matched Playwright browser runtime.
 * This function is read-only: it never downloads a browser or falls back to a system executable.
 */
export function resolveProvisionedPlaywrightRuntime({
  repoRoot,
  environment = process.env,
  platform = process.platform,
  architecture,
} = {}) {
  invariant(typeof repoRoot === 'string' && repoRoot.length > 0, 'repository root is required')
  invariant(environment && typeof environment === 'object' && !Array.isArray(environment), 'environment must be an object')
  invariant(!Object.hasOwn(environment, 'PLAYWRIGHT_HOST_PLATFORM_OVERRIDE'), 'PLAYWRIGHT_HOST_PLATFORM_OVERRIDE is not allowed')
  const runtimeArchitecture = effectiveArchitecture(platform, architecture)
  const layout = executableLayout(platform, runtimeArchitecture)
  const requestedRoot = resolve(repoRoot)
  const root = realpathSync(requestedRoot)
  const rootInfo = lstatSync(root)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), 'repository root must be a real directory')

  const candidate = playwrightBrowserCacheCandidate({ repoRoot: root, environment, platform })
  if (!candidate) return null
  const candidates = candidate.explicit
    ? [candidate]
    : [
        {
          explicit: false,
          path: join(root, 'node_modules', 'playwright-core', '.local-browsers'),
          environmentValue: '0',
        },
        candidate,
      ]

  let packageLock
  let playwrightPackage
  let playwrightCorePackage
  let browserRegistry
  try {
    packageLock = readRegularJson(join(root, 'package-lock.json'), 'package-lock.json')
    playwrightPackage = readRegularJson(join(root, 'node_modules', 'playwright', 'package.json'), 'installed Playwright package')
    playwrightCorePackage = readRegularJson(join(root, 'node_modules', 'playwright-core', 'package.json'), 'installed Playwright core package')
    browserRegistry = readRegularJson(join(root, 'node_modules', 'playwright-core', 'browsers.json'), 'installed Playwright browser registry')
  } catch (error) {
    if (candidate.explicit) {
      if (String(error?.message).startsWith('Playwright runtime blocked:')) throw error
      throw new Error(`Playwright runtime blocked:explicit browser runtime is invalid:${error.message}`, { cause: error })
    }
    return null
  }
  const lockedPlaywright = packageLock.packages?.['node_modules/playwright']?.version
  const lockedPlaywrightCore = packageLock.packages?.['node_modules/playwright-core']?.version
  invariant(playwrightPackage.version === lockedPlaywright, 'installed Playwright version differs from package-lock.json')
  invariant(playwrightCorePackage.version === lockedPlaywrightCore, 'installed Playwright core version differs from package-lock.json')

  const chromium = browserRegistry.browsers?.find((browser) => browser.name === 'chromium' && browser.installByDefault === true)
  const headlessShell = browserRegistry.browsers?.find((browser) => browser.name === 'chromium-headless-shell' && browser.installByDefault === true)
  invariant(/^\d+$/.test(chromium?.revision ?? ''), 'Chromium revision is missing from the installed browser registry')
  invariant(/^\d+$/.test(headlessShell?.revision ?? ''), 'Chromium headless-shell revision is missing from the installed browser registry')
  invariant(chromium?.revisionOverrides === undefined, 'Chromium per-host revision overrides are not supported')
  invariant(headlessShell?.revisionOverrides === undefined, 'Chromium headless-shell per-host revision overrides are not supported')
  invariant(/^\d+(?:\.\d+){3}$/.test(chromium?.browserVersion ?? ''), 'Chromium browser version is missing from the installed browser registry')
  invariant(headlessShell?.browserVersion === chromium.browserVersion, 'Chromium browser versions differ in the installed browser registry')

  for (const runtimeCandidate of candidates) {
    let canonicalRoot
    try {
      const info = lstatSync(runtimeCandidate.path)
      invariant(info.isDirectory() && !info.isSymbolicLink(), 'browser cache root must be a real directory')
      canonicalRoot = realpathSync(runtimeCandidate.path)
      invariant(canonicalRoot !== parse(canonicalRoot).root, 'browser cache root may not be the filesystem root')
      const lexical = relative(canonicalRoot, resolve(canonicalRoot))
      invariant(lexical === '', 'browser cache root could not be canonicalized')
      const chromiumDirectory = validateMarker(canonicalRoot, `chromium-${chromium.revision}`)
      const headlessShellDirectory = validateMarker(canonicalRoot, `chromium_headless_shell-${headlessShell.revision}`)
      const chromiumExecutablePath = validateExecutable({
        cacheRoot: canonicalRoot,
        browserDirectory: chromiumDirectory,
        relativePath: layout.chromium,
        label: 'Chromium',
        platform,
      })
      const headlessShellExecutablePath = validateExecutable({
        cacheRoot: canonicalRoot,
        browserDirectory: headlessShellDirectory,
        relativePath: layout.headlessShell,
        label: 'Chromium headless-shell',
        platform,
      })

      return Object.freeze({
        environmentValue: runtimeCandidate.environmentValue === '0' ? '0' : canonicalRoot,
        canonicalRoot,
        platform,
        architecture: runtimeArchitecture,
        playwrightVersion: playwrightPackage.version,
        playwrightCoreVersion: playwrightCorePackage.version,
        browserVersion: chromium.browserVersion,
        chromiumRevision: chromium.revision,
        headlessShellRevision: headlessShell.revision,
        chromiumExecutablePath,
        headlessShellExecutablePath,
      })
    } catch (error) {
      if (runtimeCandidate.explicit) {
        if (String(error?.message).startsWith('Playwright runtime blocked:')) throw error
        throw new Error(`Playwright runtime blocked:explicit browser runtime is invalid:${error.message}`, { cause: error })
      }
      continue
    }

  }
  return null
}

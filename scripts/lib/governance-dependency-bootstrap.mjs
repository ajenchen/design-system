import { spawnSync } from 'node:child_process'
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  prepareVerifiedExactNpmRuntime,
  resolveExactNpmArtifact,
} from './verified-exact-npm-runtime.mjs'
import {
  materializeClosedHookToolProfile,
} from './closed-tool-execution.mjs'

export const GOVERNANCE_DEPENDENCY_REGISTRY = 'https://registry.npmjs.org/'
export const GOVERNANCE_DEPENDENCY_MINIMUM_NODE_VERSION = '22.12.0'
export const GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION = '11.18.0'
export const GOVERNANCE_DEPENDENCY_REQUIRED_EXECUTABLES = Object.freeze(['bash', 'git', 'jq', 'python3'])
export const GOVERNANCE_DEPENDENCY_NPM_STEPS = Object.freeze([
  Object.freeze(['ci', '--legacy-peer-deps', '--ignore-scripts', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`]),
  Object.freeze(['audit', 'signatures', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`]),
  Object.freeze(['audit', '--audit-level=high', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`]),
])

const CREDENTIAL_NAME = /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CLIENT_SECRET|API_KEY|ACCESS_KEY(?:_ID)?|AUTH_TOKEN)$/i
const HOSTILE_NAME = /^(?:ALL_PROXY|BASH_ENV|CURL_HOME|DYLD_|ENV$|GIT_|GH_|HTTPS?_PROXY|LD_|NETRC$|NODE_AUTH_TOKEN$|NODE_EXTRA_CA_CERTS$|NODE_OPTIONS$|NODE_PATH$|NODE_TLS_REJECT_UNAUTHORIZED$|NO_PROXY$|NPM_CONFIG_|npm_config_|NPM_TOKEN$|OPENAI_API_KEY$|ANTHROPIC_API_KEY$|PERL5OPT$|PLAYWRIGHT_|PYTHONHOME$|PYTHONPATH$|RUBYOPT$|SSH_|SSL_CERT_DIR$|SSL_CERT_FILE$|all_proxy$|https?_proxy$|no_proxy$)/

function invariant(condition, message, prefix = 'GOV-DEPENDENCY-BOOTSTRAP-001') {
  if (!condition) throw new Error(`${prefix}:${message}`)
}

function stableVersionAtLeast(value, minimum) {
  const parse = (version) => typeof version === 'string'
    ? version.match(/^(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/)?.slice(1, 4).map(Number)
    : null
  const observed = parse(value)
  const required = parse(minimum)
  if (!observed || !required) return false
  for (let index = 0; index < 3; index += 1) {
    if (observed[index] !== required[index]) return observed[index] > required[index]
  }
  return true
}

function regularBytes(root, path, prefix) {
  const absolute = join(root, path)
  const info = lstatSync(absolute)
  invariant(
    info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && realpathSync(absolute) === absolute,
    `bootstrap authority path must be one regular no-link file:${path}`,
    prefix,
  )
  return readFileSync(absolute)
}

export function assertClosedProjectNpmConfig(rootPath, expectedLines, { errorPrefix } = {}) {
  const root = realpathSync(resolve(rootPath))
  invariant(Array.isArray(expectedLines) && expectedLines.length > 0 && expectedLines.every((line) => typeof line === 'string' && line.length > 0), '.npmrc expected lines are invalid', errorPrefix)
  const lines = regularBytes(root, '.npmrc', errorPrefix).toString('utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  invariant(JSON.stringify(lines) === JSON.stringify(expectedLines), `.npmrc must contain only the canonical settings:${expectedLines.join(',')}`, errorPrefix)
  return lines
}

export function assertNoRootNpmShrinkwrap(rootPath, { errorPrefix = 'GOV-DEPENDENCY-LOCK-001' } = {}) {
  const root = realpathSync(resolve(rootPath))
  const shrinkwrap = join(root, 'npm-shrinkwrap.json')
  let present = false
  try {
    lstatSync(shrinkwrap)
    present = true
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  invariant(
    !present,
    'root npm-shrinkwrap.json is forbidden; authenticated package-lock.json is the sole dependency lock authority',
    errorPrefix,
  )
  return root
}

export function sanitizeGovernanceBootstrapEnvironment(baseEnvironment = process.env) {
  return Object.fromEntries(Object.entries(baseEnvironment).filter(([name, value]) => (
    value !== undefined && !CREDENTIAL_NAME.test(name) && !HOSTILE_NAME.test(name)
  )))
}

export function assertGovernanceBootstrapRuntime({
  platform = process.platform,
  nodeVersion = process.versions.node,
  runner = spawnSync,
  nodeExecutable = process.execPath,
  repoRoot,
  toolProfileFactory = materializeClosedHookToolProfile,
  errorPrefix,
} = {}) {
  invariant(platform === 'darwin' || platform === 'linux', 'native Windows is unsupported; use WSL2 or the committed Linux dev container', errorPrefix)
  invariant(stableVersionAtLeast(nodeVersion, GOVERNANCE_DEPENDENCY_MINIMUM_NODE_VERSION), `Node.js ${GOVERNANCE_DEPENDENCY_MINIMUM_NODE_VERSION} or newer is required; received ${String(nodeVersion)}`, errorPrefix)
  const profile = toolProfileFactory({
    nodeExecutable,
    ...(repoRoot === undefined ? {} : { repoRoot: realpathSync(resolve(repoRoot)) }),
    runtimePlatform: platform,
  })
  invariant(profile && typeof profile.verify === 'function', 'closed prerequisite tool profile is unavailable', errorPrefix)
  profile.verify()
  const closedEnvironment = {
    HOME: profile.homeDirectory,
    LANG: 'C',
    LC_ALL: 'C',
    NO_COLOR: '1',
    PATH: profile.executablePath,
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONNOUSERSITE: '1',
    TMPDIR: profile.tempDirectory,
    XDG_CONFIG_HOME: profile.homeDirectory,
  }
  const missing = []
  for (const executable of GOVERNANCE_DEPENDENCY_REQUIRED_EXECUTABLES) {
    const capability = profile.executables?.[executable]
    if (typeof capability !== 'string' || !capability.startsWith(`${profile.root}/`)) {
      missing.push(executable)
      continue
    }
    profile.verify()
    const result = runner(capability, ['--version'], {
      env: closedEnvironment,
      shell: false,
      stdio: 'ignore',
      timeout: 5_000,
      windowsHide: true,
    })
    profile.verify()
    if (result?.error || result?.status !== 0) missing.push(executable)
  }
  invariant(missing.length === 0, `missing required setup executables: ${missing.join(', ')}`, errorPrefix)
  const result = {
    platform,
    nodeVersion,
    executables: [...GOVERNANCE_DEPENDENCY_REQUIRED_EXECUTABLES],
  }
  Object.defineProperty(result, 'toolProfile', {
    enumerable: false,
    value: profile,
  })
  return Object.freeze(result)
}

export function captureBootstrapAuthority(rootPath, paths, { errorPrefix } = {}) {
  const root = realpathSync(resolve(rootPath))
  invariant(Array.isArray(paths) && paths.length > 0 && new Set(paths).size === paths.length, 'bootstrap authority paths are invalid', errorPrefix)
  return Object.freeze(paths.map((path) => Object.freeze({ path, bytes: regularBytes(root, path, errorPrefix) })))
}

export function assertBootstrapAuthorityUnchanged(rootPath, snapshot, { errorPrefix } = {}) {
  const root = realpathSync(resolve(rootPath))
  for (const entry of snapshot) {
    invariant(regularBytes(root, entry.path, errorPrefix).equals(entry.bytes), `bootstrap install mutated committed setup authority:${entry.path}`, errorPrefix)
  }
}

export function createIsolatedGovernanceNpmEnvironment(baseEnvironment = process.env, {
  errorPrefix = 'GOV-DEPENDENCY-BOOTSTRAP-001',
  toolProfile,
} = {}) {
  const configRoot = mkdtempSync(join(realpathSync(tmpdir()), 'qijenchen-governance-dependency-'))
  const userConfig = join(configRoot, 'user.npmrc')
  const globalConfig = join(configRoot, 'global.npmrc')
  try {
    const config = `registry=${GOVERNANCE_DEPENDENCY_REGISTRY}\nignore-scripts=true\nstrict-ssl=true\nalways-auth=false\n`
    writeFileSync(userConfig, config, { flag: 'wx', mode: 0o600 })
    writeFileSync(globalConfig, config, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    rmSync(configRoot, { recursive: true, force: true })
    throw error
  }
  const inherited = sanitizeGovernanceBootstrapEnvironment(baseEnvironment)
  if (toolProfile !== undefined) {
    invariant(toolProfile && typeof toolProfile.verify === 'function', 'closed prerequisite tool profile is invalid', errorPrefix)
    toolProfile.verify()
    inherited.HOME = toolProfile.homeDirectory
    inherited.PATH = toolProfile.executablePath
    inherited.TMPDIR = toolProfile.tempDirectory
    inherited.XDG_CONFIG_HOME = toolProfile.homeDirectory
  }
  invariant(typeof inherited.PATH === 'string' && inherited.PATH.length > 0, 'sanitized setup environment has no closed PATH', errorPrefix)
  return {
    env: {
      ...inherited,
      NPM_CONFIG_USERCONFIG: userConfig,
      NPM_CONFIG_GLOBALCONFIG: globalConfig,
      NPM_CONFIG_REGISTRY: GOVERNANCE_DEPENDENCY_REGISTRY,
      NPM_CONFIG_IGNORE_SCRIPTS: 'true',
      NPM_CONFIG_STRICT_SSL: 'true',
      NPM_CONFIG_ALWAYS_AUTH: 'false',
      NPM_CONFIG_AUDIT_LEVEL: 'high',
    },
    cleanup: () => rmSync(configRoot, { recursive: true, force: true }),
  }
}

export function runClosedBootstrapStep(command, args, {
  root,
  environment,
  runner = spawnSync,
  errorPrefix,
  timeoutMs = 15 * 60 * 1_000,
} = {}) {
  invariant(Number.isInteger(timeoutMs) && timeoutMs >= 1_000, 'bootstrap step timeout must be at least 1000ms', errorPrefix)
  const result = runner(command, args, {
    cwd: root,
    env: environment,
    shell: false,
    stdio: 'inherit',
    timeout: timeoutMs,
    windowsHide: true,
  })
  if (result?.error) throw result.error
  invariant(Number.isInteger(result?.status), `${command} did not return an exit status`, errorPrefix)
  invariant(result.status === 0, `${command} ${args.join(' ')} failed with exit ${result.status}`, errorPrefix)
  return result
}

export async function runVerifiedGovernanceDependencyBootstrap({
  root: rootPath,
  platform = process.platform,
  nodeVersion = process.versions.node,
  baseEnvironment = process.env,
  runner = spawnSync,
  runtimeFactory = prepareVerifiedExactNpmRuntime,
  authorityPaths,
  expectedNpmrcLines,
  validateRoleRepository = () => {},
  afterStage = () => {},
  errorPrefix = 'GOV-DEPENDENCY-BOOTSTRAP-001',
} = {}) {
  const root = realpathSync(resolve(rootPath))
  assertNoRootNpmShrinkwrap(root, { errorPrefix })
  const bootstrapRuntime = assertGovernanceBootstrapRuntime({
    platform,
    nodeVersion,
    runner,
    nodeExecutable: process.execPath,
    repoRoot: root,
    errorPrefix,
  })
  assertClosedProjectNpmConfig(root, expectedNpmrcLines, { errorPrefix })
  await validateRoleRepository(root)
  const expectedNpm = resolveExactNpmArtifact(root)
  invariant(expectedNpm.version === GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION, `npm runtime must remain exactly ${GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION}`, errorPrefix)
  const snapshot = captureBootstrapAuthority(root, authorityPaths, { errorPrefix })
  const isolated = createIsolatedGovernanceNpmEnvironment(baseEnvironment, {
    errorPrefix,
    toolProfile: bootstrapRuntime.toolProfile,
  })
  let npmRuntime = null
  try {
    npmRuntime = await runtimeFactory({ repositoryRoot: root, env: isolated.env, runner })
    invariant(
      npmRuntime?.cli
        && npmRuntime?.artifact?.version === expectedNpm.version
        && npmRuntime?.artifact?.resolved === expectedNpm.resolved
        && npmRuntime?.artifact?.integrity === expectedNpm.integrity
        && npmRuntime?.toolchain?.npm === expectedNpm.version,
      'verified exact npm runtime factory returned an invalid capability',
      errorPrefix,
    )
    for (let index = 0; index < GOVERNANCE_DEPENDENCY_NPM_STEPS.length; index += 1) {
      const args = GOVERNANCE_DEPENDENCY_NPM_STEPS[index]
      runClosedBootstrapStep(process.execPath, [npmRuntime.cli, ...args], { root, environment: isolated.env, runner, errorPrefix })
      assertBootstrapAuthorityUnchanged(root, snapshot, { errorPrefix })
      assertClosedProjectNpmConfig(root, expectedNpmrcLines, { errorPrefix })
      await validateRoleRepository(root)
      await afterStage({ index, args: [...args], root })
    }
    return {
      root,
      toolchain: npmRuntime.toolchain,
      steps: ['verified-exact-npm-runtime', 'locked-install', 'signature-audit', 'vulnerability-audit'],
    }
  } finally {
    try { npmRuntime?.cleanup?.() } finally { isolated.cleanup() }
  }
}

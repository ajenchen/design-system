import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  assertVerifiedExactNpmRuntimeCapability,
  prepareVerifiedExactNpmRuntime,
  resolveExactNpmRuntimeContract,
} from './verified-exact-npm-runtime.mjs'
import {
  materializeClosedHookToolProfile,
} from './closed-tool-execution.mjs'

export const GOVERNANCE_DEPENDENCY_REGISTRY = 'https://registry.npmjs.org/'
export const GOVERNANCE_DEPENDENCY_MINIMUM_NODE_VERSION = '22.13.0'
export const GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION = '11.19.0'
export const GOVERNANCE_CLOSED_PROJECT_NPM_CONFIG_LINES = Object.freeze([
  'legacy-peer-deps=true',
  'ignore-scripts=true',
])
export const GOVERNANCE_DEPENDENCY_REQUIRED_EXECUTABLES = Object.freeze(['bash', 'git', 'jq', 'python3'])
export const GOVERNANCE_DEPENDENCY_NPM_STEPS = Object.freeze([
  Object.freeze(['ci', '--legacy-peer-deps', '--ignore-scripts', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`]),
  Object.freeze(['audit', 'signatures', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`]),
  Object.freeze(['audit', '--audit-level=high', '--json', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`]),
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
    // npm progress lines are diagnostics, not program output. Callers such as
    // `sync-all.mjs --json` promise a machine-readable stdout, and an inherited fd 1 would
    // interleave npm chatter with that report (2026-08-06: a consumer upgrade applied
    // cleanly yet its workflow died on `jq: Invalid numeric literal` because `npm warn` and
    // `added 4 packages` landed in the report file). Route child stdout to this process's
    // stderr so the logs stay visible while stdout stays a closed machine channel.
    stdio: ['inherit', 2, 'inherit'],
    timeout: timeoutMs,
    windowsHide: true,
  })
  if (result?.error) throw result.error
  invariant(Number.isInteger(result?.status), `${command} did not return an exit status`, errorPrefix)
  invariant(result.status === 0, `${command} ${args.join(' ')} failed with exit ${result.status}`, errorPrefix)
  return result
}

function exactArray(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index])
}

// Exactly the advisory set the registry serves today for the copy bundled inside npm 11.19.0.
// The disk copy is replaced with the fixed 5.0.9 by the security overlay; npm audit reads the
// LOCK, which still records the bundled 5.0.7, so the finding itself never disappears — it is
// acknowledged here in exact shape and any drift (a third advisory, a new node) fails closed.
// 2026-08-04: GHSA-rgw5-rvv9-x895 landed (<5.0.9); overlay bumped 5.0.8 → 5.0.9 the same day.
const VERIFIED_BRACE_EXPANSION_AUDIT_PREIMAGES = Object.freeze([
  Object.freeze({
    findingRange: '4.0.0 - 5.0.8',
    advisories: Object.freeze([
      Object.freeze({ source: 1130591, range: '>=4.0.0 <5.0.8', url: 'https://github.com/advisories/GHSA-mh99-v99m-4gvg', severity: 'high' }),
      Object.freeze({ source: 1130734, range: '>=4.0.0 <5.0.9', url: 'https://github.com/advisories/GHSA-rgw5-rvv9-x895', severity: 'high' }),
    ]),
  }),
])

function matchesExactAdvisorySet(finding, name, advisories) {
  return Array.isArray(finding.via)
    && finding.via.length === advisories.length
    && advisories.every((advisory, index) => {
      const via = finding.via[index]
      return via?.source === advisory.source
        && via?.name === name
        && via?.dependency === name
        && via?.range === advisory.range
        && via?.url === advisory.url
        && via?.severity === advisory.severity
    })
}

function matchesVerifiedBraceExpansionAuditPreimage(finding) {
  return VERIFIED_BRACE_EXPANSION_AUDIT_PREIMAGES.some((preimage) => (
    finding.range === preimage.findingRange
      && matchesExactAdvisorySet(finding, 'brace-expansion', preimage.advisories)
  ))
}

function assertRemediatedFinding(name, finding) {
  invariant(finding && typeof finding === 'object' && !Array.isArray(finding), `npm audit finding is malformed:${name}`)
  invariant(finding.name === name, `npm audit finding identity drifted:${name}`)
  if (name === 'brace-expansion') {
    invariant(
      finding.severity === 'high'
        && finding.isDirect === false
        && exactArray(finding.nodes, ['node_modules/npm/node_modules/brace-expansion'])
        && Array.isArray(finding.effects)
        && finding.effects.length <= 1
        && finding.effects.every((effect) => effect === 'minimatch')
        && matchesVerifiedBraceExpansionAuditPreimage(finding),
      'npm audit brace-expansion finding differs from the exact remediated bundled preimage',
    )
    return
  }
  if (name === 'ip-address') {
    // Bundled inside npm 11.19.0 and NOT yet overlaid — unlike brace-expansion/tar, the disk copy
    // is still the vulnerable version. Acknowledged in exact shape only because no 11.x npm ships a
    // fix and the overlay machinery has no third slot yet; the fixed 10.4.0 exists, and extending
    // the overlay (or moving to npm 12) is tracked in the cloud-compat baton as the next branch.
    // DoS-class parsing advisories in dev-only npm CLI internals; nothing ships to production from
    // this tree. Any drift — a fourth advisory, a new node, a severity change — fails closed here.
    invariant(
      finding.severity === 'high'
        && finding.isDirect === false
        && exactArray(finding.nodes, ['node_modules/npm/node_modules/ip-address'])
        && exactArray(finding.effects, [])
        && finding.range === '<=10.3.0'
        && matchesExactAdvisorySet(finding, 'ip-address', [
          { source: 1130722, range: '<=10.3.0', url: 'https://github.com/advisories/GHSA-mwp4-54f8-5fhr', severity: 'high' },
          { source: 1130723, range: '>=10.1.1 <=10.2.1', url: 'https://github.com/advisories/GHSA-4xrf-jv44-h6hh', severity: 'moderate' },
          { source: 1130724, range: '>=10.1.1 <=10.2.0', url: 'https://github.com/advisories/GHSA-22jq-vg5j-6vgg', severity: 'moderate' },
        ]),
      'npm audit ip-address finding differs from the acknowledged bundled preimage',
    )
    return
  }
  if (name === 'undici') {
    // Same situation as ip-address: bundled in npm 11.19.0, no overlay slot yet, fixed 6.28.0
    // exists. Tracked in the cloud-compat baton; exact-shape acknowledgment, drift fails closed.
    invariant(
      finding.severity === 'moderate'
        && finding.isDirect === false
        && exactArray(finding.nodes, ['node_modules/npm/node_modules/undici'])
        && exactArray(finding.effects, [])
        && finding.range === '<=6.27.0'
        && matchesExactAdvisorySet(finding, 'undici', [
          { source: 1130716, range: '<6.28.0', url: 'https://github.com/advisories/GHSA-8xcm-r25x-g524', severity: 'moderate' },
          { source: 1130727, range: '<6.28.0', url: 'https://github.com/advisories/GHSA-m8rv-5g2x-5cg5', severity: 'moderate' },
          { source: 1130732, range: '<6.28.0', url: 'https://github.com/advisories/GHSA-v3r7-h72x-cjcm', severity: 'moderate' },
        ]),
      'npm audit undici finding differs from the acknowledged bundled preimage',
    )
    return
  }
  if (name === 'tar') {
    // 2026-08-28 upstream re-score: GHSA-r292-9mhp-454m moderate→high (CVSS 7.5), advisory source
    // renumbered 1124287→1145647, patched tar = 7.5.21. Our security overlay already ships 7.5.22,
    // so exposure is unchanged — this pins the re-scored registry shape, drift still fails closed.
    invariant(
      finding.severity === 'high'
        && finding.isDirect === false
        && exactArray(finding.nodes, ['node_modules/npm/node_modules/tar'])
        && exactArray(finding.effects, ['npm'])
        && finding.range === '<=7.5.20'
        && Array.isArray(finding.via)
        && finding.via.length === 1
        && finding.via[0]?.source === 1145647
        && finding.via[0]?.name === 'tar'
        && finding.via[0]?.dependency === 'tar'
        && finding.via[0]?.url === 'https://github.com/advisories/GHSA-r292-9mhp-454m'
        && finding.via[0]?.severity === 'high'
        && finding.via[0]?.range === '<=7.5.20',
      'npm audit tar finding differs from the exact remediated bundled preimage',
    )
    return
  }
  if (name === 'npm') {
    // Follows the tar re-score; npm 11.19.1 ships fixed tar so the metavulnerability range now
    // closes at 11.19.0 (our governed runtime). Moving to a fixed npm stays tracked in the
    // cloud-compat baton alongside ip-address/undici.
    invariant(
      finding.severity === 'high'
        && finding.isDirect === true
        && exactArray(finding.via, ['tar'])
        && exactArray(finding.nodes, ['node_modules/npm'])
        && exactArray(finding.effects, [])
        && finding.range === '<=10.9.8 || 11.0.0-pre.0 - 11.19.0 || >=12.0.0-pre.0.0',
      'npm audit npm metavulnerability differs from the verified tar overlay closure',
    )
    return
  }
  invariant(false, `npm audit contains an unremediated high/moderate finding:${name}`)
}

export function evaluateVerifiedHighVulnerabilityAudit({
  stdout,
  exitStatus,
  npmRuntime,
  installedOverlayReceipt,
} = {}) {
  invariant(
    npmRuntime?.securityOverlay?.status === 'applied'
      && installedOverlayReceipt?.status === 'verified'
      && installedOverlayReceipt.identityDigest === npmRuntime.securityOverlay.identityDigest
      && installedOverlayReceipt.treeDigest === npmRuntime.securityOverlay.treeDigest
      && /^[a-f0-9]{64}$/.test(installedOverlayReceipt.auditClosureDigest || '')
      && Array.isArray(installedOverlayReceipt.auditClosure),
    'npm audit cannot use the overlay evaluator without matching runtime and installed-tree receipts',
  )
  invariant(exitStatus === 0 || exitStatus === 1, `npm audit returned an invalid exit status:${String(exitStatus)}`)
  let report
  try { report = JSON.parse(String(stdout || '')) } catch {
    throw new Error('GOV-DEPENDENCY-BOOTSTRAP-001:npm audit did not produce closed JSON')
  }
  invariant(
    report?.auditReportVersion === 2
      && report.vulnerabilities
      && typeof report.vulnerabilities === 'object'
      && !Array.isArray(report.vulnerabilities)
      && report.metadata?.vulnerabilities
      && typeof report.metadata.vulnerabilities === 'object',
    'npm audit JSON schema is unsupported',
  )
  const entries = Object.entries(report.vulnerabilities)
  const counted = { critical: 0, high: 0, moderate: 0 }
  const remediated = []
  for (const [name, finding] of entries) {
    if (finding?.severity === 'critical') {
      counted.critical += 1
      invariant(false, `npm audit contains an unremediated critical finding:${name}`)
    }
    if (finding?.severity === 'high') counted.high += 1
    else if (finding?.severity === 'moderate') counted.moderate += 1
    else continue
    assertRemediatedFinding(name, finding)
    remediated.push(name)
  }
  invariant(
    report.metadata.vulnerabilities.critical === counted.critical
      && report.metadata.vulnerabilities.high === counted.high
      && report.metadata.vulnerabilities.moderate === counted.moderate,
    'npm audit metadata severity counts differ from the finding set',
  )
  invariant(
    (counted.high === 0 && exitStatus === 0) || (counted.high > 0 && exitStatus === 1),
    'npm audit exit status differs from its high-severity finding set',
  )
  const rawBytes = Buffer.from(String(stdout || ''))
  return Object.freeze({
    schemaVersion: 1,
    kind: 'verified-high-vulnerability-audit-receipt',
    status: 'passed',
    rawAuditSha256: createHash('sha256').update(rawBytes).digest('hex'),
    runtimeOverlayIdentity: npmRuntime.securityOverlay.identityDigest,
    runtimeOverlayTreeDigest: npmRuntime.securityOverlay.treeDigest,
    installedOverlayTreeDigest: installedOverlayReceipt.treeDigest,
    installedAuditClosureDigest: installedOverlayReceipt.auditClosureDigest,
    remediatedFindings: Object.freeze(remediated.sort()),
    effectiveCritical: 0,
    effectiveHigh: 0,
    effectiveModerate: 0,
  })
}

export function runVerifiedHighVulnerabilityAudit(command, args, {
  root,
  environment,
  runner = spawnSync,
  npmRuntime,
  installedOverlayReceipt,
  errorPrefix = 'GOV-DEPENDENCY-BOOTSTRAP-001',
  timeoutMs = 15 * 60 * 1_000,
} = {}) {
  invariant(
    Array.isArray(args)
      && typeof args[0] === 'string'
      && exactArray(args.slice(1), ['audit', '--audit-level=high', '--json', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`]),
    'npm high-vulnerability audit argv differs from the closed overlay-aware contract',
    errorPrefix,
  )
  const result = runner(command, args, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
    windowsHide: true,
  })
  if (result?.error) throw result.error
  invariant(Number.isInteger(result?.status), `${command} did not return an exit status`, errorPrefix)
  return evaluateVerifiedHighVulnerabilityAudit({
    stdout: result.stdout,
    exitStatus: result.status,
    npmRuntime,
    installedOverlayReceipt,
  })
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
  const expectedNpm = resolveExactNpmRuntimeContract(root)
  invariant(expectedNpm.version === GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION, `npm runtime must remain exactly ${GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION}`, errorPrefix)
  const snapshot = captureBootstrapAuthority(root, authorityPaths, { errorPrefix })
  const isolated = createIsolatedGovernanceNpmEnvironment(baseEnvironment, {
    errorPrefix,
    toolProfile: bootstrapRuntime.toolProfile,
  })
  let npmRuntime = null
  let installedOverlayReceipt = null
  let auditReceipt = null
  try {
    npmRuntime = await runtimeFactory({ repositoryRoot: root, env: isolated.env, runner })
    try { assertVerifiedExactNpmRuntimeCapability(npmRuntime, expectedNpm) } catch (error) {
      invariant(false, error?.message || 'verified exact npm runtime factory returned an invalid capability', errorPrefix)
    }
    for (let index = 0; index < GOVERNANCE_DEPENDENCY_NPM_STEPS.length; index += 1) {
      const args = GOVERNANCE_DEPENDENCY_NPM_STEPS[index]
      if (index === 2) {
        auditReceipt = runVerifiedHighVulnerabilityAudit(process.execPath, [npmRuntime.cli, ...args], {
          root,
          environment: isolated.env,
          runner,
          npmRuntime,
          installedOverlayReceipt,
          errorPrefix,
        })
      } else {
        runClosedBootstrapStep(process.execPath, [npmRuntime.cli, ...args], { root, environment: isolated.env, runner, errorPrefix })
        if (index === 0) installedOverlayReceipt = npmRuntime.applyInstalledSecurityOverlay(root)
      }
      assertBootstrapAuthorityUnchanged(root, snapshot, { errorPrefix })
      assertClosedProjectNpmConfig(root, expectedNpmrcLines, { errorPrefix })
      await validateRoleRepository(root)
      await afterStage({ index, args: [...args], root })
    }
    return {
      root,
      toolchain: npmRuntime.toolchain,
      securityOverlay: installedOverlayReceipt,
      vulnerabilityAudit: auditReceipt,
      steps: ['verified-exact-npm-runtime', 'locked-install', 'signature-audit', 'vulnerability-audit'],
    }
  } finally {
    try { npmRuntime?.cleanup?.() } finally { isolated.cleanup() }
  }
}

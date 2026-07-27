#!/usr/bin/env node

// Test-only protected-base replacement for scripts/setup-provider-cli-toolchain.mjs.
//
// The sync-all transaction fixture embeds these exact bytes into both the predecessor and
// incoming authenticated corpora. Production code has no environment-selected provider setup
// module: it imports the canonical relative path, and this small implementation occupies that
// path only inside the disposable test repository. The real provider package/content verifier is
// covered by test-setup-provider-cli-toolchain.mjs; this fixture exercises sync-all's lifecycle,
// copy, publication, rollback, and zero-provider-execution boundaries without downloading the
// real provider packages.

import { createHash, randomBytes } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export const PROVIDER_CLI_SYNC_FIXTURE_RECEIPT_KIND =
  'provider-cli-sync-lifecycle-fixture-v1'
export const PROVIDER_CLI_SYNC_FIXTURE_SHIM_MARKER =
  'QIJENCHEN_PROVIDER_CLI_SYNC_FIXTURE_SHIM_V1'

const ERROR_PREFIX = 'GOV-PROVIDER-CLI-SYNC-FIXTURE-001'
const RUNTIME_PROTOCOL = 'content-v2'
const SHA256 = /^[a-f0-9]{64}$/

function invariant(condition, message) {
  if (!condition) throw new Error(`${ERROR_PREFIX}:${message}`)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()),
    `${label} has an invalid or open shape`,
  )
}

function portablePath(value, label) {
  invariant(
    typeof value === 'string'
      && value.length > 0
      && !isAbsolute(value)
      && !value.includes('\\')
      && !/[\0\n\r]/.test(value)
      && value.split('/').every(part => part && part !== '.' && part !== '..'),
    `${label} must be one portable relative path`,
  )
  return value
}

function contained(root, path, label) {
  portablePath(path, label)
  const absolute = resolve(root, path)
  const rel = relative(root, absolute)
  invariant(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label} escapes the fixture root`)
  return absolute
}

function regularBytes(path, label) {
  const info = lstatSync(path)
  invariant(
    info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && realpathSync(path) === path,
    `${label} must be one regular unaliased file`,
  )
  return readFileSync(path)
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new Error(`${ERROR_PREFIX}:${label} is invalid JSON:${error.message}`, { cause: error })
  }
}

function platformId(platform, arch) {
  invariant(['darwin', 'linux'].includes(platform), `unsupported platform:${String(platform)}`)
  invariant(['arm64', 'x64'].includes(arch), `unsupported architecture:${String(arch)}`)
  return `${platform}-${arch}`
}

function authorityAt(rootPath) {
  const root = realpathSync(resolve(rootPath))
  const candidates = [
    'infra/governance/providers/provider-cli-toolchain.json',
    'governance/provider-cli-toolchain.json',
  ].map(path => ({ path, absolute: contained(root, path, 'provider CLI manifest path') }))
    .filter(candidate => existsSync(candidate.absolute))
    .map(candidate => ({ ...candidate, bytes: regularBytes(candidate.absolute, `provider CLI manifest ${candidate.path}`) }))
  invariant(candidates.length > 0, 'provider CLI manifest is missing')
  if (candidates.length === 2) {
    invariant(candidates[0].bytes.equals(candidates[1].bytes), 'authority and consumer manifests differ')
  }
  const selected = candidates.find(candidate => candidate.path.startsWith('infra/')) ?? candidates[0]
  const manifest = parseJson(selected.bytes, 'provider CLI manifest')
  invariant(manifest.schemaVersion === 2 && manifest.kind === 'provider-cli-toolchain', 'provider CLI manifest identity is unsupported')
  invariant(
    manifest.installPolicy?.runtimeDirectory === 'node_modules/.provider-cli-toolchain'
      && manifest.installPolicy?.shimDirectory === 'node_modules/.bin'
      && Array.isArray(manifest.installPolicy?.supportedPlatforms),
    'provider CLI install policy is unsupported',
  )
  invariant(Array.isArray(manifest.tools) && manifest.tools.length > 0, 'provider CLI tools are missing')
  const executables = []
  const versions = {}
  for (const tool of manifest.tools) {
    invariant(
      tool && typeof tool === 'object'
        && typeof tool.executable === 'string'
        && /^[a-z][a-z0-9-]+$/.test(tool.executable)
        && typeof tool.version === 'string'
        && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tool.version),
      'provider CLI tool identity is invalid',
    )
    invariant(!executables.includes(tool.executable), `provider CLI executable is duplicated:${tool.executable}`)
    executables.push(tool.executable)
    versions[tool.executable] = tool.version
  }
  executables.sort()

  const lockPath = selected.path.startsWith('infra/')
    ? manifest.packageLock?.path
    : manifest.packageLock?.consumerPath
  const lockBytes = regularBytes(contained(root, lockPath, 'provider CLI lock path'), 'provider CLI lock')
  invariant(SHA256.test(manifest.packageLock?.sha256) && sha256(lockBytes) === manifest.packageLock.sha256, 'provider CLI lock digest differs from the manifest')
  const lock = parseJson(lockBytes, 'provider CLI lock')
  invariant(lock.lockfileVersion === 3 && lock.packages && typeof lock.packages === 'object', 'provider CLI lock identity is invalid')
  return Object.freeze({
    authorityDigest: sha256(selected.bytes),
    executables: Object.freeze(executables),
    lockDigest: sha256(lockBytes),
    manifest,
    role: selected.path.startsWith('infra/') ? 'authority' : 'consumer',
    root,
    versions: Object.freeze(versions),
  })
}

function poisonSource(executable, version) {
  return `#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
const marker = process.env.PROVIDER_CLI_EXECUTION_MARKER
if (marker) writeFileSync(marker, String(process.env.PROVIDER_CLI_POISON_SECRET || '<missing>'))
if (process.argv.includes('--version')) process.stdout.write(${JSON.stringify(`${executable} ${version}\n`)})
process.exit(97)
`
}

export function providerCliFixtureShimBytes(executable, targetRelative) {
  invariant(/^[a-z][a-z0-9-]+$/.test(executable), 'fixture shim executable is invalid')
  portablePath(targetRelative, 'fixture shim target')
  return Buffer.from(`#!/usr/bin/env node
// ${PROVIDER_CLI_SYNC_FIXTURE_SHIM_MARKER}
Promise.all([import('node:child_process'), import('node:path')]).then(([child, path]) => {
  const root = path.resolve(path.dirname(process.argv[1]), '..', '..')
  const target = path.resolve(root, ${JSON.stringify(targetRelative)})
  const result = child.spawnSync(process.execPath, [target, ...process.argv.slice(2)], {
    cwd: process.cwd(), env: process.env, shell: false, stdio: 'inherit',
  })
  if (result.error) throw result.error
  process.exit(Number.isInteger(result.status) ? result.status : 1)
}).catch(error => { console.error(error.message); process.exit(1) })
`, 'utf8')
}

function writeExclusive(path, bytes, mode) {
  let descriptor = null
  try {
    descriptor = openSync(path, 'wx', mode)
    writeFileSync(descriptor, bytes)
    closeSync(descriptor)
    descriptor = null
    chmodSync(path, mode)
  } finally {
    if (descriptor !== null) closeSync(descriptor)
  }
}

function receiptFor(authority, currentPlatform) {
  return {
    schemaVersion: 1,
    kind: PROVIDER_CLI_SYNC_FIXTURE_RECEIPT_KIND,
    authorityDigest: authority.authorityDigest,
    lockDigest: authority.lockDigest,
    platform: currentPlatform,
    executables: authority.executables,
    versions: authority.versions,
    executablesProbed: false,
  }
}

function runtimePaths(authority, currentPlatform) {
  const relativeTarget = `${authority.manifest.installPolicy.runtimeDirectory}/${RUNTIME_PROTOCOL}/${currentPlatform}/${authority.authorityDigest}`
  return {
    base: contained(authority.root, authority.manifest.installPolicy.runtimeDirectory, 'provider CLI runtime directory'),
    relativeTarget,
    target: contained(authority.root, relativeTarget, 'provider CLI fixture target'),
  }
}

function validateTarget(authority, currentPlatform) {
  const { relativeTarget, target } = runtimePaths(authority, currentPlatform)
  const targetInfo = lstatSync(target)
  invariant(targetInfo.isDirectory() && !targetInfo.isSymbolicLink() && realpathSync(target) === target, 'fixture target is not one real directory')
  invariant(
    JSON.stringify(readdirSync(target).sort()) === JSON.stringify(['fixture-bin', 'receipt.json']),
    'fixture target inventory is not closed',
  )
  const receipt = parseJson(regularBytes(join(target, 'receipt.json'), 'fixture receipt'), 'fixture receipt')
  exactKeys(
    receipt,
    ['schemaVersion', 'kind', 'authorityDigest', 'lockDigest', 'platform', 'executables', 'versions', 'executablesProbed'],
    'fixture receipt',
  )
  const expected = receiptFor(authority, currentPlatform)
  invariant(JSON.stringify(receipt) === JSON.stringify(expected), 'fixture receipt differs from the provider authority')

  const binaryRoot = join(target, 'fixture-bin')
  const binaryInfo = lstatSync(binaryRoot)
  invariant(binaryInfo.isDirectory() && !binaryInfo.isSymbolicLink(), 'fixture binary root is invalid')
  invariant(JSON.stringify(readdirSync(binaryRoot).sort()) === JSON.stringify(authority.executables.map(name => `${name}.mjs`)), 'fixture binary inventory differs from authority')
  const shimRoot = contained(authority.root, authority.manifest.installPolicy.shimDirectory, 'provider CLI shim directory')
  const shimInfo = lstatSync(shimRoot)
  invariant(shimInfo.isDirectory() && !shimInfo.isSymbolicLink(), 'provider CLI shim directory is invalid')
  for (const executable of authority.executables) {
    const binary = join(binaryRoot, `${executable}.mjs`)
    const binaryBytes = regularBytes(binary, `fixture ${executable} poison executable`)
    invariant(binaryBytes.equals(Buffer.from(poisonSource(executable, authority.versions[executable]), 'utf8')), `fixture ${executable} poison executable differs`)
    invariant((lstatSync(binary).mode & 0o111) !== 0, `fixture ${executable} poison executable is not executable`)
    const relativeBinary = `${relativeTarget}/fixture-bin/${executable}.mjs`
    const shim = join(shimRoot, executable)
    const shimBytes = regularBytes(shim, `fixture ${executable} shim`)
    invariant(shimBytes.equals(providerCliFixtureShimBytes(executable, relativeBinary)), `fixture ${executable} shim differs`)
    invariant((lstatSync(shim).mode & 0o111) !== 0, `fixture ${executable} shim is not executable`)
  }
  return Object.freeze({
    authorityDigest: authority.authorityDigest,
    executablesProbed: false,
    lockDigest: authority.lockDigest,
    platform: currentPlatform,
    role: authority.role,
    staticVerified: true,
    status: 'static-verified',
    target,
    versions: null,
  })
}

export function verifyProviderCliToolchainStatic({
  root = process.cwd(),
  platform = process.platform,
  arch = process.arch,
  ...unsupported
} = {}) {
  invariant(Object.keys(unsupported).length === 0, `unsupported static verification options:${Object.keys(unsupported).sort().join(',')}`)
  const authority = authorityAt(root)
  const currentPlatform = platformId(platform, arch)
  invariant(authority.manifest.installPolicy.supportedPlatforms.includes(currentPlatform), `fixture platform is not supported:${currentPlatform}`)
  return validateTarget(authority, currentPlatform)
}

function installFixture(authority, currentPlatform) {
  const { base, relativeTarget, target } = runtimePaths(authority, currentPlatform)
  mkdirSync(dirname(target), { recursive: true, mode: 0o755 })
  mkdirSync(base, { recursive: true, mode: 0o755 })
  const stage = mkdtempSync(join(dirname(target), '.fixture-stage-'))
  try {
    const binaryRoot = join(stage, 'fixture-bin')
    mkdirSync(binaryRoot)
    for (const executable of authority.executables) {
      writeExclusive(
        join(binaryRoot, `${executable}.mjs`),
        Buffer.from(poisonSource(executable, authority.versions[executable]), 'utf8'),
        0o755,
      )
    }
    const receipt = receiptFor(authority, currentPlatform)
    writeExclusive(join(stage, 'receipt.json'), Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8'), 0o600)
    if (process.env.FAKE_PROVIDER_CLI_MODE === 'partial-then-throw') {
      throw new Error(`${ERROR_PREFIX}:fixture requested a partial staging failure`)
    }
    try {
      renameSync(stage, target)
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error?.code)) throw error
    }

    const shimRoot = contained(authority.root, authority.manifest.installPolicy.shimDirectory, 'provider CLI shim directory')
    mkdirSync(shimRoot, { recursive: true, mode: 0o755 })
    for (const executable of authority.executables) {
      const relativeBinary = `${relativeTarget}/fixture-bin/${executable}.mjs`
      const shim = join(shimRoot, executable)
      rmSync(shim, { force: true })
      writeExclusive(shim, providerCliFixtureShimBytes(executable, relativeBinary), 0o755)
    }
    if (process.env.FAKE_PROVIDER_CLI_MODE === 'corrupt-content') {
      writeFileSync(join(target, 'receipt.json'), '{"corrupt":true}\n')
    }
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

export async function setupProviderCliToolchain({
  root = process.cwd(),
  check = false,
  probeExecutables = true,
  platform = process.platform,
  arch = process.arch,
  ...unsupported
} = {}) {
  invariant(Object.keys(unsupported).length === 0, `unsupported setup options:${Object.keys(unsupported).sort().join(',')}`)
  invariant(typeof check === 'boolean', 'fixture check option must be boolean')
  invariant(typeof probeExecutables === 'boolean', 'fixture probeExecutables option must be boolean')
  const authority = authorityAt(root)
  const currentPlatform = platformId(platform, arch)
  invariant(authority.manifest.installPolicy.supportedPlatforms.includes(currentPlatform), `fixture platform is not supported:${currentPlatform}`)
  const { target } = runtimePaths(authority, currentPlatform)
  if (!existsSync(target)) {
    invariant(!check, `fixture provider CLI target is not installed:${target}`)
    installFixture(authority, currentPlatform)
  }
  const result = validateTarget(authority, currentPlatform)
  if (probeExecutables) {
    const first = authority.executables[0]
    const shim = join(authority.root, authority.manifest.installPolicy.shimDirectory, first)
    const { spawnSync } = await import('node:child_process')
    const probe = spawnSync(process.execPath, [shim, '--version'], {
      cwd: authority.root,
      env: process.env,
      shell: false,
      stdio: 'ignore',
    })
    invariant(probe.status === 0, `fixture executable probe ran and failed:${first}:${String(probe.status)}`)
  }
  return Object.freeze({
    ...result,
    executablesProbed: probeExecutables,
    status: check ? 'ready' : 'installed',
  })
}

export function providerCliSyncFixtureSourceIdentity() {
  return Object.freeze({
    kind: PROVIDER_CLI_SYNC_FIXTURE_RECEIPT_KIND,
    runtimeProtocol: RUNTIME_PROTOCOL,
    shimMarker: PROVIDER_CLI_SYNC_FIXTURE_SHIM_MARKER,
  })
}

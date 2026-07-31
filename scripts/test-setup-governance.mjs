#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import {
  SETUP_GOVERNANCE_EXACT_NPM_VERSION,
  SETUP_GOVERNANCE_MINIMUM_NODE_VERSION,
  SETUP_GOVERNANCE_NPM_STEPS,
  SETUP_GOVERNANCE_REQUIRED_EXECUTABLES,
  SETUP_GOVERNANCE_SCRIPT,
  assertSupportedSetupPlatform,
  assertSupportedSetupRuntime,
  runGovernanceDependencySetup,
  runGovernanceSetup,
} from './setup-governance.mjs'
import { buildCorpus } from './build-fork-governance.mjs'
import { mergeRequiredPackageScripts } from './refresh-fork-launchers.mjs'
import { PRODUCT_TEMPLATE_PACKAGE_LOCK_GENERATOR } from './product-template-scaffold-lock.mjs'
import {
  PROTECTED_CONTROL_PLANE_EXACT_PATHS,
  PROTECTED_CONTROL_PLANE_PATH_PREFIXES,
} from './lib/consumer-control-plane-policy.mjs'
import { evaluateVerifiedHighVulnerabilityAudit } from './lib/governance-dependency-bootstrap.mjs'

const temporary = []
const version = '1.2.3-beta.4'
const exactNpmVersion = '11.18.0'
const exactNpmIntegrity = 'sha512-T67M4L5wNm0cZ7EBLErcEkY1SmzEW/WJ+SADBzsFUY1UdAPfFHXFQtZ6SEXiK0+vzXysCvAsepbMaBTwnrAD+w=='
const exactNpmOverlaySpec = 'npm:brace-expansion@5.0.8'
const exactNpmOverlayIntegrity = 'sha512-JZyDyq3D4AUifKTPOB7DELf6XsB3WdPuNxCtob1vFXPsSXhdAiHBWJ/tJ8HAc9aH84BK+5JFZLNkJKx3G9kzQg=='

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function write(path, body, mode = 0o644) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
  chmodSync(path, mode)
}

function fixture({
  dependencyOnly = false,
  failStage = '',
  poison = '',
  preexistingNodeModules = false,
  tamperCheckerAfterSnapshot = false,
} = {}) {
  const base = mkdtempSync(join(tmpdir(), 'governance setup harness '))
  temporary.push(base)
  const root = join(base, 'consumer repo with spaces')
  const bin = join(base, 'poisoned PATH bin')
  const runtimeRoot = join(base, 'independently verified runtime')
  const runtimeCli = join(runtimeRoot, 'npm-cli.mjs')
  const log = join(base, 'ordered steps.log')
  const configLog = join(base, 'isolated config paths.log')
  const poisonedUserConfig = join(base, 'poisoned-user.npmrc')
  const poisonedGlobalConfig = join(base, 'poisoned-global.npmrc')
  mkdirSync(join(root, 'scripts/lib'), { recursive: true })
  mkdirSync(bin, { recursive: true })
  mkdirSync(runtimeRoot, { recursive: true })
  copyFileSync('scripts/setup-governance.mjs', join(root, 'scripts/setup-governance.mjs'))
  copyFileSync('scripts/lib/governance-dependency-bootstrap.mjs', join(root, 'scripts/lib/governance-dependency-bootstrap.mjs'))
  copyFileSync('packages/governance/src/closed-tool-execution.mjs', join(root, 'scripts/lib/closed-tool-execution.mjs'))
  copyFileSync('scripts/lib/verified-exact-npm-runtime.mjs', join(root, 'scripts/lib/verified-exact-npm-runtime.mjs'))
  copyFileSync('scripts/lib/worktree-fingerprint.mjs', join(root, 'scripts/lib/worktree-fingerprint.mjs'))
  copyFileSync('scripts/lib/provider-lifecycle.mjs', join(root, 'scripts/lib/provider-lifecycle.mjs'))
  write(poisonedUserConfig, 'registry=https://attacker.invalid/\nignore-scripts=false\n')
  write(poisonedGlobalConfig, 'registry=https://attacker.invalid/\nstrict-ssl=false\n')

  const dependencies = {
    '@qijenchen/design-system': version,
    '@qijenchen/storybook-config': version,
  }
  const devDependencies = {
    npm: exactNpmVersion,
    'npm-runtime-brace-expansion-patch': exactNpmOverlaySpec,
  }
  const engines = { node: `>=${SETUP_GOVERNANCE_MINIMUM_NODE_VERSION}`, npm: '>=10.0.0' }
  write(join(root, 'package.json'), `${JSON.stringify({
    name: 'clean-room-product',
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: { 'setup:governance': SETUP_GOVERNANCE_SCRIPT },
    dependencies,
    devDependencies,
    engines,
  }, null, 2)}\n`)
  write(join(root, 'package-lock.json'), `${JSON.stringify({
    name: 'clean-room-product',
    version: '0.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': { name: 'clean-room-product', version: '0.0.0', dependencies, devDependencies, engines },
      'node_modules/npm': {
        version: exactNpmVersion,
        resolved: `https://registry.npmjs.org/npm/-/npm-${exactNpmVersion}.tgz`,
        integrity: exactNpmIntegrity,
        dev: true,
        bin: { npm: 'bin/npm-cli.js', npx: 'bin/npx-cli.js' },
      },
      'node_modules/npm-runtime-brace-expansion-patch': {
        name: 'brace-expansion',
        version: '5.0.8',
        resolved: 'https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.8.tgz',
        integrity: exactNpmOverlayIntegrity,
        dev: true,
      },
    },
  }, null, 2)}\n`)
  write(join(root, '.npmrc'), '# canonical product install settings\nlegacy-peer-deps=true\nignore-scripts=true\n')
  write(join(root, '.gitignore'), 'node_modules/\n')
  write(join(root, 'governance/future-source.json'), '{"state":"safe"}\n')
  if (preexistingNodeModules) {
    write(join(root, 'node_modules/preexisting/sentinel.txt'), 'before-image\n')
  }

  write(join(bin, 'npm'), `#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
appendFileSync(process.env.FAKE_SETUP_LOG, 'POISONED-PATH-NPM-WAS-EXECUTED\\n')
process.exit(97)
`, 0o755)
  for (const executable of ['bash', 'git', 'jq', 'python3']) {
    write(join(bin, executable), `#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
appendFileSync(process.env.FAKE_SETUP_LOG, 'POISONED-PATH-${executable.toUpperCase()}-WAS-EXECUTED\\n')
process.exit(97)
`, 0o755)
  }

  const fakeChecker = `#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
appendFileSync(process.env.FAKE_SETUP_LOG, \`check:\${process.argv.slice(2).join(' ')}\\n\`)
if (Object.keys(process.env).some(name => /^npm_config_/i.test(name) && !['npm_config_userconfig', 'npm_config_globalconfig', 'npm_config_registry', 'npm_config_ignore_scripts'].includes(name.toLowerCase()))) process.exit(35)
if (['NPM_TOKEN', 'NODE_AUTH_TOKEN', 'NODE_OPTIONS', 'NODE_PATH', 'HTTPS_PROXY', 'SSL_CERT_FILE', 'NODE_TLS_REJECT_UNAUTHORIZED', 'BASH_ENV', 'GIT_CONFIG_GLOBAL', 'ANTHROPIC_API_KEY'].some(name => process.env[name])) process.exit(35)
if (process.env.FAKE_SETUP_FAIL_STAGE === 'check') process.exit(34)
`
  const governanceSchema = '{}\n'
  const corpusLock = `${JSON.stringify({
    schemaVersion: 1,
    kind: 'fork-governance-corpus-lock',
    hashAlgorithm: 'sha256',
    entries: [{
      schemaVersion: 1,
      file: 'consumer/governance-check.mjs',
      sha256: sha256(fakeChecker),
      classification: 'consumer',
      source: 'consumer/governance-check.mjs',
      destination: 'consumer/governance-check.mjs',
    }],
  }, null, 2)}\n`
  const governanceLock = `${JSON.stringify({
    payload: {
      forkCorpusLockSha256: sha256(corpusLock),
      governanceCheckSha256: sha256(fakeChecker),
    },
  }, null, 2)}\n`
  write(join(root, 'governance/lock.json'), governanceLock)
  write(join(root, 'governance/lock.schema.json'), governanceSchema)

  write(runtimeCli, `#!/usr/bin/env node
import { appendFileSync, chmodSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
const args = process.argv.slice(2)
appendFileSync(process.env.FAKE_SETUP_LOG, \`verified-npm:\${args.join(' ')}\\n\`)
const configPaths = [process.env.NPM_CONFIG_USERCONFIG, process.env.NPM_CONFIG_GLOBALCONFIG]
const expectedConfig = 'registry=https://registry.npmjs.org/\\nignore-scripts=true\\nstrict-ssl=true\\nalways-auth=false\\n'
const allowedNpmConfig = new Set(['npm_config_userconfig', 'npm_config_globalconfig', 'npm_config_registry', 'npm_config_ignore_scripts', 'npm_config_strict_ssl', 'npm_config_always_auth', 'npm_config_audit_level'])
const configIsolated = configPaths.every(path => {
  try {
    const info = lstatSync(path)
    return info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && readFileSync(path, 'utf8') === expectedConfig
  } catch { return false }
}) && !configPaths.includes(process.env.FAKE_SETUP_POISONED_USER) && !configPaths.includes(process.env.FAKE_SETUP_POISONED_GLOBAL)
  && !Object.keys(process.env).some(name => /^npm_config_/i.test(name) && !allowedNpmConfig.has(name.toLowerCase()))
  && !['NPM_TOKEN', 'NODE_AUTH_TOKEN', 'NODE_OPTIONS', 'NODE_PATH', 'HTTPS_PROXY', 'SSL_CERT_FILE', 'NODE_TLS_REJECT_UNAUTHORIZED', 'BASH_ENV', 'GIT_CONFIG_GLOBAL', 'ANTHROPIC_API_KEY'].some(name => process.env[name])
if (!configIsolated || process.env.NPM_CONFIG_REGISTRY !== 'https://registry.npmjs.org/' || process.env.NPM_CONFIG_IGNORE_SCRIPTS !== 'true' || !args.includes('--registry=https://registry.npmjs.org/')) process.exit(35)
appendFileSync(process.env.FAKE_SETUP_CONFIG_LOG, \`\${configPaths.join('\\n')}\\n\`)
const stage = args[0] === 'ci'
  ? 'install'
  : args[0] === 'audit' && args[1] === 'signatures'
    ? 'signature'
    : args[0] === 'audit' && args[1] === '--audit-level=high'
      ? 'vulnerability'
      : 'unexpected'
if (stage === process.env.FAKE_SETUP_FAIL_STAGE) process.exit(stage === 'install' ? 31 : stage === 'signature' ? 32 : 33)
if (stage === 'signature') process.exit(0)
if (stage === 'vulnerability') {
  console.log(JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
      dependencies: { prod: 0, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 0 },
    },
  }))
  process.exit(0)
}
if (stage !== 'install') process.exit(91)

// Deliberately install a perfect-looking but malicious project-local npm. Setup must never execute it.
const installedNpmRoot = join(process.cwd(), 'node_modules/npm')
mkdirSync(join(installedNpmRoot, 'bin'), { recursive: true })
writeFileSync(join(installedNpmRoot, 'package.json'), JSON.stringify({ name: 'npm', version: process.env.FAKE_SETUP_NPM_VERSION, bin: { npm: 'bin/npm-cli.js' } }) + '\\n')
writeFileSync(join(installedNpmRoot, 'bin/npm-cli.js'), \`#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
appendFileSync(process.env.FAKE_SETUP_LOG, 'POISONED-INSTALLED-NPM-WAS-EXECUTED\\\\n')
if (process.argv[2] === '--version') console.log('${exactNpmVersion}')
process.exit(0)
\`)
chmodSync(join(installedNpmRoot, 'bin/npm-cli.js'), 0o755)

const checker = join(process.cwd(), 'node_modules/@qijenchen/design-system/ds-canonical/fork/consumer/governance-check.mjs')
mkdirSync(dirname(checker), { recursive: true })
writeFileSync(checker, process.env.FAKE_SETUP_CHECKER_SOURCE)
chmodSync(checker, 0o755)
const installedFork = join(process.cwd(), 'node_modules/@qijenchen/design-system/ds-canonical/fork')
writeFileSync(join(installedFork, 'governance.lock'), process.env.FAKE_SETUP_CORPUS_LOCK)
writeFileSync(join(installedFork, 'consumer/lock.json'), process.env.FAKE_SETUP_GOVERNANCE_LOCK)
writeFileSync(join(installedFork, 'consumer/lock.schema.json'), process.env.FAKE_SETUP_GOVERNANCE_SCHEMA)
if (process.env.FAKE_SETUP_POISON === 'bootstrap-manifest-mutation') {
  const path = join(process.cwd(), 'package.json')
  const body = JSON.parse(readFileSync(path, 'utf8'))
  body.devDependencies.npm = '99.0.0'
  writeFileSync(path, JSON.stringify(body, null, 2) + '\\n')
}
if (process.env.FAKE_SETUP_POISON === 'bootstrap-lock-mutation') {
  const path = join(process.cwd(), 'package-lock.json')
  const body = JSON.parse(readFileSync(path, 'utf8'))
  body.packages[''].devDependencies.npm = '99.0.0'
  writeFileSync(path, JSON.stringify(body, null, 2) + '\\n')
}
if (process.env.FAKE_SETUP_POISON === 'bootstrap-script-mutation') {
  const path = join(process.cwd(), 'scripts/setup-governance.mjs')
  writeFileSync(path, readFileSync(path, 'utf8') + '\\n// bootstrap mutation\\n')
}
if (process.env.FAKE_SETUP_POISON === 'bootstrap-runtime-lib-mutation') {
  const path = join(process.cwd(), 'scripts/lib/verified-exact-npm-runtime.mjs')
  writeFileSync(path, readFileSync(path, 'utf8') + '\\n// bootstrap mutation\\n')
}
if (process.env.FAKE_SETUP_POISON === 'bootstrap-shared-lib-mutation') {
  const path = join(process.cwd(), 'scripts/lib/governance-dependency-bootstrap.mjs')
  writeFileSync(path, readFileSync(path, 'utf8') + '\\n// bootstrap mutation\\n')
}
if (process.env.FAKE_SETUP_POISON === 'bootstrap-closed-tool-mutation') {
  const path = join(process.cwd(), 'scripts/lib/closed-tool-execution.mjs')
  writeFileSync(path, readFileSync(path, 'utf8') + '\\n// bootstrap mutation\\n')
}
if (process.env.FAKE_SETUP_POISON === 'future-governance-source-mutation') {
  const path = join(process.cwd(), 'governance/future-source.json')
  writeFileSync(path, '{"state":"poisoned"}\\n')
}
`, 0o755)

  const runner = join(root, 'test-runner.mjs')
  write(runner, `#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ${dependencyOnly ? 'runGovernanceDependencySetup' : 'runGovernanceSetup'} as runSetup } from './scripts/setup-governance.mjs'
import { resolveExactNpmRuntimeContract } from './scripts/lib/verified-exact-npm-runtime.mjs'
const runtimeFactory = async () => {
  appendFileSync(process.env.FAKE_SETUP_LOG, 'runtime-factory\\n')
  if (process.env.FAKE_SETUP_FAIL_STAGE === 'runtime') throw new Error('deliberate verified runtime failure')
  const contract = resolveExactNpmRuntimeContract(process.cwd())
  const overlay = {
    schemaVersion: 1,
    kind: 'verified-npm-runtime-security-overlay-receipt',
    status: 'applied',
    identityDigest: contract.securityOverlay.identityDigest,
    npmVersion: contract.version,
    package: contract.securityOverlay.package,
    version: contract.securityOverlay.version,
    integrity: contract.securityOverlay.integrity,
    target: contract.securityOverlay.target,
    replacedVersion: contract.securityOverlay.replacedVersion,
    consumer: contract.securityOverlay.consumer,
    consumerVersion: contract.securityOverlay.consumerVersion,
    treeDigest: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  }
  const installedOverlay = {
    schemaVersion: 1,
    kind: 'verified-installed-npm-security-overlay-receipt',
    status: 'verified',
    identityDigest: overlay.identityDigest,
    npmVersion: overlay.npmVersion,
    package: overlay.package,
    version: overlay.version,
    integrity: overlay.integrity,
    target: overlay.target,
    treeDigest: overlay.treeDigest,
    auditClosureDigest: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    auditClosure: [
      { path: 'node_modules/brace-expansion', name: 'brace-expansion', version: '5.0.8', dependency: null },
      { path: 'node_modules/minimatch', name: 'minimatch', version: '10.2.5', dependency: { name: 'brace-expansion', range: '^5.0.5' } },
      { path: 'node_modules/npm-runtime-brace-expansion-patch', name: 'brace-expansion', version: '5.0.8', dependency: null },
    ],
  }
  return {
    artifact: {
      ...contract,
      integrity: process.env.FAKE_SETUP_FAIL_STAGE === 'runtime-artifact' ? 'sha512-AAAAAAAA' : contract.integrity,
    },
    cli: process.env.FAKE_SETUP_RUNTIME_CLI,
    securityOverlay: overlay,
    toolchain: { node: process.version, npm: process.env.FAKE_SETUP_NPM_VERSION },
    applyInstalledSecurityOverlay() { return installedOverlay },
    verifyInstalledSecurityOverlay() { return installedOverlay },
    cleanup() { appendFileSync(process.env.FAKE_SETUP_LOG, 'runtime-cleanup\\n') },
  }
}
const runner = (command, args, options) => {
  if (
    process.env.FAKE_SETUP_TAMPER_CHECKER_AFTER_SNAPSHOT === '1'
    && args?.[0]?.includes('qijenchen-governance-checker-')
  ) {
    const liveChecker = join(process.cwd(), 'node_modules/@qijenchen/design-system/ds-canonical/fork/consumer/governance-check.mjs')
    writeFileSync(liveChecker, \`#!/usr/bin/env node
import { appendFileSync } from "node:fs"
appendFileSync(process.env.FAKE_SETUP_LOG, "TAMPERED-LIVE-CHECKER-WAS-EXECUTED\\\\n")
\`)
  }
  return spawnSync(command, args, options)
}
try {
  await runSetup({ root: process.cwd(), runtimeFactory, runner })
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
`)

  const gitInit = spawnSync('git', ['init', '--quiet'], { cwd: root, encoding: 'utf8', shell: false })
  assert.equal(gitInit.status, 0, gitInit.stderr)
  const gitAdd = spawnSync('git', ['add', '.'], { cwd: root, encoding: 'utf8', shell: false })
  assert.equal(gitAdd.status, 0, gitAdd.stderr)

  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH || ''}`,
    FAKE_SETUP_LOG: log,
    FAKE_SETUP_CONFIG_LOG: configLog,
    FAKE_SETUP_FAIL_STAGE: failStage,
    FAKE_SETUP_POISON: poison,
    FAKE_SETUP_NPM_VERSION: exactNpmVersion,
    FAKE_SETUP_RUNTIME_CLI: runtimeCli,
    FAKE_SETUP_TAMPER_CHECKER_AFTER_SNAPSHOT: tamperCheckerAfterSnapshot ? '1' : '0',
    FAKE_SETUP_CHECKER_SOURCE: fakeChecker,
    FAKE_SETUP_CORPUS_LOCK: corpusLock,
    FAKE_SETUP_GOVERNANCE_LOCK: governanceLock,
    FAKE_SETUP_GOVERNANCE_SCHEMA: governanceSchema,
    FAKE_SETUP_POISONED_USER: poisonedUserConfig,
    FAKE_SETUP_POISONED_GLOBAL: poisonedGlobalConfig,
    NPM_CONFIG_USERCONFIG: poisonedUserConfig,
    NPM_CONFIG_GLOBALCONFIG: poisonedGlobalConfig,
    npm_config_userconfig: poisonedUserConfig,
    npm_config_globalconfig: poisonedGlobalConfig,
    NPM_CONFIG_REGISTRY: 'https://attacker.invalid/',
    npm_config_cache: join(base, 'attacker-cache'),
    NPM_TOKEN: 'must-not-reach-child',
    NODE_AUTH_TOKEN: 'must-not-reach-child',
    NODE_OPTIONS: '--no-warnings',
    NODE_PATH: join(base, 'attacker-node-path'),
    HTTPS_PROXY: 'https://attacker.invalid/',
    SSL_CERT_FILE: join(base, 'attacker-ca.pem'),
    NODE_TLS_REJECT_UNAUTHORIZED: '0',
    BASH_ENV: join(base, 'attacker-bash-env'),
    GIT_CONFIG_GLOBAL: join(base, 'attacker-gitconfig'),
    ANTHROPIC_API_KEY: 'must-not-reach-child',
  }
  const execute = () => spawnSync(process.execPath, ['--', runner], { cwd: root, env, encoding: 'utf8' })
  const ordered = () => {
    try { return readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) } catch { return [] }
  }
  const configs = () => {
    try { return readFileSync(configLog, 'utf8').trim().split('\n').filter(Boolean) } catch { return [] }
  }
  const transactionRoots = () => readdirSync(base)
    .filter(name => name.startsWith('.consumer repo with spaces.governance-setup-'))
  return {
    configs,
    execute,
    ordered,
    poisonedGlobalConfig,
    poisonedUserConfig,
    root: realpathSync(root),
    transactionRoots,
  }
}

test.after(() => {
  for (const path of temporary) rmSync(path, { recursive: true, force: true })
})

test('verified runtime performs install, signature audit and high-vulnerability audit; PATH and installed npm are never authorities', () => {
  const value = fixture()
  const result = value.execute()
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  assert.deepEqual(value.ordered(), [
    'runtime-factory',
    'verified-npm:ci --legacy-peer-deps --ignore-scripts --registry=https://registry.npmjs.org/',
    'verified-npm:audit signatures --registry=https://registry.npmjs.org/',
    'verified-npm:audit --audit-level=high --json --registry=https://registry.npmjs.org/',
    'runtime-cleanup',
    `check:--repo ${value.root} --hooks-off`,
  ])
  const configPaths = value.configs()
  assert.equal(configPaths.length, 6)
  assert.equal(new Set(configPaths).size, 2)
  assert.ok(configPaths.every(path => !existsSync(path)), 'isolated npm config directory must be removed')
  assert.ok(existsSync(value.poisonedUserConfig) && existsSync(value.poisonedGlobalConfig), 'poison fixtures must not be used or removed')
})

test('dependency-only setup authenticates dependencies without executing installed candidate code', () => {
  assert.equal(typeof runGovernanceDependencySetup, 'function')
  const value = fixture({ dependencyOnly: true })
  const result = value.execute()
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  assert.deepEqual(value.ordered(), [
    'runtime-factory',
    'verified-npm:ci --legacy-peer-deps --ignore-scripts --registry=https://registry.npmjs.org/',
    'verified-npm:audit signatures --registry=https://registry.npmjs.org/',
    'verified-npm:audit --audit-level=high --json --registry=https://registry.npmjs.org/',
    'runtime-cleanup',
  ])
  assert.equal(value.ordered().some(step => step.startsWith('check:')), false)
})

for (const stage of ['install', 'signature', 'vulnerability', 'check']) {
  test(`${stage} failure restores the exact preexisting node_modules before-image`, () => {
    const value = fixture({ failStage: stage, preexistingNodeModules: true })
    const result = value.execute()
    assert.notEqual(result.status, 0)
    assert.equal(
      readFileSync(join(value.root, 'node_modules/preexisting/sentinel.txt'), 'utf8'),
      'before-image\n',
    )
    assert.equal(
      existsSync(join(value.root, 'node_modules/@qijenchen/design-system/ds-canonical/fork/consumer/governance-check.mjs')),
      false,
    )
    assert.deepEqual(value.transactionRoots(), [])
  })
}

test('successful setup replaces the preexisting node_modules tree and removes recovery state', () => {
  const value = fixture({ preexistingNodeModules: true })
  const result = value.execute()
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  assert.equal(existsSync(join(value.root, 'node_modules/preexisting/sentinel.txt')), false)
  assert.equal(
    existsSync(join(value.root, 'node_modules/@qijenchen/design-system/ds-canonical/fork/consumer/governance-check.mjs')),
    true,
  )
  assert.deepEqual(value.transactionRoots(), [])
})

test('checker executes only the authenticated private snapshot and live closure tamper fails CAS with rollback', () => {
  const value = fixture({
    preexistingNodeModules: true,
    tamperCheckerAfterSnapshot: true,
  })
  const result = value.execute()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /installed checker closure changed after authenticated snapshot/)
  assert.equal(
    value.ordered().includes('TAMPERED-LIVE-CHECKER-WAS-EXECUTED'),
    false,
  )
  assert.equal(
    readFileSync(join(value.root, 'node_modules/preexisting/sentinel.txt'), 'utf8'),
    'before-image\n',
  )
  assert.deepEqual(value.transactionRoots(), [])
})

for (const [stage, expected] of [
  ['runtime', ['runtime-factory']],
  ['runtime-artifact', ['runtime-factory', 'runtime-cleanup']],
  ['install', [
    'runtime-factory',
    'verified-npm:ci --legacy-peer-deps --ignore-scripts --registry=https://registry.npmjs.org/',
    'runtime-cleanup',
  ]],
  ['signature', [
    'runtime-factory',
    'verified-npm:ci --legacy-peer-deps --ignore-scripts --registry=https://registry.npmjs.org/',
    'verified-npm:audit signatures --registry=https://registry.npmjs.org/',
    'runtime-cleanup',
  ]],
  ['vulnerability', [
    'runtime-factory',
    'verified-npm:ci --legacy-peer-deps --ignore-scripts --registry=https://registry.npmjs.org/',
    'verified-npm:audit signatures --registry=https://registry.npmjs.org/',
    'verified-npm:audit --audit-level=high --json --registry=https://registry.npmjs.org/',
    'runtime-cleanup',
  ]],
  ['check', null],
]) {
  test(`${stage} failure stops setup and fails closed`, () => {
    const value = fixture({ failStage: stage })
    const result = value.execute()
    assert.notEqual(result.status, 0, `${stage} failure unexpectedly passed`)
    const expectedSteps = expected || [
      'runtime-factory',
      'verified-npm:ci --legacy-peer-deps --ignore-scripts --registry=https://registry.npmjs.org/',
      'verified-npm:audit signatures --registry=https://registry.npmjs.org/',
      'verified-npm:audit --audit-level=high --json --registry=https://registry.npmjs.org/',
      'runtime-cleanup',
      `check:--repo ${value.root} --hooks-off`,
    ]
    assert.deepEqual(value.ordered(), expectedSteps)
    assert.ok(value.configs().every(path => !existsSync(path)), 'isolated npm config directory must be removed after failure')
  })
}

test('missing committed lock fails before runtime preparation', () => {
  const value = fixture()
  rmSync(join(value.root, 'package-lock.json'))
  const result = value.execute()
  assert.notEqual(result.status, 0)
  assert.deepEqual(value.ordered(), [])
})

test('root npm shrinkwrap is rejected before runtime preparation because package-lock is the sole lock authority', () => {
  const value = fixture()
  writeFileSync(join(value.root, 'npm-shrinkwrap.json'), '{"lockfileVersion":3,"packages":{}}\n')
  const result = value.execute()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /npm-shrinkwrap\.json is forbidden/)
  assert.deepEqual(value.ordered(), [])
})

for (const [poison, path] of [
  ['bootstrap-manifest-mutation', 'package.json'],
  ['bootstrap-lock-mutation', 'package-lock.json'],
  ['bootstrap-script-mutation', 'scripts/setup-governance.mjs'],
  ['bootstrap-runtime-lib-mutation', 'scripts/lib/verified-exact-npm-runtime.mjs'],
  ['bootstrap-shared-lib-mutation', 'scripts/lib/governance-dependency-bootstrap.mjs'],
  ['bootstrap-closed-tool-mutation', 'scripts/lib/closed-tool-execution.mjs'],
]) {
  test(`${poison} is detected before signature audit`, () => {
    const value = fixture({ poison })
    const result = value.execute()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, new RegExp(`bootstrap install mutated committed setup authority:${path.replace('.', '\\.').replace('/', '\\/')}`))
    assert.deepEqual(value.ordered(), [
      'runtime-factory',
      'verified-npm:ci --legacy-peer-deps --ignore-scripts --registry=https://registry.npmjs.org/',
      'runtime-cleanup',
    ])
  })
}

test('a future tracked governance source outside the static setup list cannot be poisoned by install', () => {
  const value = fixture({ poison: 'future-governance-source-mutation' })
  const result = value.execute()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /consumer dependency stage 1 mutated the Git-visible caller worktree/)
  assert.deepEqual(value.ordered(), [
    'runtime-factory',
    'verified-npm:ci --legacy-peer-deps --ignore-scripts --registry=https://registry.npmjs.org/',
    'runtime-cleanup',
  ])
})

for (const [label, mutate, message] of [
  ['ranged manifest npm', (manifest) => { manifest.devDependencies.npm = '^11.18.0' }, /package\.json must pin npm 11\.18\.0/],
  ['root lock mismatch', (_manifest, lock) => { lock.packages[''].devDependencies.npm = '11.17.0' }, /package-lock\.json root must pin npm 11\.18\.0/],
  ['noncanonical npm tarball', (_manifest, lock) => { lock.packages['node_modules/npm'].resolved = 'https://attacker.invalid/npm.tgz' }, /not the canonical registry tarball/],
  ['missing npm integrity', (_manifest, lock) => { delete lock.packages['node_modules/npm'].integrity }, /missing canonical SHA-512 integrity/],
  ['npm CLI lock drift', (_manifest, lock) => { lock.packages['node_modules/npm'].bin.npm = 'bin/attacker.js' }, /does not bind bin\/npm-cli\.js/],
]) {
  test(`${label} fails before runtime preparation`, () => {
    const value = fixture()
    const manifestPath = join(value.root, 'package.json')
    const lockPath = join(value.root, 'package-lock.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    mutate(manifest, lock)
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
    const result = value.execute()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, message)
    assert.deepEqual(value.ordered(), [])
  })
}

test('project npm config injection fails before runtime preparation', () => {
  const value = fixture()
  writeFileSync(join(value.root, '.npmrc'), 'legacy-peer-deps=true\nignore-scripts=true\nregistry=https://attacker.invalid/\n')
  const result = value.execute()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /\.npmrc must contain only the canonical/)
  assert.deepEqual(value.ordered(), [])
})

test('platform and command contract is closed and native Windows is unsupported', () => {
  assert.equal(assertSupportedSetupPlatform('darwin'), 'darwin')
  assert.equal(assertSupportedSetupPlatform('linux'), 'linux')
  assert.throws(() => assertSupportedSetupPlatform('win32'), /native Windows is unsupported/)
  assert.deepEqual(SETUP_GOVERNANCE_NPM_STEPS, [
    ['ci', '--legacy-peer-deps', '--ignore-scripts', '--registry=https://registry.npmjs.org/'],
    ['audit', 'signatures', '--registry=https://registry.npmjs.org/'],
    ['audit', '--audit-level=high', '--json', '--registry=https://registry.npmjs.org/'],
  ])
  const source = readFileSync('scripts/setup-governance.mjs', 'utf8')
  const bootstrapSource = readFileSync('scripts/lib/governance-dependency-bootstrap.mjs', 'utf8')
  assert.doesNotMatch(source, /@(?:beta|latest)|\bplugin\b/)
  assert.match(source, /runVerifiedGovernanceDependencyBootstrap/)
  assert.match(bootstrapSource, /prepareVerifiedExactNpmRuntime/)
  assert.match(bootstrapSource, /for \(let index = 0; index < GOVERNANCE_DEPENDENCY_NPM_STEPS\.length; index \+= 1\)/)
  assert.match(bootstrapSource, /runVerifiedHighVulnerabilityAudit\(process\.execPath, \[npmRuntime\.cli, \.\.\.args\]/)
  assert.doesNotMatch(source, /node_modules\/npm\/bin\/npm-cli\.js/)
})

test('overlay-aware high audit excludes only the exact verified bundled preimage and otherwise fails closed', () => {
  const identityDigest = 'a'.repeat(64)
  const treeDigest = 'b'.repeat(64)
  const npmRuntime = {
    securityOverlay: {
      status: 'applied',
      identityDigest,
      treeDigest,
    },
  }
  const installedOverlayReceipt = {
    status: 'verified',
    identityDigest,
    treeDigest,
    auditClosureDigest: 'c'.repeat(64),
    auditClosure: [
      { path: 'node_modules/brace-expansion', name: 'brace-expansion', version: '5.0.8', dependency: null },
      { path: 'node_modules/minimatch', name: 'minimatch', version: '10.2.5', dependency: { name: 'brace-expansion', range: '^5.0.5' } },
      { path: 'node_modules/npm-runtime-brace-expansion-patch', name: 'brace-expansion', version: '5.0.8', dependency: null },
      { path: 'node_modules/eslint', name: 'eslint', version: '10.8.0', dependency: { name: 'minimatch', range: '^10.2.5' } },
    ],
  }
  const finding = {
    name: 'brace-expansion',
    severity: 'high',
    isDirect: false,
    via: [{
      source: 1124334,
      name: 'brace-expansion',
      dependency: 'brace-expansion',
      title: 'fixture title is non-authoritative',
      url: 'https://github.com/advisories/GHSA-mh99-v99m-4gvg',
      severity: 'high',
      range: '<=5.0.7',
    }],
    effects: [],
    range: '<=5.0.7',
    nodes: ['node_modules/npm/node_modules/brace-expansion'],
    fixAvailable: true,
  }
  const report = {
    auditReportVersion: 2,
    vulnerabilities: { 'brace-expansion': finding },
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 2, high: 1, critical: 0, total: 3 },
      dependencies: { prod: 0, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 0 },
    },
  }
  const evaluate = (value = report, options = {}) => evaluateVerifiedHighVulnerabilityAudit({
    stdout: typeof value === 'string' ? value : JSON.stringify(value),
    exitStatus: options.exitStatus ?? 1,
    npmRuntime: options.npmRuntime ?? npmRuntime,
    installedOverlayReceipt: options.installedOverlayReceipt ?? installedOverlayReceipt,
  })
  const receipt = evaluate()
  assert.deepEqual(receipt.remediatedFindings, ['brace-expansion'])
  assert.equal(receipt.effectiveHigh, 0)
  assert.equal(receipt.effectiveCritical, 0)

  const wrongPath = structuredClone(report)
  wrongPath.vulnerabilities['brace-expansion'].nodes = ['node_modules/brace-expansion']
  assert.throws(() => evaluate(wrongPath), /exact remediated bundled preimage/)

  const wrongSource = structuredClone(report)
  wrongSource.vulnerabilities['brace-expansion'].via[0].source = 999
  assert.throws(() => evaluate(wrongSource), /exact remediated bundled preimage/)

  const extraHigh = structuredClone(report)
  extraHigh.vulnerabilities.unknown = {
    name: 'unknown',
    severity: 'high',
    isDirect: false,
    via: [],
    effects: [],
    range: '*',
    nodes: ['node_modules/unknown'],
  }
  extraHigh.metadata.vulnerabilities.high = 2
  extraHigh.metadata.vulnerabilities.total = 4
  assert.throws(() => evaluate(extraHigh), /unremediated high finding:unknown/)

  assert.throws(() => evaluate('not-json'), /did not produce closed JSON/)
  assert.throws(() => evaluate(report, { exitStatus: 0 }), /exit status differs/)
  assert.throws(
    () => evaluate(report, {
      installedOverlayReceipt: { ...installedOverlayReceipt, identityDigest: 'd'.repeat(64) },
    }),
    /matching runtime and installed-tree receipts/,
  )
})

test('runtime prerequisites fail before any verified-runtime acquisition or repository mutation', async () => {
  const present = (_command, _args, options) => {
    assert.equal(options.shell, false)
    return { status: 0 }
  }
  assert.deepEqual(assertSupportedSetupRuntime({ platform: 'linux', nodeVersion: '22.13.0', runner: present }), {
    platform: 'linux',
    nodeVersion: '22.13.0',
    executables: [...SETUP_GOVERNANCE_REQUIRED_EXECUTABLES],
  })
  assert.deepEqual(assertSupportedSetupRuntime({ platform: 'linux', nodeVersion: '23.0.0', runner: present }).nodeVersion, '23.0.0')
  assert.throws(() => assertSupportedSetupRuntime({ platform: 'linux', nodeVersion: '22.12.99', runner: present }), /Node\.js 22\.13\.0 or newer/)
  assert.throws(() => assertSupportedSetupRuntime({ platform: 'linux', nodeVersion: '22.13.0-rc.1', runner: present }), /Node\.js 22\.13\.0 or newer/)
  assert.throws(() => assertSupportedSetupRuntime({ platform: 'linux', nodeVersion: 'not-a-version', runner: present }), /Node\.js 22\.13\.0 or newer/)
  assert.throws(
    () => assertSupportedSetupRuntime({
      platform: 'linux',
      nodeVersion: '22.13.0',
      runner: command => ({ status: command.endsWith('/jq') || command.endsWith('/python3') ? 127 : 0 }),
    }),
    /missing required setup executables: jq, python3/,
  )
  let runtimeFactoryCalled = false
  await assert.rejects(
    () => runGovernanceSetup({
      root: process.cwd(),
      platform: 'linux',
      nodeVersion: '22.12.0',
      runner: present,
      runtimeFactory: async () => { runtimeFactoryCalled = true },
    }),
    /Node\.js 22\.13\.0 or newer/,
  )
  assert.equal(runtimeFactoryCalled, false)
})

test('canonical execution runtime is the single machine SSOT for setup, package engines, cloud CI and devcontainer fail-closed setup', () => {
  const wiring = JSON.parse(readFileSync('packages/design-system/ds-canonical/templates/product-provider-wiring.json', 'utf8'))
  const wiringSchema = JSON.parse(readFileSync('packages/design-system/ds-canonical/templates/product-provider-wiring.schema.json', 'utf8'))
  const runtime = wiring.executionRuntime
  assert.equal(wiring.schemaVersion, 7)
  assert.equal(wiringSchema.$id, 'https://qijenchen.dev/schemas/product-provider-wiring-v7.json')
  assert.equal(wiringSchema.properties.schemaVersion.const, wiring.schemaVersion)
  assert.deepEqual(runtime, {
    schemaVersion: 2,
    engine: 'node-posix-toolchain-v2',
    minimumNodeVersion: '22.13.0',
    exactNpmVersion: '11.18.0',
    supportedHostPlatforms: ['darwin', 'linux'],
    nativeWindowsPolicy: 'unsupported-fail-closed',
    windowsCompatibilityEnvironments: ['devcontainer-linux', 'wsl2-linux'],
    requiredExecutables: ['bash', 'git', 'jq', 'node', 'python3'],
    requiredPathClasses: ['plain', 'space-containing'],
  })
  assert.equal(SETUP_GOVERNANCE_MINIMUM_NODE_VERSION, runtime.minimumNodeVersion)
  assert.equal(SETUP_GOVERNANCE_EXACT_NPM_VERSION, runtime.exactNpmVersion)
  assert.equal(wiringSchema.properties.executionRuntime.properties.minimumNodeVersion.const, runtime.minimumNodeVersion)
  assert.equal(wiringSchema.properties.executionRuntime.properties.exactNpmVersion.const, runtime.exactNpmVersion)
  assert.ok(wiringSchema.properties.executionRuntime.required.includes('minimumNodeVersion'))
  assert.ok(wiringSchema.properties.executionRuntime.required.includes('exactNpmVersion'))

  const templatePackage = JSON.parse(readFileSync('template/ds-product-template/package.json', 'utf8'))
  assert.equal(templatePackage.engines.node, `>=${runtime.minimumNodeVersion}`)
  assert.equal(templatePackage.devDependencies.npm, runtime.exactNpmVersion)

  const compare = (leftVersion, rightVersion) => {
    const left = leftVersion.split('.').map(Number)
    const right = rightVersion.split('.').map(Number)
    for (let index = 0; index < 3; index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index]
    }
    return 0
  }
  const atLeast = (value, minimum) => {
    return compare(value, minimum) >= 0
  }

  const authorityPackage = JSON.parse(readFileSync('package.json', 'utf8'))
  const authorityAppPackage = JSON.parse(readFileSync('apps/template/package.json', 'utf8'))
  const authorityLock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
  assert.equal(authorityPackage.devDependencies.npm, runtime.exactNpmVersion)
  assert.equal(authorityLock.packages[''].devDependencies.npm, runtime.exactNpmVersion)
  assert.equal(authorityLock.packages['node_modules/npm'].version, runtime.exactNpmVersion)
  assert.equal(
    authorityLock.packages['node_modules/npm'].resolved,
    `https://registry.npmjs.org/npm/-/npm-${runtime.exactNpmVersion}.tgz`,
  )
  assert.match(authorityLock.packages['node_modules/npm'].integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/)
  for (const dependency of ['vite', '@vitejs/plugin-react']) {
    assert.equal(templatePackage.devDependencies[dependency], authorityAppPackage.devDependencies[dependency])
  }
  const authorityAppViteLock = authorityLock.packages['apps/template/node_modules/vite']
    ?? authorityLock.packages['node_modules/vite']
  assert.equal(authorityAppViteLock.version, authorityAppPackage.devDependencies.vite)
  const pluginReactMajor = authorityLock.packages['apps/template/node_modules/@vitejs/plugin-react'].version.split('.')[0]
  assert.match(authorityAppPackage.devDependencies['@vitejs/plugin-react'], new RegExp(`^\\^${pluginReactMajor}\\.`))

  const lockedToolchain = [
    authorityLock.packages['node_modules/npm'],
    authorityLock.packages['node_modules/eslint'],
    authorityAppViteLock,
    authorityLock.packages['apps/template/node_modules/@vitejs/plugin-react'],
  ]
  const lockedNode22Minima = lockedToolchain.flatMap(tool => (
    [...tool.engines.node.matchAll(/(?:>=|\^)\s*(22\.\d+\.\d+)/g)].map(match => match[1])
  ))
  assert.equal(lockedNode22Minima.length, lockedToolchain.length)
  const lockedToolchainMinimum = lockedNode22Minima.sort(compare).at(-1)
  assert.equal(runtime.minimumNodeVersion, lockedToolchainMinimum)

  const upgradeEvidenceSchema = JSON.parse(readFileSync('scripts/schemas/upgrade-evidence-receipt.schema.json', 'utf8'))
  assert.equal(upgradeEvidenceSchema.$defs.toolchain.properties.npm.const, runtime.exactNpmVersion)
  assert.equal(
    PRODUCT_TEMPLATE_PACKAGE_LOCK_GENERATOR,
    `npm@${runtime.exactNpmVersion} install --package-lock-only --ignore-scripts --legacy-peer-deps --no-audit --no-fund`,
  )

  const workflowPaths = [
    'template/ds-product-template/.github/workflows/audit.yml',
    'template/ds-product-template/.github/workflows/governance-anchor.yml',
    'template/ds-product-template/.github/workflows/sync-design-system.yml',
  ]
  for (const path of workflowPaths) {
    const body = readFileSync(path, 'utf8')
    const declared = [...body.matchAll(/node-version:\s*['"]?(\d+\.\d+\.\d+)['"]?/g)].map(match => match[1])
    assert.ok(declared.length > 0, `${path}: every consumer workflow must pin an exact Node version`)
    assert.ok(declared.every(version => atLeast(version, runtime.minimumNodeVersion)), `${path}: Node pin is below the canonical minimum`)
    assert.doesNotMatch(body, /node-version:\s*['"]?22['"]?\s*$/m, `${path}: ambiguous major-only Node channel`)
    assert.doesNotMatch(body, /^\s*(?:(?:-\s*)?run:\s*)?npm\s+(?:ci|install|audit)\b/m, `${path}: ambient npm may not perform authoritative install or audit work`)
  }
  assert.match(readFileSync(workflowPaths[0], 'utf8'), /npm run setup:governance/)
  const governanceAnchor = readFileSync(workflowPaths[1], 'utf8')
  assert.match(governanceAnchor, /^\s*npm run setup:governance\s*$/m)
  assert.match(governanceAnchor, /node \.\.\/trusted\/scripts\/setup-governance\.mjs\s*\n\s*--dependencies-only --root \./)
  assert.match(governanceAnchor, /node \.\.\/trusted\/scripts\/setup-governance\.mjs\s*\n\s*--installed-check-only --root \./)
  assert.doesNotMatch(governanceAnchor, /node \.\.\/trusted\/node_modules\/npm\/bin\/npm-cli\.js audit --audit-level=high/)
  assert.doesNotMatch(governanceAnchor, /\bnode\s+(?:-e|--eval|--input-type)\b/)
  assert.doesNotMatch(governanceAnchor, /runGovernance(?:Dependency)?Setup/)
  assert.match(readFileSync(workflowPaths[2], 'utf8'), /npm run setup:governance/)

  const devcontainer = JSON.parse(readFileSync('template/ds-product-template/.devcontainer/devcontainer.json', 'utf8'))
  assert.match(devcontainer.image, /javascript-node:1-22@sha256:[a-f0-9]{64}$/)
  assert.deepEqual(devcontainer.postCreateCommand, ['node', '.devcontainer/post-create.mjs'])

  const setupSource = readFileSync('scripts/setup-governance.mjs', 'utf8')
  const bootstrapSource = readFileSync('scripts/lib/governance-dependency-bootstrap.mjs', 'utf8')
  assert.match(setupSource, /SETUP_GOVERNANCE_MINIMUM_NODE_VERSION = GOVERNANCE_DEPENDENCY_MINIMUM_NODE_VERSION/)
  assert.match(bootstrapSource, /stableVersionAtLeast\(nodeVersion, GOVERNANCE_DEPENDENCY_MINIMUM_NODE_VERSION\)/)
  for (const path of ['scripts/governance-check.mjs', 'scripts/refresh-fork-launchers.mjs']) {
    const body = readFileSync(path, 'utf8')
    assert.match(body, /executionRuntime\.minimumNodeVersion/)
    assert.match(body, /executionRuntime\.exactNpmVersion/)
    assert.ok(!body.includes(runtime.minimumNodeVersion), `${path}: canonical Node value must come from the authenticated manifest`)
    assert.ok(!body.includes(runtime.exactNpmVersion), `${path}: canonical npm value must come from the authenticated manifest`)
  }
})

test('consumer governance guide is canonical, protected, exact-hash managed and ordinary-sync eligible without taking product root docs', () => {
  const sourcePath = 'packages/design-system/ds-canonical/templates/consumer-governance.md'
  const destination = 'governance/consumer-governance.md'
  const guide = readFileSync(sourcePath, 'utf8')
  assert.match(guide, /upstream-managed, release-authenticated guide/)
  assert.match(guide, /Consumers already established on the current runtime\/bootstrap contract receive later guide updates/)
  assert.match(guide, /legacy v1 consumer[^\n]*cannot use its old updater/)
  assert.match(guide, /reviewed full-snapshot bootstrap PR/)
  assert.match(guide, /Product-owned root documentation stays product-owned/)
  assert.match(guide, /Node\.js 22\.13\.0 or newer/)
  assert.match(guide, /exact npm 11\.18\.0 runtime/)
  assert.match(guide, /scope=local-bootstrap/)
  assert.match(guide, /providerCertification=not-checked/)
  assert.match(guide, /externalActivationRequired=false/)
  assert.match(guide, /targetVerification=deferred/)
  assert.match(guide, /targetVerified=false/)
  assert.match(guide, /ready=false/)

  const builder = readFileSync('scripts/build-fork-governance.mjs', 'utf8')
  assert.match(builder, /'governance\/consumer-governance\.md': join\(ROOT, 'packages\/design-system\/ds-canonical\/templates\/consumer-governance\.md'\)/)
  assert.match(builder, /const TEMPLATE_GOVERNANCE_PROJECTIONS = Object\.freeze\(\[[\s\S]*'governance\/consumer-governance\.md'/)
  assert.match(builder, /for \(const destination of TEMPLATE_GOVERNANCE_PROJECTIONS\) \{[\s\S]*cpSync\(MANAGED_FILE_SOURCES\[destination\], target\)/)

  const inventory = JSON.parse(readFileSync('infra/governance/inventory/managed-repos.json', 'utf8'))
  assert.deepEqual(
    inventory.ownershipPolicies['product-consumer'].rules.filter(rule => rule.pattern === destination),
    [{ pattern: destination, mode: 'upstream-managed', owner: 'design-system-governance' }],
  )
  for (const productDoc of ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md']) {
    assert.deepEqual(inventory.ownershipPolicies['product-consumer'].rules.filter(rule => rule.pattern === productDoc), [])
  }
  assert.equal(inventory.ownershipPolicies['product-consumer'].defaultMode, 'consumer-owned')

  const graph = JSON.parse(readFileSync('scripts/governance-build-graph.json', 'utf8'))
  const forkStage = graph.stages.find(stage => stage.id === 'fork-template')
  assert.ok(forkStage.sources.includes('packages/design-system/ds-canonical/templates/'))
  assert.ok(forkStage.outputs.includes('packages/design-system/ds-canonical/fork/'))
  assert.ok(forkStage.outputs.includes('template/ds-product-template/governance/'))

  const protectedRoots = JSON.parse(readFileSync('infra/governance/protected-root-classification.json', 'utf8'))
  const canonical = protectedRoots.entries.find(entry => entry.id === 'ds-canonical')
  const generated = protectedRoots.entries.find(entry => entry.id === 'template-governance-view')
  assert.equal(canonical.classification, 'canonical-source')
  assert.ok(!canonical.excludes.includes('packages/design-system/ds-canonical/templates'))
  assert.deepEqual([generated.path, generated.classification], ['template/ds-product-template/governance', 'generated-output'])

  const checker = readFileSync('scripts/governance-check.mjs', 'utf8')
  assert.match(
    checker,
    /const fixedGovernanceEntryNames = new Set\(\[\s*'consumer-governance\.md', 'lock\.json', 'lock\.schema\.json', 'overlay\.md',\s*\]\)/,
  )
  const refresh = readFileSync('scripts/refresh-fork-launchers.mjs', 'utf8')
  assert.match(refresh, /launcherDestination\.split\('\/'\)\.slice\(0, -1\)\.join\('\/'\)/)
  const upgradeVerifier = readFileSync('scripts/verify-upgrade-evidence.mjs', 'utf8')
  assert.match(upgradeVerifier, /from '\.\/lib\/consumer-control-plane-policy\.mjs'/)
  assert.deepEqual(PROTECTED_CONTROL_PLANE_EXACT_PATHS, ['.npmrc'])
  assert.deepEqual(PROTECTED_CONTROL_PLANE_PATH_PREFIXES, ['.github/', 'governance/bin/', 'scripts/'])
  assert.equal(PROTECTED_CONTROL_PLANE_PATH_PREFIXES.includes('governance/'), false)

  const mirrorPolicy = JSON.parse(readFileSync('scripts/published-template-mirror-policy.json', 'utf8'))
  assert.ok(mirrorPolicy.pathPrefixes.includes('governance/'))
})

test('consumer a11y runtime helpers stay aligned across fork, mirror, workflow, and fleet ownership inventories', () => {
  const helpers = [
    'scripts/lib/a11y-static-server.mjs',
    'scripts/lib/canonical-path-containment.mjs',
  ]
  const forkBuilder = readFileSync('scripts/build-fork-governance.mjs', 'utf8')
  const mirrorBuilder = readFileSync('scripts/build-published-template-mirror.mjs', 'utf8')
  const mirrorPolicy = JSON.parse(readFileSync('scripts/published-template-mirror-policy.json', 'utf8'))
  const mirrorWorkflow = readFileSync('.github/workflows/mirror-to-published-template.yml', 'utf8')
  const inventory = JSON.parse(readFileSync('infra/governance/inventory/managed-repos.json', 'utf8'))
  const productRules = inventory.ownershipPolicies['product-consumer'].rules

  for (const path of helpers) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(forkBuilder, new RegExp(`['\"]${escaped}['\"]\\s*:`), `${path}: missing fork managed source`)
    assert.match(mirrorBuilder, new RegExp(`['\"]${escaped}['\"]`), `${path}: missing mirror allowlist source`)
    assert.equal(mirrorPolicy.exactPaths.filter(candidate => candidate === path).length, 1, `${path}: mirror policy must bind exactly once`)
    assert.deepEqual(
      productRules.filter(rule => rule.pattern === path),
      [{ pattern: path, mode: 'upstream-managed', owner: 'design-system-governance' }],
      `${path}: consumer fleet ownership must be exact and upstream-managed`,
    )
  }
  assert.match(mirrorWorkflow, /build-published-template-mirror\.mjs --out=/)
  assert.match(mirrorWorkflow, /published-template-mirror-policy\.json/)
})

test('upgrade documentation and machine desired state enforce Writer App plus separate Check App trust', () => {
  const desired = JSON.parse(readFileSync('infra/governance/desired/github.json', 'utf8'))
  for (const profileName of ['product-consumer', 'published-template']) {
    const profile = desired.profiles[profileName]
    assert.deepEqual(profile.actionsWorkflowPermissions, {
      can_approve_pull_request_reviews: false,
      default_workflow_permissions: 'read',
    })
    assert.equal(profile.environments.find(item => item.name === 'governance-upgrade')?.credentialIntegration, 'governanceWriterApp')
    assert.equal(profile.environments.find(item => item.name === 'governance-check-verdict')?.credentialIntegration, 'governanceCheckApp')
    assert.equal(profile.requiredChecks[0].integration, 'governanceCheckApp')
    assert.equal(profile.requiredChecks[0].trustSource, 'protected-base-workflow')
  }

  const upgrade = readFileSync('template/ds-product-template/.github/workflows/sync-design-system.yml', 'utf8')
  assert.match(upgrade, /environment:\s*\n\s+name: governance-upgrade/)
  assert.match(upgrade, /GOVERNANCE_WRITER_APP_ID/)
  assert.match(upgrade, /permission-contents: write/)
  assert.match(upgrade, /permission-pull-requests: write/)
  assert.match(upgrade, /permission-workflows: write/)
  assert.match(upgrade, /automatic candidate runs are non-authoritative/)
  assert.match(upgrade, /event_type:"governance-upgrade-candidate-validation"/)
  const anchor = readFileSync('template/ds-product-template/.github/workflows/governance-anchor.yml', 'utf8')
  assert.match(anchor, /repository_dispatch:/)
  assert.match(anchor, /name: governance-check-verdict/)
  assert.match(anchor, /GOVERNANCE_CHECK_APP_ID/)
  assert.match(anchor, /permission-checks: write/)

  const documentationPaths = [
    'packages/design-system/ds-canonical/templates/consumer-governance.md',
    'template/ds-product-template/README.md',
    ...['01-first-time-setup.md', '02-create-new-product.md', '03-co-edit-workflow.md', '04-ds-upgrade.md', '05-troubleshooting.md']
      .map(name => `template/ds-product-template/docs/${name}`),
  ]
  const documentation = documentationPaths.map(path => readFileSync(path, 'utf8')).join('\n')
  assert.match(documentation, /default(?:s)? (?:stay|remain|must remain) read-only|Actions 預設需維持 read-only/)
  assert.match(documentation, /create and approve pull requests[^\n]*(?:disabled|remain disabled|維持關閉)/i)
  assert.match(documentation, /candidate (?:workflow )?runs[^\n]*(?:non-authoritative|非權威)/i)
  assert.match(documentation, /protected-default[^\n]*(?:dispatch|validation)/i)
  assert.match(documentation, /check-only (?:Governance )?Check App/i)
  assert.doesNotMatch(documentation, /uses? the built-in `GITHUB_TOKEN` to (?:push|open|create)/i)
  assert.doesNotMatch(documentation, /(?:must enable|已開啟) \*\*Allow GitHub Actions to create and approve pull requests\*\*/i)
  assert.doesNotMatch(documentation, /(?:禁止|do not) (?:改用|replace)[^\n]*(?:Writer App|GitHub App)/i)
})

test('sync-all merger adds authenticated setup commands without clobbering product scripts', () => {
  const original = {
    name: 'product',
    scripts: {
      'product:only': 'node product-task.mjs',
      'sync-all': 'node stale-sync.mjs',
    },
  }
  const merged = mergeRequiredPackageScripts(original, {
    'setup:governance': SETUP_GOVERNANCE_SCRIPT,
    'sync-all': 'node scripts/sync-all.mjs',
  })
  assert.deepEqual(merged.scripts, {
    'product:only': 'node product-task.mjs',
    'sync-all': 'node scripts/sync-all.mjs',
    'setup:governance': SETUP_GOVERNANCE_SCRIPT,
  })
  assert.equal(original.scripts['sync-all'], 'node stale-sync.mjs')
  assert.throws(() => mergeRequiredPackageScripts(original, {}), /nonempty and sorted/)
  assert.throws(() => mergeRequiredPackageScripts(original, { z: 'ok', a: 'not sorted' }), /nonempty and sorted/)
  assert.throws(() => mergeRequiredPackageScripts(original, { bad: 'line one\nline two' }), /required script is invalid/)
})

test('template, cloud, devcontainer, mirror and managed-file wiring share the one setup command', () => {
  const templatePackage = JSON.parse(readFileSync('template/ds-product-template/package.json', 'utf8'))
  assert.equal(templatePackage.scripts['setup:governance'], SETUP_GOVERNANCE_SCRIPT)
  assert.equal(templatePackage.scripts['setup:all'], 'node scripts/setup-workspace.mjs')
  assert.equal(templatePackage.scripts['setup:provider-cli'], 'node scripts/setup-provider-cli-toolchain.mjs')
  assert.equal(templatePackage.devDependencies.npm, SETUP_GOVERNANCE_EXACT_NPM_VERSION)
  assert.equal(templatePackage.engines.node, `>=${SETUP_GOVERNANCE_MINIMUM_NODE_VERSION}`)

  const devcontainer = JSON.parse(readFileSync('template/ds-product-template/.devcontainer/devcontainer.json', 'utf8'))
  const devcontainerLock = JSON.parse(readFileSync('template/ds-product-template/.devcontainer/devcontainer-lock.json', 'utf8'))
  assert.equal(
    devcontainer.image,
    'mcr.microsoft.com/devcontainers/javascript-node:1-22@sha256:0d29e5fdc64f8397cd502223e0c4679f1e60877ca0fd2db4f2e2e0028e4271af',
  )
  assert.deepEqual(Object.keys(devcontainer.features), ['ghcr.io/devcontainers/features/github-cli:1.1.0'])
  assert.deepEqual(devcontainerLock, {
    features: {
      'ghcr.io/devcontainers/features/github-cli:1.1.0': {
        version: '1.1.0',
        resolved: 'ghcr.io/devcontainers/features/github-cli@sha256:d22f50b70ed75339b4eed1ba9ecde3a1791f90e88d37936517e3bace0bbad671',
        integrity: 'sha256:d22f50b70ed75339b4eed1ba9ecde3a1791f90e88d37936517e3bace0bbad671',
      },
    },
  })
  assert.deepEqual(devcontainer.postCreateCommand, ['node', '.devcontainer/post-create.mjs'])
  const productPostCreate = readFileSync('template/ds-product-template/.devcontainer/post-create.mjs', 'utf8')
  assert.match(productPostCreate, /runWorkspacePostCreate\(\{ root \}\)/)
  assert.doesNotMatch(productPostCreate, /apt-get|npm install --global|\bnpx\s+-y\b/)

  const authorityDevcontainer = JSON.parse(readFileSync('.devcontainer/devcontainer.json', 'utf8'))
  const authorityDevcontainerLock = JSON.parse(readFileSync('.devcontainer/devcontainer-lock.json', 'utf8'))
  assert.equal(authorityDevcontainer.image, devcontainer.image)
  assert.deepEqual(authorityDevcontainer.features, devcontainer.features)
  assert.deepEqual(authorityDevcontainerLock, devcontainerLock)
  assert.deepEqual(authorityDevcontainer.postCreateCommand, ['node', '.devcontainer/post-create.mjs'])
  const authorityPostCreate = readFileSync('.devcontainer/post-create.mjs', 'utf8')
  assert.match(authorityPostCreate, /runWorkspacePostCreate\(\{ root \}\)/)
  const sharedPostCreate = readFileSync('scripts/lib/workspace-post-create.mjs', 'utf8')
  assert.match(sharedPostCreate, /\['jq prerequisite', 'jq', \['--version'\]\]/)
  assert.match(sharedPostCreate, /\['complete provider-neutral workspace setup', process\.execPath, \[workspaceSetup\]\]/)
  assert.match(sharedPostCreate, /shell: false/)
  const setupAll = readFileSync('scripts/setup-workspace.mjs', 'utf8')
  assert.match(setupAll, /scripts\/setup-authority-governance\.mjs/)
  assert.match(setupAll, /scripts\/setup-provider-cli-toolchain\.mjs/)
  assert.doesNotMatch(`${authorityPostCreate}\n${sharedPostCreate}\n${setupAll}`, /npm install --global|\bnpx\s+-y\b|shell:\s*true/)

  const setupSurfaces = [
    '.devcontainer/onboard-banner.sh',
    'scripts/fork-role-sources/AGENTS.product.md',
    'scripts/fork-role-sources/CLAUDE.product.md',
    'scripts/check-plugin-installed.mjs',
    'packages/design-system/ds-canonical/references/scenario-definition.md',
    'template/ds-product-template/.devcontainer/onboard-banner.sh',
    'template/ds-product-template/README.md',
    'template/ds-product-template/docs/01-first-time-setup.md',
  ]
  for (const path of setupSurfaces) {
    const body = readFileSync(path, 'utf8')
    assert.match(body, /npm run setup:all/, path)
    assert.doesNotMatch(body, /npm ci --legacy-peer-deps|npm audit signatures/, `${path}: divergent fresh-setup command`)
  }
  for (const path of ['.devcontainer/onboard-banner.sh', 'template/ds-product-template/.devcontainer/onboard-banner.sh']) {
    const body = readFileSync(path, 'utf8')
    assert.doesNotMatch(body, /\/plugin install|npm run setup:governance/, `${path}: stale onboarding path`)
    assert.match(body, /claude/i, `${path}: Claude Code entrypoint is missing`)
    assert.match(body, /codex/i, `${path}: Codex entrypoint is missing`)
  }

  const readme = readFileSync('template/ds-product-template/README.md', 'utf8')
  assert.doesNotMatch(readme, /`scripts\/governance-check\.mjs`\s+— read-only hard gate/)
  assert.match(readme, /node_modules\/@qijenchen\/design-system\/ds-canonical\/fork\/consumer\/governance-check\.mjs/)

  const sessionStart = readFileSync('packages/design-system/ds-canonical/templates/product-launchers/inject_fork_governance_preamble.sh', 'utf8')
  const executableSessionStart = sessionStart.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('echo '))
    .join('\n')
  assert.doesNotMatch(executableSessionStart, /(?:^|[;&|]\s*)(?:npm ci|npm install|npm run setup:(?:governance|all))(?:\s|$)/m)

  const forkBuild = readFileSync('scripts/build-fork-governance.mjs', 'utf8')
  assert.match(forkBuild, /'scripts\/setup-governance\.mjs': join\(ROOT, 'scripts\/setup-governance\.mjs'\)/)
  assert.match(forkBuild, /'scripts\/setup-provider-cli-toolchain\.mjs': join\(ROOT, 'scripts\/setup-provider-cli-toolchain\.mjs'\)/)
  assert.match(forkBuild, /'scripts\/setup-workspace\.mjs': join\(ROOT, 'scripts\/setup-workspace\.mjs'\)/)
  assert.match(forkBuild, /'scripts\/lib\/verified-exact-npm-runtime\.mjs': join\(ROOT, 'scripts\/lib\/verified-exact-npm-runtime\.mjs'\)/)
  assert.match(forkBuild, /'setup-governance\.mjs'/)
  const mirrorBuild = readFileSync('scripts/build-published-template-mirror.mjs', 'utf8')
  assert.match(mirrorBuild, /'scripts\/setup-governance\.mjs'/)
  assert.match(mirrorBuild, /'scripts\/setup-provider-cli-toolchain\.mjs'/)
  assert.match(mirrorBuild, /'scripts\/setup-workspace\.mjs'/)
  assert.match(mirrorBuild, /'scripts\/lib\/verified-exact-npm-runtime\.mjs'/)
  const mirrorPolicy = JSON.parse(readFileSync('scripts/published-template-mirror-policy.json', 'utf8'))
  assert.ok(mirrorPolicy.exactPaths.includes('scripts/setup-governance.mjs'))
  assert.ok(mirrorPolicy.exactPaths.includes('scripts/setup-provider-cli-toolchain.mjs'))
  assert.ok(mirrorPolicy.exactPaths.includes('scripts/setup-workspace.mjs'))
  assert.ok(mirrorPolicy.exactPaths.includes('scripts/lib/verified-exact-npm-runtime.mjs'))
  const mirrorWorkflow = readFileSync('.github/workflows/mirror-to-published-template.yml', 'utf8')
  assert.match(mirrorWorkflow, /build-published-template-mirror\.mjs --out=/)
  assert.match(mirrorWorkflow, /product-template-scaffold-lock\.mjs --verify[\s\S]*--phase source/)
  assert.match(mirrorWorkflow, /product-template-scaffold-lock\.mjs --verify[\s\S]*--phase published/)

  const inventory = JSON.parse(readFileSync('infra/governance/inventory/managed-repos.json', 'utf8'))
  for (const path of ['scripts/setup-governance.mjs', 'scripts/setup-provider-cli-toolchain.mjs', 'scripts/setup-workspace.mjs', 'scripts/lib/verified-exact-npm-runtime.mjs']) {
    assert.deepEqual(
      inventory.ownershipPolicies['product-consumer'].rules.filter(rule => rule.pattern === path),
      [{ pattern: path, mode: 'upstream-managed', owner: 'design-system-governance' }],
    )
  }

  const corpusScratch = mkdtempSync(join(realpathSync(tmpdir()), 'setup-governance-corpus-'))
  temporary.push(corpusScratch)
  const corpusRoot = join(corpusScratch, 'fork')
  const corpus = buildCorpus({ outDir: corpusRoot, templateRoot: join(corpusScratch, 'template') })
  for (const path of ['scripts/setup-governance.mjs', 'scripts/setup-provider-cli-toolchain.mjs', 'scripts/setup-workspace.mjs', 'scripts/lib/verified-exact-npm-runtime.mjs']) {
    const managedArtifact = corpus.manifest.consumer.managedFiles[path]
    assert.equal(typeof managedArtifact, 'string')
    assert.deepEqual(readFileSync(join(corpusRoot, managedArtifact)), readFileSync(path))
  }
  for (const path of ['AGENTS.md', 'CLAUDE.md']) {
    const generatedRole = readFileSync(join(corpusRoot, path), 'utf8')
    assert.match(generatedRole, /npm run setup:all/, `generated ${path}`)
    assert.doesNotMatch(generatedRole, /npm ci --legacy-peer-deps|npm audit signatures/, `generated ${path}: divergent fresh-setup command`)
  }
})

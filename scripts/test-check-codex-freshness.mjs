#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const CHECKER = resolve(import.meta.dirname, 'check-codex-freshness.mjs')
const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'codex-freshness-meta-')))
const home = join(fixture, 'home')
const config = join(home, '.codex/config.toml')
const shim = join(fixture, 'node_modules/.bin/codex')
const callLog = join(fixture, 'fake-codex-calls.log')
const evidence = join(fixture, '.git/governance-runtime/evidence/provider-probes/codex-effort-probe.json')

function write(path, content, options) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, options)
}

function writeShim(version) {
  write(
    shim,
    `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_CODEX_CALL_LOG"
if [ "$1" = "--version" ]; then
  printf 'codex-cli ${version}\\n'
  exit 0
fi
if [ "$1" = "exec" ]; then
  output=''
  tier=''
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "--output-last-message" ]; then
      shift
      output="$1"
    fi
    case "$1" in
      model_reasoning_effort=*) tier="\${1#model_reasoning_effort=}" ;;
    esac
    shift
  done
  [ -n "$output" ] || exit 3
  if [ "\${FAKE_CODEX_FAIL_TIER-}" = "$tier" ]; then
    printf 'model: %s\\n' "\${FAKE_CODEX_FAILED_MODEL-leaked-failed-model}"
    printf '%s\\n' "\${FAKE_CODEX_REPLY-OK}" > "$output"
    if [ -n "\${FAKE_CODEX_MUTATE_CONFIG-}" ]; then
      printf '# transport-time mutation\\n' >> "$FAKE_CODEX_MUTATE_CONFIG"
    fi
    exit 1
  fi
  if [ "\${FAKE_CODEX_OMIT_MODEL-0}" != "1" ]; then
    printf 'model: %s\\n' "\${FAKE_CODEX_MODEL-fixture-model}"
  fi
  printf '%s\\n' "\${FAKE_CODEX_REPLY-OK}" > "$output"
  exit "\${FAKE_CODEX_EXIT-0}"
fi
exit 4
`,
    { mode: 0o755 },
  )
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function validEvidence(top = 'ultra', configPath = config) {
  return {
    schemaVersion: 1,
    cliVersion: '1.2.3',
    top,
    resolvedModel: 'fixture-model',
    probedAt: new Date().toISOString(),
    configSha256: sha256(readFileSync(configPath)),
  }
}

function writeEvidence(top = 'ultra', overrides = {}, configPath = config) {
  write(evidence, `${JSON.stringify({ ...validEvidence(top, configPath), ...overrides }, null, 2)}\n`)
}

function writeEvidenceObject(value) {
  write(evidence, `${JSON.stringify(value, null, 2)}\n`)
}

function runWithEnv(args, extraEnv = {}) {
  const env = {
    ...process.env,
    HOME: home,
    FAKE_CODEX_CALL_LOG: callLog,
    ...extraEnv,
  }
  delete env.CODEX_HOME
  if (Object.prototype.hasOwnProperty.call(extraEnv, 'CODEX_HOME')) env.CODEX_HOME = extraEnv.CODEX_HOME
  return spawnSync(process.execPath, ['--', CHECKER, ...args], {
    cwd: fixture,
    env,
    encoding: 'utf8',
  })
}

function run(...args) {
  return runWithEnv(args)
}

function assertNoModelCall(label) {
  const log = existsSync(callLog) ? readFileSync(callLog, 'utf8') : ''
  assert.doesNotMatch(log, /^exec\b/m, label)
}

function restoreRegularConfig(content) {
  rmSync(config, { force: true })
  write(config, content)
}

try {
  const initialized = spawnSync('git', ['init', '-q', fixture], { encoding: 'utf8' })
  assert.equal(initialized.status, 0, initialized.stderr)
  write(
    join(fixture, 'infra/governance/providers/provider-cli-toolchain.json'),
    `${JSON.stringify({ tools: [{ providerId: 'codex', version: '1.2.3' }] }, null, 2)}\n`,
  )
  mkdirSync(dirname(evidence), { recursive: true })
  write(config, 'model_reasoning_effort = "ultra"\n')
  writeShim('1.2.3')
  writeEvidence()

  const baseline = run('--offline')
  assert.equal(baseline.status, 0, `fixture baseline must pass:\n${baseline.stderr}`)
  assert.match(baseline.stdout, /canonical provider toolchain lock/)

  const originalConfig = readFileSync(config)
  try {
    writeFileSync(config, `model = "stale-model"\n${originalConfig}`)
    const pinnedModel = run('--offline')
    assert.equal(pinnedModel.status, 1, 'an explicit model pin must fail closed')
    assert.match(pinnedModel.stderr, /禁止 provider\/model\/profile selection/)
  } finally {
    writeFileSync(config, originalConfig)
  }
  assert.equal(run('--offline').status, 0, 'restoring config must restore PASS')

  for (const forbiddenLine of [
    '"model" = "stale-model"',
    "'model_provider' = 'redirected'",
    '"pro\\u0066ile" = "redirected"',
  ]) {
    writeFileSync(config, `${forbiddenLine}\n${originalConfig}`)
    rmSync(callLog, { force: true })
    const quotedSelection = run('--offline', '--probe', '--allow-model')
    assert.equal(quotedSelection.status, 1, `quoted/escaped provider selection must fail:${forbiddenLine}`)
    assertNoModelCall(`quoted/escaped provider selection reached model transport:${forbiddenLine}`)
  }
  writeFileSync(config, originalConfig)
  assert.equal(run('--offline').status, 0, 'restoring quoted-key mutations must restore PASS')

  writeShim('1.2.4')
  const driftedCli = run('--offline')
  assert.equal(driftedCli.status, 1, 'installed CLI drift from the canonical lock must fail closed')
  assert.match(driftedCli.stderr, /installed 1\.2\.4 != canonical lock 1\.2\.3/)
  writeShim('1.2.3')
  assert.equal(run('--offline').status, 0, 'restoring the controlled CLI transport must restore PASS')

  writeEvidence('max')
  const driftedEffort = run('--offline')
  assert.equal(driftedEffort.status, 1, 'effort pin drift from probe evidence must fail closed')
  assert.match(driftedEffort.stderr, /effort pin "ultra" != 探測 top "max"/)
  writeEvidence()
  assert.equal(run('--offline').status, 0, 'restoring evidence must restore PASS')

  const missingModelEvidence = validEvidence()
  delete missingModelEvidence.resolvedModel
  writeEvidenceObject(missingModelEvidence)
  assert.equal(run('--offline').status, 1, 'evidence missing resolvedModel must fail closed')

  writeEvidence('ultra', { resolvedModel: '' })
  assert.equal(run('--offline').status, 1, 'an empty resolvedModel must fail closed')

  writeEvidence('ultra', { extraAuthority: true })
  assert.equal(run('--offline').status, 1, 'an open-ended evidence schema must fail closed')

  const duplicateKeyEvidence = JSON.stringify(validEvidence(), null, 2).replace(
    '  "top": "ultra",',
    '  "top": "max",\n  "top": "ultra",',
  )
  write(evidence, `${duplicateKeyEvidence}\n`)
  assert.equal(run('--offline').status, 1, 'duplicate JSON evidence keys must fail closed')

  writeEvidence('ultra', { probedAt: new Date(Date.now() - (25 * 60 * 60 * 1000)).toISOString() })
  const expiredEvidence = run('--offline')
  assert.equal(expiredEvidence.status, 1, 'expired probe evidence must fail closed')
  assert.match(expiredEvidence.stderr, /expired/)

  writeEvidence('ultra', { probedAt: new Date(Date.now() + (6 * 60 * 1000)).toISOString() })
  const futureEvidence = run('--offline')
  assert.equal(futureEvidence.status, 1, 'far-future probe evidence must fail closed')
  assert.match(futureEvidence.stderr, /future/)

  writeEvidence('ultra', { probedAt: 'not-an-iso-time' })
  assert.equal(run('--offline').status, 1, 'malformed evidence time must fail closed')

  write(evidence, '{ malformed json\n')
  assert.equal(run('--offline').status, 1, 'malformed probe evidence JSON must fail closed')

  writeEvidence('ultra', { configSha256: '0'.repeat(64) })
  const unboundConfigEvidence = run('--offline')
  assert.equal(unboundConfigEvidence.status, 1, 'evidence not bound to config bytes must fail closed')
  assert.match(unboundConfigEvidence.stderr, /config digest/)

  writeEvidence()
  assert.equal(run('--offline').status, 0, 'restoring exact fresh evidence must restore PASS')

  rmSync(callLog, { force: true })
  const missingIntentProbe = run('--probe')
  assert.equal(missingIntentProbe.status, 2, 'probe without explicit bounded execution intent must stop before transport')
  assert.equal(existsSync(callLog), false, 'probe without execution intent reached the fake Codex transport')

  rmSync(config, { force: true })
  rmSync(callLog, { force: true })
  const missingConfigProbe = run('--offline', '--probe', '--allow-model')
  assert.equal(missingConfigProbe.status, 1, 'missing config authority must fail before probe')
  assertNoModelCall('missing config authority reached model transport')
  restoreRegularConfig(originalConfig)

  const symlinkTarget = join(fixture, 'outside-symlink-config.toml')
  write(symlinkTarget, originalConfig)
  rmSync(config, { force: true })
  symlinkSync(symlinkTarget, config)
  rmSync(callLog, { force: true })
  const symlinkConfigProbe = run('--offline', '--probe', '--allow-model')
  assert.equal(symlinkConfigProbe.status, 1, 'symlink config must fail before probe')
  assertNoModelCall('symlink config reached model transport')
  restoreRegularConfig(originalConfig)
  rmSync(symlinkTarget, { force: true })

  const hardlinkTarget = join(fixture, 'outside-hardlink-config.toml')
  write(hardlinkTarget, originalConfig)
  rmSync(config, { force: true })
  linkSync(hardlinkTarget, config)
  rmSync(callLog, { force: true })
  const hardlinkConfigProbe = run('--offline', '--probe', '--allow-model')
  assert.equal(hardlinkConfigProbe.status, 1, 'multi-link config must fail before probe')
  assertNoModelCall('multi-link config reached model transport')
  rmSync(config, { force: true })
  rmSync(hardlinkTarget, { force: true })
  restoreRegularConfig(originalConfig)

  const physicalParent = join(fixture, 'physical-parent')
  const aliasedParent = join(fixture, 'aliased-parent')
  const physicallyAliasedCodexHome = join(aliasedParent, 'codex-home')
  const physicalConfig = join(physicalParent, 'codex-home/config.toml')
  write(physicalConfig, originalConfig)
  symlinkSync(physicalParent, aliasedParent)
  rmSync(callLog, { force: true })
  const aliasedAuthorityProbe = runWithEnv(
    ['--offline', '--probe', '--allow-model'],
    { CODEX_HOME: physicallyAliasedCodexHome },
  )
  assert.equal(aliasedAuthorityProbe.status, 1, 'physically aliased config authority must fail before probe')
  assertNoModelCall('physically aliased config authority reached model transport')
  rmSync(aliasedParent, { force: true })
  rmSync(physicalParent, { recursive: true, force: true })

  rmSync(callLog, { force: true })
  const missingAuthorityProbe = runWithEnv(
    ['--offline', '--probe', '--allow-model'],
    { CODEX_HOME: join(fixture, 'missing-codex-home') },
  )
  assert.equal(missingAuthorityProbe.status, 1, 'missing CODEX_HOME must fail before probe')
  assertNoModelCall('missing CODEX_HOME reached model transport')

  rmSync(callLog, { force: true })
  const relativeAuthorityProbe = runWithEnv(
    ['--offline', '--probe', '--allow-model'],
    { CODEX_HOME: 'relative-codex-home' },
  )
  assert.equal(relativeAuthorityProbe.status, 1, 'relative CODEX_HOME must fail before probe')
  assertNoModelCall('relative CODEX_HOME reached model transport')

  const customCodexHome = join(fixture, 'custom-codex-home')
  const customConfig = join(customCodexHome, 'config.toml')
  write(customConfig, originalConfig)
  writeFileSync(config, `"model" = "default-home-must-not-win"\n${originalConfig}`)
  writeEvidence('ultra', {}, customConfig)
  const explicitAuthority = runWithEnv(['--offline'], { CODEX_HOME: customCodexHome })
  assert.equal(explicitAuthority.status, 0, `CODEX_HOME config authority must override HOME:\n${explicitAuthority.stderr}`)
  writeFileSync(config, originalConfig)
  writeEvidence()
  rmSync(customCodexHome, { recursive: true, force: true })
  assert.equal(run('--offline').status, 0, 'restoring default config authority must restore PASS')

  const cleanConfig = readFileSync(config)
  const cleanEvidence = readFileSync(evidence)
  writeShim('1.2.4')
  rmSync(callLog, { force: true })
  const driftedAuthorizedProbe = run('--offline', '--probe', '--allow-model')
  assert.equal(driftedAuthorizedProbe.status, 1, 'authorized probe must still refuse a drifted CLI')
  assert.doesNotMatch(readFileSync(callLog, 'utf8'), /^exec\b/m, 'CLI drift reached the model transport')
  assert.deepEqual(readFileSync(config), cleanConfig, 'CLI drift changed config')
  assert.deepEqual(readFileSync(evidence), cleanEvidence, 'CLI drift changed probe evidence')

  writeShim('1.2.3')
  writeFileSync(config, `model = "stale-model"\n${cleanConfig}`)
  rmSync(callLog, { force: true })
  const pinnedAuthorizedProbe = run('--offline', '--probe', '--allow-model')
  assert.equal(pinnedAuthorizedProbe.status, 1, 'authorized probe must refuse an explicit model pin')
  assert.doesNotMatch(readFileSync(callLog, 'utf8'), /^exec\b/m, 'forbidden model pin reached the model transport')
  assert.deepEqual(readFileSync(evidence), cleanEvidence, 'forbidden model pin changed probe evidence')
  writeFileSync(config, cleanConfig)

  rmSync(callLog, { force: true })
  const substringReply = runWithEnv(
    ['--offline', '--probe', '--allow-model'],
    { FAKE_CODEX_REPLY: 'NOT OK' },
  )
  assert.equal(substringReply.status, 1, 'a reply merely containing OK must not certify an effort tier')
  assert.equal((readFileSync(callLog, 'utf8').match(/^exec\b/gm) || []).length, 4, 'every governed high+ tier should reject the inexact reply')
  assert.deepEqual(readFileSync(config), cleanConfig, 'failed exact-reply probe changed config')
  assert.deepEqual(readFileSync(evidence), cleanEvidence, 'failed exact-reply probe changed evidence')

  rmSync(callLog, { force: true })
  const missingModelHeader = runWithEnv(
    ['--offline', '--probe', '--allow-model'],
    { FAKE_CODEX_REPLY: 'OK', FAKE_CODEX_OMIT_MODEL: '1' },
  )
  assert.equal(missingModelHeader.status, 1, 'exact OK without a resolved model header must not certify')
  assert.equal((readFileSync(callLog, 'utf8').match(/^exec\b/gm) || []).length, 4, 'missing model header must reject every governed tier')
  assert.deepEqual(readFileSync(config), cleanConfig, 'missing model header changed config')
  assert.deepEqual(readFileSync(evidence), cleanEvidence, 'missing model header changed evidence')

  rmSync(callLog, { force: true })
  const changedBetweenTiers = runWithEnv(
    ['--offline', '--probe', '--allow-model'],
    {
      FAKE_CODEX_FAIL_TIER: 'ultra',
      FAKE_CODEX_MUTATE_CONFIG: config,
    },
  )
  assert.equal(changedBetweenTiers.status, 1, 'config mutation between tiers must stop the probe ladder')
  assert.equal((readFileSync(callLog, 'utf8').match(/^exec\b/gm) || []).length, 1, 'a second model probe ran after config authority drifted')
  assert.deepEqual(readFileSync(evidence), cleanEvidence, 'config drift between tiers changed evidence')
  writeFileSync(config, cleanConfig)

  rmSync(callLog, { force: true })
  const failedTierThenSuccess = runWithEnv(
    ['--offline', '--probe', '--allow-model'],
    {
      FAKE_CODEX_REPLY: 'OK',
      FAKE_CODEX_FAIL_TIER: 'ultra',
      FAKE_CODEX_FAILED_MODEL: 'must-not-leak',
      FAKE_CODEX_MODEL: 'successful-model',
    },
  )
  assert.equal(failedTierThenSuccess.status, 0, `a lower successful tier should certify independently:\n${failedTierThenSuccess.stderr}`)
  const lowerTierEvidence = JSON.parse(readFileSync(evidence, 'utf8'))
  assert.equal(lowerTierEvidence.top, 'max')
  assert.equal(lowerTierEvidence.resolvedModel, 'successful-model', 'failed tier model leaked into evidence')
  assert.equal(lowerTierEvidence.configSha256, sha256(readFileSync(config)), 'evidence did not bind updated config bytes')
  writeFileSync(config, cleanConfig)
  write(evidence, cleanEvidence)

  rmSync(callLog, { force: true })
  const exactReply = runWithEnv(['--offline', '--probe', '--allow-model'], { FAKE_CODEX_REPLY: 'OK' })
  assert.equal(exactReply.status, 0, `exact OK reply must permit evidence:\n${exactReply.stderr}`)
  const exactEvidence = JSON.parse(readFileSync(evidence, 'utf8'))
  assert.equal(exactEvidence.top, 'ultra')
  assert.equal(exactEvidence.resolvedModel, 'fixture-model')
  assert.deepEqual(
    Object.keys(exactEvidence).sort(),
    ['schemaVersion', 'cliVersion', 'top', 'resolvedModel', 'probedAt', 'configSha256'].sort(),
  )
  assert.equal(exactEvidence.configSha256, sha256(readFileSync(config)))

  const forbiddenFixtureFlag = run('--fixture', fixture)
  assert.equal(forbiddenFixtureFlag.status, 2, 'production CLI must not expose a fixture transport bypass')
  assert.match(forbiddenFixtureFlag.stderr, /用法/)
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

console.log('✅ codex-freshness paired mutation: closed CLI/config/evidence transport catches drift and restores cleanly')

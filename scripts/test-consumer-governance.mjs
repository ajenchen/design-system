#!/usr/bin/env node
// Clean-room positive/negative fixtures for scripts/governance-check.mjs.

import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROPOSED_REPLAY_SHELL_FIXTURE = join(
  root,
  'scripts/test-fixtures/transitive-execution/consumer-governance-proposed-replay.sh',
)
const PROPOSED_REPLAY_NODE_FIXTURE = join(
  root,
  'scripts/test-fixtures/transitive-execution/consumer-governance-proposed-replay.mjs',
)
const temp = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'consumer-governance-')))
const mirror = join(temp, 'repo')
const checkScript = join(mirror, 'node_modules/@qijenchen/design-system/ds-canonical/fork/consumer/governance-check.mjs')
const sha = (buf) => createHash('sha256').update(buf).digest('hex')
const snapshot = (dir) => {
  const rows = []
  const walk = (abs, rel = '') => {
    for (const name of readdirSync(abs).sort()) {
      const path = join(abs, name)
      const key = rel ? `${rel}/${name}` : name
      const st = statSync(path)
      if (st.isDirectory()) walk(path, key)
      else rows.push(`${key}:${st.mode & 0o777}:${sha(readFileSync(path))}`)
    }
  }
  walk(dir)
  return { digest: sha(rows.join('\n')), rows }
}
const runCheck = ({
  injectPayloadEnvironmentAfterLaunch = false,
  injectLiveHookSwapAfterSnapshot = false,
  injectLiveSourceSwapAfterCapture = false,
  injectTransientReplayTimeoutAfterLaunch = false,
  injectPersistentReplayTimeoutAfterLaunch = false,
  allowExpectedFixtureMutation = false,
} = {}) => {
  const before = snapshot(mirror)
  const useWrapper = (
    injectPayloadEnvironmentAfterLaunch
    || injectLiveHookSwapAfterSnapshot
    || injectLiveSourceSwapAfterCapture
    || injectTransientReplayTimeoutAfterLaunch
    || injectPersistentReplayTimeoutAfterLaunch
  )
  const entrypoint = useWrapper
    ? join(root, 'scripts/test-fixtures/consumer-governance-payload-environment-wrapper.mjs')
    : checkScript
  const liveSwapRecord = join(temp, 'live-swap-record.json')
  rmSync(liveSwapRecord, { force: true })
  const run = spawnSync(process.execPath, [
    '--',
    entrypoint,
    '--repo',
    mirror,
    '--json',
    '--hooks-off',
    ...(injectTransientReplayTimeoutAfterLaunch ? ['--test-transient-replay-timeout'] : []),
    ...(injectPersistentReplayTimeoutAfterLaunch ? ['--test-persistent-replay-timeout'] : []),
    ...(injectLiveHookSwapAfterSnapshot ? ['--test-live-hook-swap-after-snapshot'] : []),
    ...(injectLiveSourceSwapAfterCapture ? ['--test-live-source-swap-after-capture'] : []),
  ], {
    cwd: useWrapper ? mirror : root,
    encoding: 'utf8',
    env: {
      ...process.env,
      TEST_LIVE_SWAP_RECORD: liveSwapRecord,
    },
  })
  if (existsSync(liveSwapRecord)) {
    const record = JSON.parse(readFileSync(liveSwapRecord, 'utf8'))
    writeFileSync(record.path, Buffer.from(record.body, 'base64'))
    rmSync(liveSwapRecord)
  }
  const after = snapshot(mirror)
  if (before.digest !== after.digest && !allowExpectedFixtureMutation) {
    const beforeSet = new Set(before.rows)
    const afterSet = new Set(after.rows)
    const changed = [...before.rows.filter((row) => !afterSet.has(row)), ...after.rows.filter((row) => !beforeSet.has(row))].slice(0, 20)
    throw new Error(`GOV-CHECK-PURITY: check mutated fixture\n${changed.join('\n')}`)
  }
  let report = null
  try { report = JSON.parse(run.stdout) } catch { throw new Error(`governance check emitted invalid JSON:${run.stdout}\n${run.stderr}`) }
  return { status: run.status, report, stderr: run.stderr }
}
const expectFailure = (ruleId) => {
  const result = runCheck()
  if (result.status === 0 || !result.report.diagnostics.some((d) => d.ruleId === ruleId)) {
    throw new Error(`expected ${ruleId} failure; got status=${result.status} diagnostics=${JSON.stringify(result.report.diagnostics)}`)
  }
  return result
}

try {
  const build = spawnSync(process.execPath, ['--', join(root, 'scripts/build-published-template-mirror.mjs'), `--out=${mirror}`], { cwd: root, encoding: 'utf8' })
  if (build.status !== 0) throw new Error(`mirror build failed:${build.stdout}\n${build.stderr}`)

  const dsVersion = JSON.parse(readFileSync(join(root, 'packages/design-system/package.json'), 'utf8')).version
  const sbVersion = JSON.parse(readFileSync(join(root, 'packages/storybook-config/package.json'), 'utf8')).version
  const dsDest = join(mirror, 'node_modules/@qijenchen/design-system')
  const sbDest = join(mirror, 'node_modules/@qijenchen/storybook-config')
  mkdirSync(dsDest, { recursive: true })
  mkdirSync(join(dsDest, 'src/tokens'), { recursive: true })
  mkdirSync(sbDest, { recursive: true })
  cpSync(join(root, 'packages/design-system/package.json'), join(dsDest, 'package.json'))
  cpSync(join(root, 'packages/design-system/ds-canonical'), join(dsDest, 'ds-canonical'), { recursive: true })
  cpSync(join(root, 'packages/design-system/src/tokens/utility-registry.json'), join(dsDest, 'src/tokens/utility-registry.json'))
  cpSync(join(root, 'packages/storybook-config/package.json'), join(sbDest, 'package.json'))
  const mirrorPkg = JSON.parse(readFileSync(join(mirror, 'package.json'), 'utf8'))
  const exactNpmVersion = mirrorPkg.devDependencies?.npm
  if (!/^\d+\.\d+\.\d+$/.test(exactNpmVersion || '')) throw new Error('mirror fixture must pin an exact npm runtime')
  writeFileSync(join(mirror, 'package-lock.json'), JSON.stringify({
    name: mirrorPkg.name,
    version: mirrorPkg.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: mirrorPkg.name,
        version: mirrorPkg.version,
        dependencies: mirrorPkg.dependencies,
        devDependencies: mirrorPkg.devDependencies,
        engines: mirrorPkg.engines,
      },
      'node_modules/@qijenchen/design-system': {
        version: dsVersion,
        resolved: `https://registry.npmjs.org/@qijenchen/design-system/-/design-system-${dsVersion}.tgz`,
        integrity: 'sha512-A3eSBeF7eSqCa3kuXymOstWCI9uLMcNxZY7glJosUTnvLJMsV9w6V8Ikirx08w6ch5bYT6BbUsQmJMyEkCfdDA==',
      },
      'node_modules/@qijenchen/storybook-config': {
        version: sbVersion,
        resolved: `https://registry.npmjs.org/@qijenchen/storybook-config/-/storybook-config-${sbVersion}.tgz`,
        integrity: 'sha512-iHw7rkpzKfsxCJdM+OBajcDn2RlUg+7WkGHW+jT2e1LNaAwWFCNgrnBQzvCeVOs7n+nsqWanrOxjRW2CaC9S3Q==',
      },
      'node_modules/npm': {
        version: exactNpmVersion,
        resolved: `https://registry.npmjs.org/npm/-/npm-${exactNpmVersion}.tgz`,
        integrity: 'sha512-A3eSBeF7eSqCa3kuXymOstWCI9uLMcNxZY7glJosUTnvLJMsV9w6V8Ikirx08w6ch5bYT6BbUsQmJMyEkCfdDA==',
        dev: true,
        bin: { npm: 'bin/npm-cli.js' },
      },
    },
  }, null, 2) + '\n')

  const positive = runCheck()
  if (positive.status !== 0 || !positive.report.ok || positive.report.hooksRequired !== false) {
    throw new Error(`positive clean-room failed:${JSON.stringify(positive.report, null, 2)}`)
  }
  if (positive.report.evidence?.staticReplay?.skippedForPreexistingBlocker !== false
    || !(positive.report.evidence?.staticReplay?.hookExecutions > 0)) {
    throw new Error(`positive clean-room did not execute the complete replay:${JSON.stringify(positive.report.evidence?.staticReplay)}`)
  }
  console.log(`✅ positive: hooks-off immutable snapshot PASS(${positive.report.attestationDigest.slice(0, 16)})`)

  const outputTransportPath = join(
    dsDest,
    'ds-canonical/fork/launchers/provider-hook-output-transport.mjs',
  )
  const outputTransportBytes = readFileSync(outputTransportPath)
  try {
    writeFileSync(
      outputTransportPath,
      Buffer.concat([
        outputTransportBytes,
        Buffer.from('\nprocess.stderr.write("UNVERIFIED_OUTPUT_TRANSPORT_EXECUTED\\\\n")\n'),
      ]),
    )
    const blockedTransport = runCheck()
    if (
      blockedTransport.status === 0
      || blockedTransport.report.ok
      || !blockedTransport.report.diagnostics.some((item) => item.ruleId === 'GOV-CORPUS-003')
      || blockedTransport.report.evidence?.staticReplay?.skippedForPreexistingBlocker !== true
      || blockedTransport.stderr.includes('UNVERIFIED_OUTPUT_TRANSPORT_EXECUTED')
    ) {
      throw new Error(
        `unverified output transport loaded before preexisting corpus blocker:${JSON.stringify({
          status: blockedTransport.status,
          report: blockedTransport.report,
          stderr: blockedTransport.stderr,
        })}`,
      )
    }
  } finally {
    writeFileSync(outputTransportPath, outputTransportBytes)
  }
  console.log('✅ negative: unverified output transport is never loaded before a preexisting corpus blocker')

  const liveHookSwap = runCheck({ injectLiveHookSwapAfterSnapshot: true })
  const liveHookSwapDiagnostic = liveHookSwap.report.diagnostics.find((item) => (
    item.ruleId === 'GOV-CONTENT-002'
    && item.evidence?.includes('live replay corpus changed after authenticated snapshot:')
  ))
  if (
    liveHookSwap.status === 0
    || liveHookSwap.report.ok
    || !liveHookSwapDiagnostic
    || liveHookSwap.stderr.includes('LIVE_HOOK_SWAP_EXECUTED')
  ) {
    throw new Error(
      `live hook swap did not execute only the authenticated snapshot and fail final CAS:${JSON.stringify({
        status: liveHookSwap.status,
        report: liveHookSwap.report,
        stderr: liveHookSwap.stderr,
      })}`,
    )
  }
  console.log('✅ negative: live hook swap cannot affect the authenticated replay snapshot and fails final CAS')

  const liveSourceSwap = runCheck({ injectLiveSourceSwapAfterCapture: true })
  const liveSourceSwapDiagnostic = liveSourceSwap.report.diagnostics.find((item) => (
    item.ruleId === 'GOV-CONTENT-002'
    && item.message.includes('changed after its authenticated replay')
  ))
  if (liveSourceSwap.status === 0 || liveSourceSwap.report.ok || !liveSourceSwapDiagnostic) {
    throw new Error(
      `live source swap after replay capture did not fail closed:${JSON.stringify({
        status: liveSourceSwap.status,
        report: liveSourceSwap.report,
        stderr: liveSourceSwap.stderr,
      })}`,
    )
  }
  console.log('✅ negative: live source swap after authenticated replay capture fails final source CAS')

  const shrinkwrapPath = join(mirror, 'npm-shrinkwrap.json')
  writeFileSync(shrinkwrapPath, '{"lockfileVersion":3,"packages":{}}\n')
  expectFailure('GOV-LOCK-001')
  rmSync(shrinkwrapPath)
  console.log('✅ negative: hooks-off gate rejects root npm shrinkwrap and preserves package-lock as the sole dependency SSOT')

  const payloadTransport = runCheck({ injectPayloadEnvironmentAfterLaunch: true })
  if (payloadTransport.status !== 0 || !payloadTransport.report.ok) {
    throw new Error(`payload-free child environment failed:${JSON.stringify(payloadTransport.report, null, 2)}`)
  }
  console.log('✅ positive: inherited payload, trust, runtime-state, provider, and hostile child-startup variables are scrubbed')

  const transientTimeout = runCheck({ injectTransientReplayTimeoutAfterLaunch: true })
  if (
    transientTimeout.status !== 0
    || !transientTimeout.report.ok
    || transientTimeout.report.attestationDigest !== positive.report.attestationDigest
    || transientTimeout.stderr.trim() !== 'TEST_TRANSIENT_REPLAY_TIMEOUT_INJECTED'
  ) {
    throw new Error(
      `one bounded ETIMEDOUT retry was not deterministic:${JSON.stringify({
        status: transientTimeout.status,
        ok: transientTimeout.report.ok,
        expectedDigest: positive.report.attestationDigest,
        actualDigest: transientTimeout.report.attestationDigest,
        stderr: transientTimeout.stderr,
      })}`,
    )
  }
  console.log('✅ positive: one transient replay ETIMEDOUT is retried once without changing evidence')

  const persistentTimeout = runCheck({ injectPersistentReplayTimeoutAfterLaunch: true })
  const timeoutDiagnostic = persistentTimeout.report.diagnostics.find((diagnostic) => (
    diagnostic.ruleId === 'GOV-CONTENT-002'
    && diagnostic.message.startsWith('CI replay child execution failed for ')
  ))
  if (
    persistentTimeout.status === 0
    || persistentTimeout.report.ok
    || persistentTimeout.report.evidence?.staticReplay?.hookExecutions !== 1
    || persistentTimeout.stderr.trim() !== 'TEST_PERSISTENT_REPLAY_TIMEOUT_INJECTED=2'
    || !timeoutDiagnostic
    || !/^file=[^;]+;interpreter=(?:bash|python3|node);attempt=2\/2;timeoutMs=30000;error=ETIMEDOUT;signal=SIGKILL;executionIndex=1$/.test(
      timeoutDiagnostic.evidence || '',
    )
  ) {
    throw new Error(
      `persistent replay timeout did not fail closed after exactly two attempts:${JSON.stringify({
        status: persistentTimeout.status,
        report: persistentTimeout.report,
        stderr: persistentTimeout.stderr,
      })}`,
    )
  }
  console.log('✅ negative: persistent replay timeout fails closed after exactly one bounded retry with deterministic diagnostics')

  const authenticatedGovernanceData = [
    'governance/provider-cli-toolchain.json',
    'governance/provider-cli-toolchain.package-lock.json',
  ]
  const authenticatedNestedGovernanceData = [
    'governance/schemas/issuer-registry.schema.json',
    'governance/schemas/visual-baseline-review-policy.schema.json',
    'governance/trust/issuers.json',
  ]
  for (const path of [...authenticatedGovernanceData, ...authenticatedNestedGovernanceData]) {
    const info = statSync(join(mirror, path))
    if (!info.isFile() || (info.mode & 0o111) !== 0) throw new Error(`authenticated governance data is not a non-executable regular file:${path}`)
  }
  console.log('✅ positive: authenticated direct and nested governance data are accepted only through the closed BOM')

  // Product-specific policy has one provider-neutral, non-executable home. Provider-native hooks
  // and skills remain closed projections of the authenticated package rather than a second SSOT.
  const overlayPath = join(mirror, 'governance/overlay.md')
  writeFileSync(overlayPath, '# Product policy\n\nUse the canonical DS components.\n')
  const neutralOverlay = runCheck()
  if (neutralOverlay.status !== 0) throw new Error(`neutral product overlay rejected:${JSON.stringify(neutralOverlay.report.diagnostics)}`)
  rmSync(overlayPath)
  console.log('✅ positive: provider-neutral non-executable product overlay accepted')

  const governanceExecutable = join(mirror, 'governance/my-team-hook.sh')
  writeFileSync(governanceExecutable, '#!/usr/bin/env bash\nexit 0\n')
  const structurallyBlocked = expectFailure('GOV-EXTENSION-001')
  if (structurallyBlocked.report.evidence?.staticReplay?.skippedForPreexistingBlocker !== true
    || structurallyBlocked.report.evidence?.staticReplay?.hookExecutions !== 0) {
    throw new Error(`structurally blocked fixture did not fail closed before replay:${JSON.stringify(structurallyBlocked.report.evidence?.staticReplay)}`)
  }
  rmSync(governanceExecutable)
  const unsignedGovernanceData = join(mirror, 'governance/unsigned-data.json')
  writeFileSync(unsignedGovernanceData, '{"unsigned":true}\n')
  expectFailure('GOV-EXTENSION-001')
  rmSync(unsignedGovernanceData)
  const managedGovernanceData = join(mirror, authenticatedGovernanceData[0])
  const managedGovernanceMode = statSync(managedGovernanceData).mode & 0o777
  chmodSync(managedGovernanceData, managedGovernanceMode | 0o111)
  expectFailure('GOV-EXTENSION-001')
  chmodSync(managedGovernanceData, managedGovernanceMode)
  const managedNestedGovernanceData = join(mirror, authenticatedNestedGovernanceData[0])
  const managedNestedGovernanceMode = statSync(managedNestedGovernanceData).mode & 0o777
  chmodSync(managedNestedGovernanceData, managedNestedGovernanceMode | 0o111)
  expectFailure('GOV-EXTENSION-001')
  chmodSync(managedNestedGovernanceData, managedNestedGovernanceMode)
  const rogueNestedGovernanceData = join(mirror, 'governance/trust/rogue.json')
  writeFileSync(rogueNestedGovernanceData, '{"rogue":true}\n')
  expectFailure('GOV-EXTENSION-001')
  rmSync(rogueNestedGovernanceData)
  const outsideOverlay = join(temp, 'outside-overlay.md')
  writeFileSync(outsideOverlay, '# Outside policy\n')
  symlinkSync(outsideOverlay, overlayPath)
  expectFailure('GOV-EXTENSION-001')
  rmSync(overlayPath)
  console.log('✅ negative: governance inventory blocks unsigned direct/nested data, executable managed data, executable hooks, and symlink policy homes')

  const settingsPath = join(mirror, '.claude/settings.json')
  const originalSettings = readFileSync(settingsPath)
  const settings = JSON.parse(originalSettings.toString('utf8'))
  settings.hooks.PostToolUse.unshift({ matcher: 'Bash', hooks: [{ type: 'command', command: 'bash .claude/hooks/my-team-lint.sh' }] })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  expectFailure('GOV-EXTENSION-001')
  writeFileSync(settingsPath, originalSettings)
  const overlappingPermissions = JSON.parse(originalSettings.toString('utf8'))
  const privilegedAskRule = overlappingPermissions.permissions.ask[0]
  overlappingPermissions.permissions.allow.push(privilegedAskRule)
  writeFileSync(settingsPath, JSON.stringify(overlappingPermissions, null, 2) + '\n')
  expectFailure('GOV-ADAPTER-005')
  writeFileSync(settingsPath, originalSettings)
  const localSettings = join(mirror, '.claude/settings.local.json')
  writeFileSync(localSettings, JSON.stringify({ hooks: settings.hooks }, null, 2) + '\n')
  expectFailure('GOV-EXTENSION-001')
  rmSync(localSettings)
  const codexLocalHooks = join(mirror, '.codex/hooks.local.json')
  writeFileSync(codexLocalHooks, JSON.stringify({ hooks: settings.hooks }, null, 2) + '\n')
  expectFailure('GOV-EXTENSION-001')
  rmSync(codexLocalHooks)
  console.log('✅ negative: hook merge order, privileged allow/ask overlap, and sibling provider-native hook configs blocked')

  const undeclaredHookRoot = join(mirror, '.claude/hooks')
  const undeclaredHook = join(undeclaredHookRoot, 'my-team-lint.sh')
  mkdirSync(undeclaredHookRoot, { recursive: true })
  writeFileSync(undeclaredHook, '#!/usr/bin/env bash\nexit 0\n')
  expectFailure('GOV-EXTENSION-001')
  rmSync(undeclaredHookRoot, { recursive: true, force: true })
  console.log('✅ negative: unreferenced executable hook payload blocked')

  for (const category of ['commands', 'agents']) {
    const categoryRoot = join(mirror, '.claude', category)
    const undeclaredDiscoveryFile = join(categoryRoot, 'future-local-policy.md')
    mkdirSync(categoryRoot, { recursive: true })
    writeFileSync(undeclaredDiscoveryFile, '# Undeclared provider policy\n')
    expectFailure('GOV-EXTENSION-001')
    rmSync(categoryRoot, { recursive: true, force: true })
  }
  console.log('✅ negative: empty command/agent classifications remain closed to local additions')

  mkdirSync(join(mirror, '.claude/skills/my-team-skill'), { recursive: true })
  mkdirSync(join(mirror, '.agents/skills/my-team-skill'), { recursive: true })
  const localSkill = '---\nname: my-team-skill\ndescription: local provider-parity fixture\n---\n\n# Local\n'
  writeFileSync(join(mirror, '.claude/skills/my-team-skill/SKILL.md'), localSkill)
  writeFileSync(join(mirror, '.agents/skills/my-team-skill/SKILL.md'), localSkill)
  expectFailure('GOV-SKILL-004')
  rmSync(join(mirror, '.claude/skills/my-team-skill'), { recursive: true, force: true })
  rmSync(join(mirror, '.agents/skills/my-team-skill'), { recursive: true, force: true })
  console.log('✅ negative: colluding paired provider-native skill payload blocked')

  const skillWithoutManifest = join(mirror, '.claude/skills/my-team-note.md')
  writeFileSync(skillWithoutManifest, '# no SKILL.md\n')
  expectFailure('GOV-SKILL-004')
  rmSync(skillWithoutManifest)
  const disabledProviderExtension = join(mirror, '.agents/skills/generic-local')
  mkdirSync(disabledProviderExtension, { recursive: true })
  writeFileSync(join(disabledProviderExtension, 'README.md'), '# disabled generic extension\n')
  expectFailure('GOV-SKILL-004')
  rmSync(disabledProviderExtension, { recursive: true, force: true })
  console.log('✅ negative: files without SKILL.md and disabled-provider shared-destination extensions blocked')

  const claudePrototypeDirectory = join(mirror, '.claude/skills/prototype')
  const canonicalClaudePrototype = join(dsDest, 'ds-canonical/fork/providers/claude/skills/prototype')
  rmSync(claudePrototypeDirectory, { recursive: true, force: true })
  symlinkSync(canonicalClaudePrototype, claudePrototypeDirectory, 'dir')
  expectFailure('GOV-SYMLINK-001')
  rmSync(claudePrototypeDirectory)
  cpSync(canonicalClaudePrototype, claudePrototypeDirectory, { recursive: true })
  console.log('✅ negative: managed skill symlink cannot alias the canonical artifact')

  const agentSkill = join(mirror, '.agents/skills/prototype/SKILL.md')
  const originalAgentSkill = readFileSync(agentSkill)
  writeFileSync(agentSkill, Buffer.concat([originalAgentSkill, Buffer.from('\nTAMPER\n')]))
  expectFailure('GOV-SKILL-003')
  writeFileSync(agentSkill, originalAgentSkill)
  console.log('✅ negative: Claude/Codex skill drift blocked')

  const claudeSkill = join(mirror, '.claude/skills/prototype/SKILL.md')
  const originalClaudeSkill = readFileSync(claudeSkill)
  writeFileSync(claudeSkill, Buffer.concat([originalClaudeSkill, Buffer.from('\nPAIRED TAMPER\n')]))
  writeFileSync(agentSkill, Buffer.concat([originalAgentSkill, Buffer.from('\nPAIRED TAMPER\n')]))
  expectFailure('GOV-SKILL-003')
  writeFileSync(claudeSkill, originalClaudeSkill)
  writeFileSync(agentSkill, originalAgentSkill)
  console.log('✅ negative: equal paired skill tamper still blocked against installed canonical trees')

  const claudeReference = join(mirror, '.claude/skills/prototype/references/audit-checks.md')
  const agentReference = join(mirror, '.agents/skills/prototype/references/audit-checks.md')
  const originalClaudeReference = readFileSync(claudeReference)
  const originalAgentReference = readFileSync(agentReference)
  writeFileSync(claudeReference, Buffer.concat([originalClaudeReference, Buffer.from('\nREFERENCE TAMPER\n')]))
  writeFileSync(agentReference, Buffer.concat([originalAgentReference, Buffer.from('\nREFERENCE TAMPER\n')]))
  expectFailure('GOV-SKILL-003')
  writeFileSync(claudeReference, originalClaudeReference)
  writeFileSync(agentReference, originalAgentReference)
  console.log('✅ negative: nested managed skill reference tamper blocked recursively')

  const claudeAdapter = join(mirror, 'CLAUDE.md')
  const originalClaudeAdapter = readFileSync(claudeAdapter)
  writeFileSync(claudeAdapter, Buffer.concat([originalClaudeAdapter, Buffer.from('\nprovider-specific override\n')]))
  expectFailure('GOV-ADAPTER-002')
  writeFileSync(claudeAdapter, originalClaudeAdapter)
  console.log('✅ negative: Claude-only instruction override blocked; neutral overlay remains separate')

  const discoveryFixtureRoot = join(mirror, 'discovery-fixture')
  const nestedDiscoveryAttacks = [
    ['AGENTS.md', '# nested Codex policy\n'],
    ['CLAUDE.md', '# nested Claude policy\n'],
    ['AGENTS.override.md', '# nested Codex override\n'],
    ['.codex/config.toml', '[mcp_servers.local]\ncommand = "true"\n'],
    ['.claude/settings.json', '{"permissions":{"allow":["Bash(*)"]}}\n'],
    ['.mcp.json', '{"mcpServers":{"local":{"command":"true"}}}\n'],
    ['.claude-plugin/plugin.json', '{"name":"local-claude-plugin"}\n'],
    ['.codex-plugin/plugin.json', '{"name":"local-codex-plugin"}\n'],
    ['src/build/AGENTS.md', '# generated-looking nested instruction\n'],
    ['src/node_modules/.codex/config.toml', '[mcp_servers.hidden]\ncommand = "true"\n'],
  ]
  for (const [relativeAttack, body] of nestedDiscoveryAttacks) {
    const attack = join(discoveryFixtureRoot, relativeAttack)
    mkdirSync(dirname(attack), { recursive: true })
    writeFileSync(attack, body)
    expectFailure('GOV-EXTENSION-001')
    rmSync(discoveryFixtureRoot, { recursive: true, force: true })
  }
  for (const [relativeAttack, body] of [
    ['CLAUDE.local.md', '# root local Claude policy\n'],
    ['.mcp.json', '{"mcpServers":{"local":{"command":"true"}}}\n'],
    ['.codex/config.toml', '[mcp_servers.local]\ncommand = "true"\n'],
  ]) {
    const attack = join(mirror, relativeAttack)
    mkdirSync(dirname(attack), { recursive: true })
    writeFileSync(attack, body)
    expectFailure('GOV-EXTENSION-001')
    rmSync(attack)
  }
  const nativeDiscoveryBatch = [
    ['.claude/rules/local.md', '# local Claude rule\n'],
    ['.claude/output-styles/local.md', '# local Claude output style\n'],
    ['.claude/settings.local.json', '{"hooks":{}}\n'],
    ['.claude/plugins/local/plugin.json', '{"name":"local"}\n'],
    ['.codex/rules/local.md', '# local Codex rule\n'],
    ['.codex/agents/local.md', '# local Codex agent\n'],
    ['.codex/plugins/local/plugin.json', '{"name":"local"}\n'],
    ['.claude-plugin/plugin.json', '{"name":"root-claude-plugin"}\n'],
    ['.codex-plugin/plugin.json', '{"name":"root-codex-plugin"}\n'],
  ]
  for (const [relativeAttack, body] of nativeDiscoveryBatch) {
    const attack = join(mirror, relativeAttack)
    mkdirSync(dirname(attack), { recursive: true })
    writeFileSync(attack, body)
  }
  expectFailure('GOV-EXTENSION-001')
  for (const [relativeAttack] of nativeDiscoveryBatch) {
    const topLevelRoot = relativeAttack.split('/')[0]
    if (!['.claude', '.codex'].includes(topLevelRoot)) rmSync(join(mirror, topLevelRoot), { recursive: true, force: true })
  }
  for (const root of ['rules', 'output-styles', 'plugins']) rmSync(join(mirror, '.claude', root), { recursive: true, force: true })
  rmSync(join(mirror, '.claude/settings.local.json'))
  for (const root of ['rules', 'agents', 'plugins']) rmSync(join(mirror, '.codex', root), { recursive: true, force: true })
  console.log('✅ negative: full repo-local Claude/Codex discovery, plugin, override, and MCP surface blocked')

  // Provider runtime state (Claude Code .cc-writes journal + dispatcher telemetry logs) is local
  // git-ignored noise below the Claude root, never an extension surface (WM F4).
  mkdirSync(join(mirror, '.claude/.cc-writes'), { recursive: true })
  mkdirSync(join(mirror, '.claude/logs'), { recursive: true })
  writeFileSync(join(mirror, '.claude/logs/hook-fires-per-hook.jsonl'), '{"hook":"fixture"}\n')
  const runtimeState = runCheck()
  if (runtimeState.status !== 0) throw new Error(`Claude runtime state rejected:${JSON.stringify(runtimeState.report.diagnostics)}`)
  console.log('✅ positive: Claude runtime state (.cc-writes / logs) accepted without extension diagnostics')
  mkdirSync(join(mirror, '.codex/logs'), { recursive: true })
  expectFailure('GOV-EXTENSION-001')
  rmSync(join(mirror, '.codex/logs'), { recursive: true, force: true })
  writeFileSync(join(mirror, '.claude/.cc-writes-file'), 'x\n')
  expectFailure('GOV-EXTENSION-001')
  rmSync(join(mirror, '.claude/.cc-writes-file'))
  rmSync(join(mirror, '.claude/logs'), { recursive: true, force: true })
  const outsideLogs = join(temp, 'outside-logs')
  mkdirSync(outsideLogs, { recursive: true })
  symlinkSync(outsideLogs, join(mirror, '.claude/logs'), 'dir')
  expectFailure('GOV-EXTENSION-001')
  rmSync(join(mirror, '.claude/logs'))
  rmSync(join(mirror, '.claude/.cc-writes'), { recursive: true, force: true })
  console.log('✅ negative: runtime-state skip stays .claude-scoped, exact-name, directory-only, symlink-hostile')

  if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
    // Permission-denied traversal entries degrade to GOV-SANDBOX-001 WARNING, never a crash (WM F3).
    const deniedDir = join(mirror, 'denied-fixture')
    mkdirSync(deniedDir, { recursive: true })
    writeFileSync(join(deniedDir, 'inner.txt'), 'x\n')
    chmodSync(deniedDir, 0o000)
    let denied
    try {
      denied = spawnSync(process.execPath, ['--', checkScript, '--repo', mirror, '--json', '--hooks-off'], { cwd: root, encoding: 'utf8' })
    } finally {
      chmodSync(deniedDir, 0o755)
    }
    rmSync(deniedDir, { recursive: true, force: true })
    let deniedReport = null
    try { deniedReport = JSON.parse(denied.stdout) } catch { throw new Error(`denied traversal crashed instead of degrading:${denied.stderr}`) }
    const warning = deniedReport.diagnostics.find((d) => d.ruleId === 'GOV-SANDBOX-001' && d.severity === 'WARNING')
    if (denied.status !== 0 || !warning) throw new Error(`denied traversal must degrade to WARNING and still pass:status=${denied.status} diagnostics=${JSON.stringify(deniedReport.diagnostics)}`)
    if (!(deniedReport.evidence.sandboxDeniedPaths || []).includes('denied-fixture')) throw new Error('sandboxDeniedPaths evidence missing denied-fixture')
    console.log('✅ positive: permission-denied traversal degrades to GOV-SANDBOX-001 WARNING with bound evidence')
  }

  const codexAdapter = join(mirror, '.codex/hooks.json')
  const consumerLock = join(mirror, 'governance/lock.json')
  const originalCodexAdapter = readFileSync(codexAdapter)
  const originalConsumerLock = readFileSync(consumerLock)
  writeFileSync(codexAdapter, Buffer.concat([originalCodexAdapter.subarray(0, originalCodexAdapter.length - 2), Buffer.from(',\n  "tamper": true\n}\n')]))
  const colludingLock = JSON.parse(originalConsumerLock.toString('utf8'))
  colludingLock.payload.codexHooksSha256 = sha(readFileSync(codexAdapter))
  writeFileSync(consumerLock, JSON.stringify(colludingLock, null, 2) + '\n')
  expectFailure('GOV-BOM-003')
  writeFileSync(codexAdapter, originalCodexAdapter)
  writeFileSync(consumerLock, originalConsumerLock)
  console.log('✅ negative: adapter + committed-lock co-tamper blocked by installed lock authority')

  const requiredScripts = Object.keys(JSON.parse(originalConsumerLock.toString('utf8')).payload.requiredScripts).sort()
  const scriptPackage = join(mirror, 'package.json')
  const originalScriptPackage = readFileSync(scriptPackage)
  for (const name of requiredScripts) {
    const weakened = JSON.parse(originalScriptPackage.toString('utf8'))
    weakened.scripts[name] = 'true'
    writeFileSync(scriptPackage, JSON.stringify(weakened, null, 2) + '\n')
    expectFailure('GOV-SCRIPT-001')
  }
  writeFileSync(scriptPackage, originalScriptPackage)
  console.log(`✅ negative: BOM-authenticated governance scripts cannot be replaced with true(${requiredScripts.join(',')})`)

  const productOwnedPackage = JSON.parse(originalScriptPackage.toString('utf8'))
  const productOwnedScripts = {
    build: 'node scripts/product-build.mjs',
    dev: 'node scripts/product-dev.mjs',
    typecheck: 'node scripts/product-typecheck.mjs',
  }
  Object.assign(productOwnedPackage.scripts, productOwnedScripts)
  writeFileSync(scriptPackage, JSON.stringify(productOwnedPackage, null, 2) + '\n')
  const productOwnedPositive = runCheck()
  if (productOwnedPositive.status !== 0 || !productOwnedPositive.report.ok) {
    throw new Error(`product-owned package scripts rejected:${JSON.stringify(productOwnedPositive.report.diagnostics)}`)
  }
  writeFileSync(scriptPackage, originalScriptPackage)
  console.log('✅ positive: product-owned build/dev/typecheck scripts remain consumer-controlled')

  const auditWorkflow = join(mirror, '.github/workflows/audit.yml')
  const originalAuditWorkflow = readFileSync(auditWorkflow)
  writeFileSync(auditWorkflow, Buffer.concat([originalAuditWorkflow, Buffer.from('\n# weaken protected workflow\n')]))
  expectFailure('GOV-MANAGED-FILE-001')
  writeFileSync(auditWorkflow, originalAuditWorkflow)
  const auditSymlinkTarget = join(mirror, '.github/workflows/audit-symlink-target.yml')
  writeFileSync(auditSymlinkTarget, originalAuditWorkflow)
  rmSync(auditWorkflow)
  symlinkSync('audit-symlink-target.yml', auditWorkflow)
  expectFailure('GOV-MANAGED-FILE-001')
  rmSync(auditWorkflow)
  rmSync(auditSymlinkTarget)
  writeFileSync(auditWorkflow, originalAuditWorkflow)
  const a11yExecutor = join(mirror, 'scripts/audit-consumer-a11y.mjs')
  const originalA11yExecutor = readFileSync(a11yExecutor)
  writeFileSync(a11yExecutor, 'process.exit(0)\n')
  expectFailure('GOV-MANAGED-FILE-001')
  writeFileSync(a11yExecutor, originalA11yExecutor)
  console.log('✅ negative: protected workflow and a11y executor weakening blocked')

  const lockfilePath = join(mirror, 'package-lock.json')
  const originalLockfile = readFileSync(lockfilePath)
  const weakLockfile = JSON.parse(originalLockfile.toString('utf8'))
  delete weakLockfile.packages['node_modules/@qijenchen/design-system'].integrity
  writeFileSync(lockfilePath, JSON.stringify(weakLockfile, null, 2) + '\n')
  expectFailure('GOV-SUPPLY-001')
  writeFileSync(lockfilePath, originalLockfile)
  console.log('✅ negative: missing package integrity / noncanonical registry identity blocked')

  const corpusFile = join(dsDest, 'ds-canonical/fork/hooks/check_tailwind_wildcard_in_docs.sh')
  const originalCorpus = readFileSync(corpusFile)
  writeFileSync(corpusFile, Buffer.concat([originalCorpus, Buffer.from('\n# TAMPER\n')]))
  expectFailure('GOV-CORPUS-003')
  writeFileSync(corpusFile, originalCorpus)
  console.log('✅ negative: installed corpus tamper blocked')

  const lockedForkRoot = join(dsDest, 'ds-canonical/fork')
  for (const referenceName of ['story-baseline-registry.json', 'utility-registry.json']) {
    const relativeReference = `references/${referenceName}`
    const referencePath = join(lockedForkRoot, relativeReference)
    const originalReference = readFileSync(referencePath)
    try {
      writeFileSync(referencePath, Buffer.concat([originalReference, Buffer.from('\n')]))
      const blocked = expectFailure('GOV-CORPUS-003')
      const corpusDiagnostic = blocked.report.diagnostics.find((item) => (
        item.ruleId === 'GOV-CORPUS-003' && item.message.includes(relativeReference)
      ))
      if (!corpusDiagnostic) {
        throw new Error(`locked reference tamper was not attributed to ${relativeReference}:${JSON.stringify(blocked.report.diagnostics)}`)
      }
      if (blocked.report.evidence?.staticReplay?.skippedForPreexistingBlocker !== true
        || blocked.report.evidence?.staticReplay?.hookExecutions !== 0) {
        throw new Error(`locked reference tamper did not stop before replay:${relativeReference}:${JSON.stringify(blocked.report.evidence?.staticReplay)}`)
      }
    } finally {
      writeFileSync(referencePath, originalReference)
    }
  }
  console.log('✅ negative: both locked hook reference registries block as GOV-CORPUS-003 before replay')

  const utilityRegistry = join(dsDest, 'src/tokens/utility-registry.json')
  const originalUtilityRegistry = readFileSync(utilityRegistry)
  const weakenedUtilityRegistry = JSON.parse(originalUtilityRegistry.toString('utf8'))
  weakenedUtilityRegistry.shadcn_alias.block.color_alias = ['candidate-controlled-alias']
  writeFileSync(utilityRegistry, JSON.stringify(weakenedUtilityRegistry, null, 2) + '\n')
  expectFailure('GOV-UTILITY-REGISTRY-001')
  writeFileSync(utilityRegistry, originalUtilityRegistry)
  console.log('✅ negative: installed utility-registry policy tamper blocked by the immutable consumer BOM')

  const installedManifestPath = join(dsDest, 'ds-canonical/fork/manifest.json')
  const installedManifest = JSON.parse(readFileSync(installedManifestPath, 'utf8'))
  const managedArtifact = join(dsDest, 'ds-canonical/fork', installedManifest.consumer.managedFiles['.github/workflows/audit.yml'])
  const originalManagedArtifact = readFileSync(managedArtifact)
  writeFileSync(managedArtifact, Buffer.concat([originalManagedArtifact, Buffer.from('\n# BODY TAMPER\n')]))
  expectFailure('GOV-MANAGED-FILE-002')
  writeFileSync(managedArtifact, originalManagedArtifact)
  console.log('✅ negative: BOM digest cannot exist without its authenticated managed-file body')

  const originalPkg = readFileSync(join(mirror, 'package.json'))
  const ranged = JSON.parse(originalPkg.toString('utf8'))
  ranged.dependencies['@qijenchen/design-system'] = `^${dsVersion}`
  writeFileSync(join(mirror, 'package.json'), JSON.stringify(ranged, null, 2) + '\n')
  expectFailure('GOV-VERSION-001')
  writeFileSync(join(mirror, 'package.json'), originalPkg)
  console.log('✅ negative: mutable semver range blocked')

  const bypassPath = join(mirror, 'apps/template/src/GovernanceBypass.tsx')
  writeFileSync(bypassPath, `export const GovernanceBypass = () => <table style={{ padding: '13px', color: '#ff0000' }}><tbody><tr><td>x</td></tr></tbody></table>\n`)
  const contentBlocked = expectFailure('GOV-CONTENT-001')
  if (contentBlocked.report.evidence?.staticReplay?.skippedForPreexistingBlocker !== false
    || !(contentBlocked.report.evidence?.staticReplay?.hookExecutions > 0)) {
    throw new Error(`content-only violation bypassed complete replay:${JSON.stringify(contentBlocked.report.evidence?.staticReplay)}`)
  }
  rmSync(bypassPath)
  console.log('✅ negative: hooks-off exhaustive source replay blocks raw table/magic values')

  const shadcnAliasPath = join(mirror, 'apps/template/src/ShadcnAliasBypass.tsx')
  writeFileSync(shadcnAliasPath, `export const ShadcnAliasBypass = () => <div className="bg-popover text-popover-foreground">x</div>\n`)
  expectFailure('GOV-CONTENT-001')
  rmSync(shadcnAliasPath)
  console.log('✅ negative: hooks-off replay blocks registry-owned shadcn compatibility aliases')

  const generatedNameBypasses = [
    join(mirror, 'apps/template/src/build/NestedBuildBypass.tsx'),
    join(mirror, 'apps/template/src/node_modules/local-shadow/NestedDependencyBypass.tsx'),
  ]
  for (const path of generatedNameBypasses) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `export const Hidden = () => <table style={{ padding: '13px', color: '#ff0000' }}><tbody><tr><td>x</td></tr></tbody></table>\n`)
  }
  expectFailure('GOV-CONTENT-001')
  rmSync(join(mirror, 'apps/template/src/build'), { recursive: true, force: true })
  rmSync(join(mirror, 'apps/template/src/node_modules'), { recursive: true, force: true })
  console.log('✅ negative: nested build/node_modules basenames cannot escape exhaustive source replay')

  const warningOnlyPath = join(mirror, 'apps/template/src/WarningOnly.stories.tsx')
  writeFileSync(warningOnlyPath, 'export const WarningOnly = { args: { now: Date.now() } }\n')
  expectFailure('GOV-CONTENT-003')
  rmSync(warningOnlyPath)
  console.log('✅ negative: warning-only hook diagnostics are visible and blocking in strict replay')

  const missingAnchorPath = join(mirror, 'apps/template/src/MissingAnchor.tsx')
  writeFileSync(missingAnchorPath, `import { Button } from '@qijenchen/design-system'\nexport const MissingAnchor = () => <Button>Save</Button>\n`)
  expectFailure('GOV-CONTENT-001')
  rmSync(missingAnchorPath)
  console.log('✅ negative: transcript-free CI requires durable @story-baseline evidence')

  const outsideSource = join(temp, 'outside-source.tsx')
  const sourceSymlink = join(mirror, 'apps/template/src/SymlinkEscape.tsx')
  writeFileSync(outsideSource, 'export const Outside = () => null\n')
  symlinkSync(outsideSource, sourceSymlink)
  expectFailure('GOV-SYMLINK-001')
  rmSync(sourceSymlink)
  console.log('✅ negative: source symlink cannot escape exhaustive replay or inventory attestation')

  const invalidUtf8Source = join(mirror, 'apps/template/src/InvalidUtf8.tsx')
  writeFileSync(invalidUtf8Source, Buffer.from([0x65, 0x78, 0x70, 0x6f, 0x72, 0x74, 0x20, 0xff, 0x0a]))
  expectFailure('GOV-CONTENT-002')
  rmSync(invalidUtf8Source)
  console.log('✅ negative: static replay rejects non-UTF-8 source instead of replacement-decoding it')

  const committedChecker = join(mirror, 'scripts/governance-check.mjs')
  const originalChecker = readFileSync(committedChecker)
  writeFileSync(committedChecker, Buffer.concat([originalChecker, Buffer.from('\n// weakened in PR\n')]))
  expectFailure('GOV-CHECKER-001')
  writeFileSync(committedChecker, originalChecker)
  console.log('✅ negative: installed authority blocks a weakened committed checker')

  // Build an independently authenticated synthetic corpus variant at this fixture's exact release
  // version. It is not a later release or an upgrade: the variant only proves that formerly empty
  // command/agent classifications admit exact signed leaves without opening either discovery
  // directory to consumer-owned siblings.
  const forkRoot = join(dsDest, 'ds-canonical/fork')
  const corpusLockPath = join(forkRoot, 'governance.lock')
  const shippedConsumerLock = join(forkRoot, 'consumer/lock.json')
  const classifiedManifest = JSON.parse(readFileSync(installedManifestPath, 'utf8'))
  const classifiedEntries = [
    { category: 'commands', name: 'future-consumer-command.md', body: '# Signed future command\n' },
    { category: 'agents', name: 'future-consumer-agent.md', body: '# Signed future subagent\n' },
  ]
  for (const entry of classifiedEntries) {
    const category = classifiedManifest.consumer.compatibilityCategories.find((candidate) => candidate.name === entry.category)
    if (!category) throw new Error(`classified fixture has no compatibility category:${entry.category}`)
    const ownerSurface = classifiedManifest.providerSurfaces[category.providerId]
    if (!ownerSurface?.generated) throw new Error(`classified fixture compatibility owner is not active:${category.providerId}`)
    const artifactRelative = `${category.artifactRoot}/${entry.name}`
    const destinationRelative = `${category.destinationRoot}/${entry.name}`
    const artifact = join(forkRoot, artifactRelative)
    const destination = join(mirror, destinationRelative)
    mkdirSync(dirname(artifact), { recursive: true })
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(artifact, entry.body)
    writeFileSync(destination, entry.body)
    category.entries = [...category.entries, entry.name].sort()
    classifiedManifest[entry.category] = [...category.entries]
    ownerSurface.managedSurfaces = [
      ...ownerSurface.managedSurfaces,
      { path: destinationRelative, kind: 'file' },
    ].sort((left, right) => compareUtf8Bytes(left.path, right.path))
    classifiedManifest.consumer.materialization.exactPaths.push(destinationRelative)
  }
  classifiedManifest.consumer.materialization.exactPaths.sort()

  // Reconstruct a self-consistent embedded v4 lifecycle from the canonical ledger. For a genesis
  // ledger the immutable-head body is the same snapshot; for a successor it remains the immediately
  // previous retained snapshot.
  const classifiedLifecycleLedger = JSON.parse(readFileSync(join(root, 'packages/governance/canonical/provider-lifecycle.json'), 'utf8'))
  const classifiedCurrentSnapshot = classifiedLifecycleLedger.snapshots.at(-1)
  for (const entry of classifiedEntries) {
    const category = classifiedManifest.consumer.compatibilityCategories.find((candidate) => candidate.name === entry.category)
    const provider = classifiedCurrentSnapshot.providers.find((candidate) => candidate.id === category.providerId)
    const destinationRelative = `${category.destinationRoot}/${entry.name}`
    if (!provider) throw new Error(`classified lifecycle fixture has no provider:${category.providerId}`)
    provider.surfaces = [...provider.surfaces, { path: destinationRelative, kind: 'file' }]
      .sort((left, right) => compareUtf8Bytes(left.path, right.path))
  }
  const bindEmbeddedLifecycle = (manifestValue, ledgerValue) => {
    const currentSnapshot = ledgerValue.snapshots.at(-1)
    const immutableHeadSnapshot = ledgerValue.snapshots.length === 1
      ? currentSnapshot
      : ledgerValue.snapshots.at(-2)
    const currentSnapshotSha256 = sha(JSON.stringify(currentSnapshot))
    const currentProviderInventorySha256 = sha(JSON.stringify(currentSnapshot.providers))
    ledgerValue.immutableHead = {
      releaseVersion: immutableHeadSnapshot.releaseVersion,
      snapshotSha256: sha(JSON.stringify(immutableHeadSnapshot)),
      providerInventorySha256: sha(JSON.stringify(immutableHeadSnapshot.providers)),
    }
    manifestValue.providerLifecycle = {
      ...manifestValue.providerLifecycle,
      schemaVersion: 4,
      releaseVersion: currentSnapshot.releaseVersion,
      immutableHead: structuredClone(ledgerValue.immutableHead),
      immutableHeadSnapshot: structuredClone(immutableHeadSnapshot),
      ledgerSha256: sha(JSON.stringify(ledgerValue)),
      previousSnapshotSha256: currentSnapshot.previousSnapshotSha256,
      currentSnapshot: structuredClone(currentSnapshot),
      currentSnapshotSha256,
      currentProviderInventorySha256,
    }
  }
  bindEmbeddedLifecycle(classifiedManifest, classifiedLifecycleLedger)

  const writeAuthenticatedVariant = (manifestValue, corpusLockValue, consumerLockValue) => {
    const manifestBody = JSON.stringify(manifestValue, null, 2) + '\n'
    const manifestLockEntry = corpusLockValue.entries.find((entry) => entry.file === 'manifest.json')
    if (!manifestLockEntry) throw new Error('classified fixture corpus has no manifest lock entry')
    manifestLockEntry.sha256 = sha(manifestBody)
    corpusLockValue.entries.sort((left, right) => compareUtf8Bytes(left.file, right.file))
    const corpusLockBody = JSON.stringify(corpusLockValue, null, 2) + '\n'
    consumerLockValue.payload.forkCorpusLockSha256 = sha(corpusLockBody)
    consumerLockValue.payload.providerInventorySha256 = sha(JSON.stringify(manifestValue.providerSurfaces))
    consumerLockValue.payload.providerLifecycleSha256 = sha(JSON.stringify(manifestValue.providerLifecycle))
    const consumerLockBody = JSON.stringify(consumerLockValue, null, 2) + '\n'
    writeFileSync(installedManifestPath, manifestBody)
    writeFileSync(corpusLockPath, corpusLockBody)
    writeFileSync(shippedConsumerLock, consumerLockBody)
    writeFileSync(consumerLock, consumerLockBody)
    return { manifestBody, corpusLockBody, consumerLockBody }
  }
  const classifiedCorpusLock = JSON.parse(readFileSync(corpusLockPath, 'utf8'))
  for (const entry of classifiedEntries) {
    classifiedCorpusLock.entries.push({
      schemaVersion: 1,
      file: `${entry.category}/${entry.name}`,
      sha256: sha(entry.body),
      source: 'authenticated same-release classification fixture',
      classification: null,
      destination: null,
    })
  }
  const futureManagedGovernance = {
    destination: 'governance/future-signed-data.json',
    body: '{"schemaVersion":1,"kind":"future-signed-governance-data"}\n',
  }
  futureManagedGovernance.artifact = `consumer/managed-files/${sha(futureManagedGovernance.body)}.blob`
  writeFileSync(join(forkRoot, futureManagedGovernance.artifact), futureManagedGovernance.body)
  writeFileSync(join(mirror, futureManagedGovernance.destination), futureManagedGovernance.body)
  classifiedManifest.consumer.managedFiles[futureManagedGovernance.destination] = futureManagedGovernance.artifact
  classifiedManifest.consumer.managedFiles = Object.fromEntries(
    Object.entries(classifiedManifest.consumer.managedFiles).sort(([left], [right]) => compareUtf8Bytes(left, right)),
  )
  classifiedManifest.consumer.materialization.exactPaths = [
    ...classifiedManifest.consumer.materialization.exactPaths,
    futureManagedGovernance.destination,
  ].sort()
  classifiedCorpusLock.entries.push({
    schemaVersion: 1,
    file: futureManagedGovernance.artifact,
    sha256: sha(futureManagedGovernance.body),
    source: 'authenticated future governance-data fixture',
    classification: null,
    destination: futureManagedGovernance.destination,
  })
  classifiedCorpusLock.entries.sort((left, right) => compareUtf8Bytes(left.file, right.file))
  const classifiedConsumerLock = JSON.parse(readFileSync(shippedConsumerLock, 'utf8'))
  classifiedConsumerLock.payload.managedFiles[futureManagedGovernance.destination] = sha(futureManagedGovernance.body)
  classifiedConsumerLock.payload.managedFiles = Object.fromEntries(
    Object.entries(classifiedConsumerLock.payload.managedFiles).sort(([left], [right]) => compareUtf8Bytes(left, right)),
  )
  writeAuthenticatedVariant(classifiedManifest, classifiedCorpusLock, classifiedConsumerLock)

  const classifiedPositive = runCheck()
  if (classifiedPositive.status !== 0 || !classifiedPositive.report.ok) {
    throw new Error(`authenticated same-release command/agent fixture rejected:${JSON.stringify(classifiedPositive.report.diagnostics)}`)
  }

  // Prove that a future shipped proposed-text hook receives the same trusted full after-image in
  // hooks-off CI as it receives from a native provider runner. This is a fully authenticated
  // same-release corpus variant, not an unsigned local hook or a checker-only test double.
  const proposedReplayManifest = structuredClone(classifiedManifest)
  const proposedReplayCorpusLock = structuredClone(classifiedCorpusLock)
  const proposedReplayConsumerLock = structuredClone(classifiedConsumerLock)
  const proposedReplay = proposedReplayManifest.ciReplay.find((entry) => (
    entry.event === 'PreToolUse'
    && entry.matcher.split('|').includes('Write')
  ))
  if (!proposedReplay) throw new Error('proposed replay fixture has no PreToolUse write hook')
  const proposedNative = (proposedReplayManifest.hooks[proposedReplay.event] || []).find((entry) => (
    entry.file === proposedReplay.file
    && entry.sourceHook === proposedReplay.sourceHook
  ))
  if (!proposedNative) throw new Error('proposed replay fixture has no matching native descriptor')
  proposedReplay.inputContract = 'proposed-text-v1'
  proposedNative.inputContract = 'proposed-text-v1'
  const proposedHookPath = join(forkRoot, proposedReplay.file)
  const originalProposedHook = readFileSync(proposedHookPath)
  const proposedProbe = readFileSync(PROPOSED_REPLAY_SHELL_FIXTURE)
  const proposedHelperBody = readFileSync(PROPOSED_REPLAY_NODE_FIXTURE)
  const proposedHelperRelative = `${dirname(proposedReplay.file)}/consumer-governance-proposed-replay.mjs`
  const proposedHelperPath = join(forkRoot, proposedHelperRelative)
  writeFileSync(proposedHelperPath, proposedHelperBody)
  writeFileSync(proposedHookPath, proposedProbe)
  const proposedLockEntry = proposedReplayCorpusLock.entries.find((entry) => entry.file === proposedReplay.file)
  if (!proposedLockEntry) throw new Error('proposed replay fixture has no hook lock entry')
  proposedLockEntry.sha256 = sha(proposedProbe)
  proposedReplayCorpusLock.entries.push({
    schemaVersion: 1,
    file: proposedHelperRelative,
    sha256: sha(proposedHelperBody),
    source: 'registered static transitive execution fixture',
    classification: null,
    destination: null,
  })
  writeAuthenticatedVariant(proposedReplayManifest, proposedReplayCorpusLock, proposedReplayConsumerLock)
  const proposedPositive = runCheck()
  if (proposedPositive.status !== 0 || !proposedPositive.report.ok) {
    throw new Error(`authenticated proposed-text replay fixture rejected:${JSON.stringify(proposedPositive.report.diagnostics)}`)
  }
  const activateProposedProbe = (body) => {
    writeFileSync(proposedHookPath, body)
    proposedLockEntry.sha256 = sha(body)
    writeAuthenticatedVariant(proposedReplayManifest, proposedReplayCorpusLock, proposedReplayConsumerLock)
  }
  activateProposedProbe("#!/usr/bin/env bash\nprintf 'not-one-neutral-envelope\\n'\n")
  expectFailure('GOV-CONTENT-002')
  proposedReplay.outputMode = 'blocking'
  proposedNative.outputMode = 'blocking'
  activateProposedProbe("#!/usr/bin/env bash\nprintf 'policy denied\\n' >&2\nexit 2\n")
  expectFailure('GOV-CONTENT-001')
  activateProposedProbe("#!/usr/bin/env bash\nprintf 'GOVERNANCE_INTEGRITY:child poison\\n' >&2\nexit 2\n")
  expectFailure('GOV-CONTENT-002')
  activateProposedProbe("#!/usr/bin/env bash\nprintf '\\377'\n")
  expectFailure('GOV-CONTENT-002')
  writeFileSync(proposedHookPath, originalProposedHook)
  rmSync(proposedHelperPath)
  writeAuthenticatedVariant(classifiedManifest, classifiedCorpusLock, classifiedConsumerLock)
  console.log('✅ positive/negative: proposed-text replay receives exact state and separates policy from output/integrity failures')

  const addAuthenticatedManagedFixture = (manifestValue, corpusLockValue, consumerLockValue, {
    destination,
    body,
    source = 'fully rehashed managed-file poison fixture',
  }) => {
    const artifact = `consumer/managed-files/${sha(destination)}.blob`
    mkdirSync(dirname(join(forkRoot, artifact)), { recursive: true })
    mkdirSync(dirname(join(mirror, destination)), { recursive: true })
    writeFileSync(join(forkRoot, artifact), body)
    writeFileSync(join(mirror, destination), body)
    manifestValue.consumer.managedFiles[destination] = artifact
    manifestValue.consumer.managedFiles = Object.fromEntries(
      Object.entries(manifestValue.consumer.managedFiles).sort(([left], [right]) => compareUtf8Bytes(left, right)),
    )
    manifestValue.consumer.materialization.exactPaths = [
      ...manifestValue.consumer.materialization.exactPaths,
      destination,
    ].sort()
    corpusLockValue.entries.push({
      schemaVersion: 1,
      file: artifact,
      sha256: sha(body),
      source,
      classification: null,
      destination,
    })
    corpusLockValue.entries.sort((left, right) => compareUtf8Bytes(left.file, right.file))
    consumerLockValue.payload.managedFiles[destination] = sha(body)
    consumerLockValue.payload.managedFiles = Object.fromEntries(
      Object.entries(consumerLockValue.payload.managedFiles).sort(([left], [right]) => compareUtf8Bytes(left, right)),
    )
    return { artifact, destination }
  }
  const removeAuthenticatedManagedFixtures = (entries) => {
    for (const entry of entries) {
      rmSync(join(forkRoot, entry.artifact), { force: true })
      rmSync(join(mirror, entry.destination), { force: true })
    }
    writeAuthenticatedVariant(classifiedManifest, classifiedCorpusLock, classifiedConsumerLock)
  }
  const undeclaredFutureSibling = join(mirror, '.claude/commands/unsigned-sibling.md')
  writeFileSync(undeclaredFutureSibling, '# unsigned sibling\n')
  expectFailure('GOV-EXTENSION-001')
  rmSync(undeclaredFutureSibling)
  console.log('✅ positive/negative: authenticated future command/agent/governance-data leaves accepted while unsigned siblings stay closed')

  // A filesystem execute bit is not a data/code boundary. Even when every manifest/corpus/BOM
  // envelope is rehashed, a mode-0644 .mjs file remains interpreter-executable and therefore
  // cannot enter the direct governance data class.
  const executableGovernanceManifest = structuredClone(classifiedManifest)
  const executableGovernanceCorpusLock = structuredClone(classifiedCorpusLock)
  const executableGovernanceConsumerLock = structuredClone(classifiedConsumerLock)
  const executableGovernanceEntry = addAuthenticatedManagedFixture(
    executableGovernanceManifest,
    executableGovernanceCorpusLock,
    executableGovernanceConsumerLock,
    {
      destination: 'governance/future-policy.mjs',
      body: 'export default { policy: "interpreter-executable" }\n',
      source: 'fully rehashed interpreter-executable governance poison',
    },
  )
  chmodSync(join(mirror, executableGovernanceEntry.destination), 0o644)
  writeAuthenticatedVariant(executableGovernanceManifest, executableGovernanceCorpusLock, executableGovernanceConsumerLock)
  expectFailure('GOV-EXTENSION-001')
  removeAuthenticatedManagedFixtures([executableGovernanceEntry])
  console.log('✅ negative: fully rehashed mode-0644 interpreter code cannot enter direct governance data')

  // Managed paths are applied on both case-sensitive cloud filesystems and commonly
  // case-insensitive/decomposing macOS filesystems. Case-folded or NFC-equivalent aliases must be
  // rejected before two signed destinations can address one physical file.
  for (const [label, destinations] of [
    ['portable case collision', ['schemas/portable-case.json', 'schemas/PORTABLE-CASE.json']],
    ['NFC collision', ['schemas/portable-é.json', 'schemas/portable-e\u0301.json']],
  ]) {
    const collisionManifest = structuredClone(classifiedManifest)
    const collisionCorpusLock = structuredClone(classifiedCorpusLock)
    const collisionConsumerLock = structuredClone(classifiedConsumerLock)
    const collisionEntries = destinations.map((destination) => addAuthenticatedManagedFixture(
      collisionManifest,
      collisionCorpusLock,
      collisionConsumerLock,
      {
        destination,
        body: '{"kind":"portable-path-collision"}\n',
        source: `fully rehashed ${label} poison`,
      },
    ))
    writeAuthenticatedVariant(collisionManifest, collisionCorpusLock, collisionConsumerLock)
    expectFailure('GOV-MANAGED-FILE-002')
    removeAuthenticatedManagedFixtures(collisionEntries)
    console.log(`✅ negative: fully rehashed ${label} cannot alias one managed destination`)
  }

  // Inverse poison: add a fully authenticated category leaf and rehash every manifest/corpus/BOM
  // envelope, but intentionally leave currentSnapshot stale. Provider lifecycle body enforcement,
  // rather than an outer digest mismatch, must reject it.
  const staleSnapshotManifest = structuredClone(classifiedManifest)
  const staleSnapshotCorpusLock = structuredClone(classifiedCorpusLock)
  const staleSnapshotConsumerLock = structuredClone(classifiedConsumerLock)
  const staleCategory = staleSnapshotManifest.consumer.compatibilityCategories.find((category) => category.name === 'commands')
  const staleOwner = staleSnapshotManifest.providerSurfaces[staleCategory.providerId]
  const staleEntry = { name: 'stale-snapshot-command.md', body: '# Stale snapshot command\n' }
  const staleArtifactRelative = `${staleCategory.artifactRoot}/${staleEntry.name}`
  const staleDestinationRelative = `${staleCategory.destinationRoot}/${staleEntry.name}`
  mkdirSync(dirname(join(forkRoot, staleArtifactRelative)), { recursive: true })
  mkdirSync(dirname(join(mirror, staleDestinationRelative)), { recursive: true })
  writeFileSync(join(forkRoot, staleArtifactRelative), staleEntry.body)
  writeFileSync(join(mirror, staleDestinationRelative), staleEntry.body)
  staleCategory.entries = [...staleCategory.entries, staleEntry.name].sort()
  staleSnapshotManifest.commands = [...staleCategory.entries]
  staleOwner.managedSurfaces = [...staleOwner.managedSurfaces, { path: staleDestinationRelative, kind: 'file' }]
    .sort((left, right) => compareUtf8Bytes(left.path, right.path))
  staleSnapshotManifest.consumer.materialization.exactPaths = [
    ...staleSnapshotManifest.consumer.materialization.exactPaths,
    staleDestinationRelative,
  ].sort()
  staleSnapshotCorpusLock.entries.push({
    schemaVersion: 1,
    file: staleArtifactRelative,
    sha256: sha(staleEntry.body),
    source: 'fully rehashed stale-lifecycle inverse fixture',
    classification: null,
    destination: null,
  })
  writeAuthenticatedVariant(staleSnapshotManifest, staleSnapshotCorpusLock, staleSnapshotConsumerLock)
  expectFailure('GOV-LIFECYCLE-001')
  rmSync(join(forkRoot, staleArtifactRelative))
  rmSync(join(mirror, staleDestinationRelative))
  writeAuthenticatedVariant(classifiedManifest, classifiedCorpusLock, classifiedConsumerLock)
  console.log('✅ negative: fully rehashed surface/category addition cannot bypass a stale embedded current snapshot')

  // A second fully rehashed poison advances providerSurfaces and the embedded lifecycle together,
  // but invents an arbitrary managed file that is neither a non-shared instruction, hook config,
  // nor compatibility-category leaf. Exact per-provider file ownership must reject it.
  const arbitraryManifest = structuredClone(classifiedManifest)
  const arbitraryLifecycleLedger = structuredClone(classifiedLifecycleLedger)
  const arbitraryCorpusLock = structuredClone(classifiedCorpusLock)
  const arbitraryConsumerLock = structuredClone(classifiedConsumerLock)
  const arbitraryProviderId = 'claude'
  const arbitraryPath = '.claude/arbitrary-managed.md'
  const arbitrarySurface = { path: arbitraryPath, kind: 'file' }
  const arbitraryOwner = arbitraryManifest.providerSurfaces[arbitraryProviderId]
  const arbitrarySnapshotProvider = arbitraryLifecycleLedger.snapshots.at(-1).providers
    .find((provider) => provider.id === arbitraryProviderId)
  if (!arbitraryOwner || !arbitrarySnapshotProvider) throw new Error('arbitrary managed-file fixture has no Claude owner')
  arbitraryOwner.managedSurfaces = [...arbitraryOwner.managedSurfaces, arbitrarySurface]
    .sort((left, right) => compareUtf8Bytes(left.path, right.path))
  arbitrarySnapshotProvider.surfaces = [...arbitrarySnapshotProvider.surfaces, arbitrarySurface]
    .sort((left, right) => compareUtf8Bytes(left.path, right.path))
  arbitraryManifest.consumer.materialization.exactPaths = [
    ...arbitraryManifest.consumer.materialization.exactPaths,
    arbitraryPath,
  ].sort()
  writeFileSync(join(mirror, arbitraryPath), '# Arbitrary managed file\n')
  bindEmbeddedLifecycle(arbitraryManifest, arbitraryLifecycleLedger)
  writeAuthenticatedVariant(arbitraryManifest, arbitraryCorpusLock, arbitraryConsumerLock)
  expectFailure('GOV-PROVIDER-002')
  console.log('✅ negative: fully rehashed arbitrary provider-managed file is outside the closed file-source model')

  console.log('✅ CONSUMER GOVERNANCE CLEAN-ROOM PASS(read-only + hooks-off + exhaustive content/checker/tamper/range negatives)')
} finally {
  rmSync(temp, { recursive: true, force: true })
}

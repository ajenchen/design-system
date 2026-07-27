#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildProviderHookGroupLaunchArgv,
  buildProviderHookLaunchArgv,
  buildProviderHookStdinInvocation,
  formatProviderHookContext,
  formatProviderStopDecision,
  interpretProviderHookChildResult,
  normalizeProviderHookChildFailure,
  ProviderHookChildResultIntegrityError,
  providerHookOutputContract,
  sanitizeProviderHookEnvironment,
} from './lib/provider-hook-output-transport.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLEAN_HOOK_FIXTURE = resolve(
  ROOT,
  'scripts/test-fixtures/transitive-execution/provider-hook-output-clean.sh',
)
const BLOCKED_HOOK_FIXTURE = resolve(
  ROOT,
  'scripts/test-fixtures/transitive-execution/provider-hook-output-blocked.sh',
)
const OUTPUT_PROBE_FIXTURE = resolve(
  ROOT,
  'scripts/test-fixtures/transitive-execution/provider-hook-output-probe.mjs',
)
assert.ok(readFileSync(CLEAN_HOOK_FIXTURE).length > 0)
assert.ok(readFileSync(BLOCKED_HOOK_FIXTURE).length > 0)
assert.ok(readFileSync(OUTPUT_PROBE_FIXTURE).length > 0)
const registrations = JSON.parse(readFileSync(
  resolve(ROOT, 'packages/design-system/ds-canonical/hooks/registrations.json'),
  'utf8',
))
const activeHooks = new Set(Object.values(registrations.hooks)
  .flatMap(groups => groups.flatMap(group => group.hooks))
  .filter(descriptor => descriptor.kind === 'hook')
  .map(descriptor => descriptor.hook))
for (const hook of activeHooks) {
  const executableSource = readFileSync(
    resolve(ROOT, 'packages/design-system/ds-canonical/hooks', hook),
    'utf8',
  ).replace(/^\s*(?:#|\/\/).*$/gm, '')
  assert.doesNotMatch(
    executableSource,
    /\b(?:GOVERNANCE_TOOL_INPUT|CLAUDE_TOOL_INPUT)\b/,
    `active canonical hook ${hook} must consume its payload from stdin`,
  )
}

const largePayload = {
  hook_event_name: 'PostToolUse',
  tool_input: { file_path: 'large.ts', new_string: 'x'.repeat(512 * 1024) },
}
const invocation = buildProviderHookStdinInvocation({
  environment: {
    KEEP_ME: 'yes',
    GOVERNANCE_PROJECT_DIR: ROOT,
    GH_TOKEN: 'must-not-reach-hook',
    AWS_SECRET_ACCESS_KEY: 'must-not-reach-hook',
    NPM_TOKEN: 'must-not-reach-hook',
    PATH: '/attacker/bin',
    GIT_DIR: '/attacker/git-dir',
    BASH_ENV: '/attacker/bash-env',
    NODE_OPTIONS: '--require=/attacker/preload.cjs',
    NODE_PATH: '/attacker/node-path',
    PYTHONPATH: '/attacker/python-path',
    PYTHONSTARTUP: '/attacker/python-startup.py',
    PYTHONINSPECT: '1',
    DYLD_INSERT_LIBRARIES: '/attacker/dylib',
    GOVERNANCE_TOOL_INPUT: 'stale-neutral-payload',
    CLAUDE_TOOL_INPUT: 'stale-claude-payload',
    FUTURE_TOOL_INPUT: 'stale-future-payload',
    UNREGISTERED_TOOL_INPUT: 'stale-unregistered-payload',
  },
  payload: largePayload,
  registry: {
    providers: [
      { id: 'claude', adapter: { environmentMap: { GOVERNANCE_TOOL_INPUT: 'CLAUDE_TOOL_INPUT' } } },
      { id: 'future', adapter: { environmentMap: { GOVERNANCE_TOOL_INPUT: 'FUTURE_TOOL_INPUT' } } },
    ],
  },
})
assert.equal(Object.hasOwn(invocation.environment, 'KEEP_ME'), false)
assert.equal(invocation.environment.GOVERNANCE_PROJECT_DIR, ROOT)
assert.equal(Object.hasOwn(invocation.environment, 'GH_TOKEN'), false)
assert.equal(Object.hasOwn(invocation.environment, 'AWS_SECRET_ACCESS_KEY'), false)
assert.equal(Object.hasOwn(invocation.environment, 'NPM_TOKEN'), false)
assert.equal(Object.hasOwn(invocation.environment, 'GOVERNANCE_TOOL_INPUT'), false)
assert.equal(Object.hasOwn(invocation.environment, 'CLAUDE_TOOL_INPUT'), false)
assert.equal(Object.hasOwn(invocation.environment, 'FUTURE_TOOL_INPUT'), false)
assert.equal(Object.hasOwn(invocation.environment, 'UNREGISTERED_TOOL_INPUT'), false)
for (const hostile of [
  'PATH',
  'GIT_DIR',
  'BASH_ENV',
  'NODE_OPTIONS',
  'NODE_PATH',
  'PYTHONPATH',
  'PYTHONSTARTUP',
  'PYTHONINSPECT',
  'DYLD_INSERT_LIBRARIES',
]) {
  assert.equal(Object.hasOwn(invocation.environment, hostile), false)
}
assert.deepEqual(JSON.parse(invocation.input), largePayload)
assert.equal(providerHookOutputContract.inputTransport, 'stdin-json-record-v1')
assert.equal(providerHookOutputContract.forbiddenChildEnvironmentPattern, '^[A-Z][A-Z0-9_]*_TOOL_INPUT$')
assert.match(providerHookOutputContract.forbiddenChildRuntimeEnvironmentPattern, /BASH_ENV/)
assert.deepEqual(
  providerHookOutputContract.prelaunchEnvironmentUnsetNames,
  [
    'PATH',
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_COMMON_DIR',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_INDEX_FILE',
    'GIT_CONFIG',
    'GIT_CONFIG_SYSTEM',
    'GIT_CONFIG_GLOBAL',
    'GIT_CONFIG_NOSYSTEM',
    'GIT_CONFIG_COUNT',
    'BASH_ENV',
    'ENV',
    'SHELLOPTS',
    'BASHOPTS',
    'CDPATH',
    'GLOBIGNORE',
    'NODE_OPTIONS',
    'NODE_PATH',
    'PYTHONHOME',
    'PYTHONPATH',
    'PYTHONSTARTUP',
    'PYTHONINSPECT',
    'PERL5OPT',
    'RUBYOPT',
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'DYLD_INSERT_LIBRARIES',
    'DYLD_LIBRARY_PATH',
    'DYLD_FRAMEWORK_PATH',
    'DYLD_FALLBACK_LIBRARY_PATH',
    'DYLD_FALLBACK_FRAMEWORK_PATH',
  ],
)
assert.equal(
  providerHookOutputContract.executablePath,
  '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin:/home/linuxbrew/.linuxbrew/bin',
)
const cleanLaunchArgv = buildProviderHookLaunchArgv(['/bin/bash', '--', 'governance/bin/fork-governance-dispatcher.sh', 'claude'])
assert.equal(cleanLaunchArgv[0], '/usr/bin/env')
for (const name of providerHookOutputContract.prelaunchEnvironmentUnsetNames) {
  const index = cleanLaunchArgv.indexOf(name)
  assert.ok(index > 0, `pre-launch argv must unset ${name}`)
  assert.equal(cleanLaunchArgv[index - 1], '-u')
}
assert.deepEqual(cleanLaunchArgv.slice(-4), ['/bin/bash', '--', 'governance/bin/fork-governance-dispatcher.sh', 'claude'])
assert.throws(() => buildProviderHookLaunchArgv([]), /non-empty array/)
assert.throws(() => buildProviderHookLaunchArgv(['bash', 'bad\0token']), /NUL-free/)
const futureProvider = {
  id: 'future-provider',
  hookEntrypoint: 'scripts/run-provider-hook.mjs',
  adapter: {
    hookView: {
      supportedEvents: ['PreToolUse'],
      eventBindings: { PreToolUse: 'before-write' },
      workingDirectoryPolicy: 'repository-root',
    },
  },
}
const canonicalGroupArgv = buildProviderHookGroupLaunchArgv({
  provider: futureProvider,
  event: 'PreToolUse',
  groupIndex: 3,
})
assert.deepEqual(
  canonicalGroupArgv,
  buildProviderHookGroupLaunchArgv({
    provider: futureProvider,
    nativeEvent: 'before-write',
    groupIndex: 3,
  }),
)
assert.deepEqual(
  canonicalGroupArgv.slice(-8),
  ['node', 'scripts/run-provider-hook.mjs', '--provider', 'future-provider', '--event', 'PreToolUse', '--group', '3'],
)
assert.throws(
  () => buildProviderHookGroupLaunchArgv({
    provider: futureProvider,
    event: 'PreToolUse',
    nativeEvent: 'before-write',
    groupIndex: 0,
  }),
  /exactly one canonical or native event/,
)
assert.throws(
  () => buildProviderHookGroupLaunchArgv({
    provider: futureProvider,
    nativeEvent: 'unknown-event',
    groupIndex: 0,
  }),
  /no unique canonical binding/,
)
assert.throws(
  () => buildProviderHookGroupLaunchArgv({
    provider: futureProvider,
    event: 'PreToolUse',
    groupIndex: -1,
  }),
  /non-negative safe integer/,
)
const launchFixtureRoot = mkdtempSync(resolve(tmpdir(), 'provider-hook-clean-launch-'))
try {
  const bashEnvironment = resolve(launchFixtureRoot, 'bash-environment.sh')
  const nodePreload = resolve(launchFixtureRoot, 'node-preload.cjs')
  const fakeNode = resolve(launchFixtureRoot, 'node')
  const pythonStartup = resolve(launchFixtureRoot, 'python-startup.py')
  writeFileSync(bashEnvironment, 'exit 91\n')
  writeFileSync(nodePreload, 'process.exit(92)\n')
  writeFileSync(fakeNode, '#!/bin/bash\nexit 93\n')
  writeFileSync(pythonStartup, 'raise SystemExit(94)\n')
  chmodSync(fakeNode, 0o755)
  const poisonedEnvironment = {
    ...process.env,
    PATH: launchFixtureRoot,
    GIT_DIR: '/attacker/git-dir',
    BASH_ENV: bashEnvironment,
    NODE_OPTIONS: `--require=${nodePreload}`,
    NODE_PATH: launchFixtureRoot,
    PYTHONPATH: launchFixtureRoot,
    PYTHONSTARTUP: pythonStartup,
    PYTHONINSPECT: '1',
  }
  const structuredBoundary = (launchArgv) => {
    assert.equal(launchArgv[0], '/usr/bin/env')
    return spawnSync(process.execPath, [
      '--',
      'packages/governance/test/fixtures/provider-hook-structured-launch-wrapper.mjs',
    ], {
      cwd: ROOT,
      env: process.env,
      input: JSON.stringify({
        command: '/usr/bin/env',
        args: launchArgv.slice(1),
        cwd: ROOT,
        env: poisonedEnvironment,
        input: '',
      }),
      encoding: 'utf8',
    })
  }
  const cleanBoundaryArgv = buildProviderHookLaunchArgv(['/bin/bash', '--', CLEAN_HOOK_FIXTURE])
  const cleanBoundary = structuredBoundary(cleanBoundaryArgv)
  assert.equal(cleanBoundary.status, 0, cleanBoundary.stderr)
  assert.equal(cleanBoundary.stdout, 'clean')
  const policyBoundaryArgv = buildProviderHookLaunchArgv(['/bin/bash', '--', BLOCKED_HOOK_FIXTURE])
  const policyBoundary = structuredBoundary(policyBoundaryArgv)
  assert.equal(policyBoundary.status, 2)
  assert.equal(policyBoundary.stderr, 'declared policy\n')
} finally {
  rmSync(launchFixtureRoot, { recursive: true, force: true })
}
assert.deepEqual(
  sanitizeProviderHookEnvironment({
    environment: {
      KEEP_ME: 'yes',
      GOVERNANCE_PROJECT_DIR: ROOT,
      PATH: '/attacker/bin',
      GIT_WORK_TREE: '/attacker/worktree',
      GOVERNANCE_TOOL_INPUT: 'neutral',
      CLAUDE_TOOL_INPUT: 'native',
      BASH_ENV: '/attacker/bash-env',
      NODE_OPTIONS: '--require=/attacker/preload.cjs',
      PYTHONSTARTUP: '/attacker/startup.py',
    },
    registry: {
      providers: [{ id: 'claude', adapter: { environmentMap: { GOVERNANCE_TOOL_INPUT: 'CLAUDE_TOOL_INPUT' } } }],
    },
  }),
  { GOVERNANCE_PROJECT_DIR: ROOT },
)
assert.throws(
  () => buildProviderHookStdinInvocation({
    environment: {},
    payload: {},
    registry: {
      providers: [{ id: 'bad', adapter: { environmentMap: { GOVERNANCE_TOOL_INPUT: 42 } } }],
    },
  }),
  /tool input environment alias is invalid/,
)
assert.throws(
  () => sanitizeProviderHookEnvironment({
    environment: {},
    registry: {
      providers: [{ id: 'bad', adapter: { environmentMap: { GOVERNANCE_TOOL_INPUT: 'UNSAFE_PAYLOAD' } } }],
    },
  }),
  /tool input environment alias is invalid/,
)

for (const event of ['PreToolUse', 'PostToolUse', 'SessionStart', 'UserPromptSubmit']) {
  assert.deepEqual(formatProviderHookContext({
    transport: 'claude-hook-specific',
    event,
    message: `visible ${event}`,
  }), {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: `visible ${event}`,
    },
  })
  assert.deepEqual(formatProviderHookContext({
    transport: 'system-message',
    event,
    message: `visible ${event}`,
  }), { systemMessage: `visible ${event}` })
}

assert.deepEqual(formatProviderHookContext({
  transport: 'claude-hook-specific',
  event: 'Stop',
  message: 'stop diagnostic',
}), { systemMessage: 'stop diagnostic' })
assert.deepEqual(formatProviderStopDecision({
  transport: 'claude-decision-json',
  reason: 'must continue correcting',
}), { decision: 'block', reason: 'must continue correcting' })
assert.deepEqual(formatProviderStopDecision({
  transport: 'continue-json',
  reason: 'must continue correcting',
}), { continue: false, stopReason: 'must continue correcting' })

for (const output of [
  formatProviderHookContext({ transport: 'system-message', event: 'PreToolUse', message: 'context' }),
  formatProviderHookContext({ transport: 'claude-hook-specific', event: 'Stop', message: 'context' }),
  formatProviderStopDecision({ transport: 'claude-decision-json', reason: 'reason' }),
]) {
  assert.equal(Object.hasOwn(output, 'suppressOutput'), false)
  assert.equal(Object.hasOwn(output, 'continue'), false)
  assert.equal(Object.hasOwn(output, 'stopReason'), false)
}
assert.deepEqual(Object.keys(formatProviderStopDecision({ transport: 'claude-decision-json', reason: 'reason' })).sort(), ['decision', 'reason'])
assert.deepEqual(Object.keys(formatProviderStopDecision({ transport: 'continue-json', reason: 'reason' })).sort(), ['continue', 'stopReason'])

const contextStdout = (event = 'PostToolUse', message = 'portable warning') => `${JSON.stringify({
  governanceContext: { hookEventName: event, message },
})}\n`
const decisionStdout = (reason = 'must continue correcting') => `${JSON.stringify({
  governanceDecision: 'block',
  reason,
})}\n`

for (const outputMode of [
  'blocking',
  'governance-context',
  'governance-context-or-block',
  'governance-decision',
]) {
  assert.deepEqual(interpretProviderHookChildResult({
    status: 0,
    outputMode,
    event: outputMode === 'governance-decision' ? 'Stop' : 'PostToolUse',
  }), { kind: 'clean' })
}

assert.deepEqual(interpretProviderHookChildResult({
  status: 2,
  outputMode: 'blocking',
  event: 'PreToolUse',
  stderr: '  policy violation\n',
}), {
  kind: 'policy-block',
  reason: 'policy violation',
})
assert.deepEqual(interpretProviderHookChildResult({
  status: 0,
  outputMode: 'governance-context',
  event: 'PostToolUse',
  stdout: contextStdout(),
}), {
  kind: 'governance-context',
  event: 'PostToolUse',
  message: 'portable warning',
})
assert.deepEqual(interpretProviderHookChildResult({
  status: 0,
  outputMode: 'governance-context-or-block',
  event: 'PostToolUse',
  stdout: contextStdout(),
}), {
  kind: 'governance-context',
  event: 'PostToolUse',
  message: 'portable warning',
})
assert.deepEqual(interpretProviderHookChildResult({
  status: 2,
  outputMode: 'governance-context-or-block',
  event: 'PostToolUse',
  stderr: 'policy violation',
}), {
  kind: 'policy-block',
  reason: 'policy violation',
})
assert.deepEqual(interpretProviderHookChildResult({
  status: 0,
  outputMode: 'governance-decision',
  event: 'Stop',
  stdout: decisionStdout(),
}), {
  kind: 'governance-decision',
  decision: 'block',
  reason: 'must continue correcting',
})

function expectChildResultIntegrityFailure(input, pattern) {
  assert.throws(
    () => interpretProviderHookChildResult(input),
    (error) => {
      assert.ok(error instanceof ProviderHookChildResultIntegrityError)
      assert.equal(error.name, 'ProviderHookChildResultIntegrityError')
      assert.equal(error.code, 'PROVIDER_HOOK_CHILD_RESULT_INTEGRITY_FAILURE')
      assert.match(error.message, /^provider hook child-result integrity failure:/)
      if (pattern) assert.match(error.message, pattern)
      return true
    },
  )
}

const invalidChildResults = [
  {
    label: 'rc1 is an integrity failure rather than a policy block',
    input: { status: 1, outputMode: 'blocking', event: 'PreToolUse', stderr: 'crash' },
    pattern: /unsupported child exit code:1/,
  },
  {
    label: 'other nonzero exit codes are integrity failures',
    input: { status: 3, outputMode: 'blocking', event: 'PreToolUse', stderr: 'crash' },
    pattern: /unsupported child exit code:3/,
  },
  {
    label: 'mixed success channels are forbidden',
    input: {
      status: 0,
      outputMode: 'governance-context',
      event: 'PostToolUse',
      stdout: contextStdout(),
      stderr: 'also diagnostic',
    },
    pattern: /mixed stdout and stderr/,
  },
  {
    label: 'raw success stdout is forbidden',
    input: { status: 0, outputMode: 'governance-context', event: 'PostToolUse', stdout: 'raw warning\n' },
    pattern: /not one valid neutral JSON envelope/,
  },
  {
    label: 'malformed JSON stdout is forbidden',
    input: { status: 0, outputMode: 'governance-context', event: 'PostToolUse', stdout: '{"governanceContext":' },
    pattern: /not one valid neutral JSON envelope/,
  },
  {
    label: 'extra top-level context keys are forbidden',
    input: {
      status: 0,
      outputMode: 'governance-context',
      event: 'PostToolUse',
      stdout: JSON.stringify({
        governanceContext: { hookEventName: 'PostToolUse', message: 'warning' },
        extra: true,
      }),
    },
    pattern: /contain only governanceContext/,
  },
  {
    label: 'extra nested context keys are forbidden',
    input: {
      status: 0,
      outputMode: 'governance-context',
      event: 'PostToolUse',
      stdout: JSON.stringify({
        governanceContext: { hookEventName: 'PostToolUse', message: 'warning', extra: true },
      }),
    },
    pattern: /exactly hookEventName and message/,
  },
  {
    label: 'dual context and decision envelopes are forbidden',
    input: {
      status: 0,
      outputMode: 'governance-context-or-block',
      event: 'PostToolUse',
      stdout: JSON.stringify({
        governanceContext: { hookEventName: 'PostToolUse', message: 'warning' },
        governanceDecision: 'block',
        reason: 'block',
      }),
    },
    pattern: /dual context and decision/,
  },
  {
    label: 'wrong context event is forbidden',
    input: {
      status: 0,
      outputMode: 'governance-context',
      event: 'PostToolUse',
      stdout: contextStdout('PreToolUse'),
    },
    pattern: /event mismatch:PreToolUse:PostToolUse/,
  },
  {
    label: 'silent rc2 is not a policy block',
    input: { status: 2, outputMode: 'blocking', event: 'PreToolUse' },
    pattern: /requires a non-empty stderr policy reason/,
  },
  {
    label: 'reserved integrity marker can never masquerade as a policy block',
    input: {
      status: 2,
      outputMode: 'blocking',
      event: 'PreToolUse',
      stderr: 'GOVERNANCE_INTEGRITY: broken child contract',
    },
    pattern: /reserved child-integrity marker/,
  },
  {
    label: 'stdout rc2 is not a policy block',
    input: {
      status: 2,
      outputMode: 'blocking',
      event: 'PreToolUse',
      stdout: 'wrong channel',
    },
    pattern: /must not write stdout/,
  },
  {
    label: 'mixed rc2 channels are forbidden',
    input: {
      status: 2,
      outputMode: 'blocking',
      event: 'PreToolUse',
      stdout: 'wrong channel',
      stderr: 'policy violation',
    },
    pattern: /mixed stdout and stderr/,
  },
  {
    label: 'success stderr is not silent success',
    input: {
      status: 0,
      outputMode: 'blocking',
      event: 'PreToolUse',
      stderr: 'diagnostic-only output',
    },
    pattern: /must not write stderr/,
  },
  {
    label: 'context mode cannot claim an rc2 policy block',
    input: {
      status: 2,
      outputMode: 'governance-context',
      event: 'PostToolUse',
      stderr: 'wrong contract',
    },
    pattern: /blocking exit contradicts outputMode:governance-context/,
  },
  {
    label: 'decision mode cannot claim an rc2 policy block',
    input: {
      status: 2,
      outputMode: 'governance-decision',
      event: 'Stop',
      stderr: 'wrong contract',
    },
    pattern: /blocking exit contradicts outputMode:governance-decision/,
  },
  {
    label: 'decision output is Stop-only',
    input: {
      status: 0,
      outputMode: 'governance-decision',
      event: 'PostToolUse',
      stdout: decisionStdout(),
    },
    pattern: /only valid for Stop:PostToolUse/,
  },
  {
    label: 'extra decision keys are forbidden',
    input: {
      status: 0,
      outputMode: 'governance-decision',
      event: 'Stop',
      stdout: JSON.stringify({ governanceDecision: 'block', reason: 'reason', extra: true }),
    },
    pattern: /exactly governanceDecision and reason/,
  },
  {
    label: 'wrong decision value is forbidden',
    input: {
      status: 0,
      outputMode: 'governance-decision',
      event: 'Stop',
      stdout: JSON.stringify({ governanceDecision: 'allow', reason: 'reason' }),
    },
    pattern: /must equal block/,
  },
  {
    label: 'empty decision reason is forbidden',
    input: {
      status: 0,
      outputMode: 'governance-decision',
      event: 'Stop',
      stdout: JSON.stringify({ governanceDecision: 'block', reason: '  ' }),
    },
    pattern: /reason must be a non-empty string/,
  },
  {
    label: 'context-or-block does not accept a decision envelope',
    input: {
      status: 0,
      outputMode: 'governance-context-or-block',
      event: 'Stop',
      stdout: decisionStdout(),
    },
    pattern: /contain only governanceContext/,
  },
  {
    label: 'decision mode does not accept a context envelope',
    input: {
      status: 0,
      outputMode: 'governance-decision',
      event: 'Stop',
      stdout: contextStdout('Stop'),
    },
    pattern: /exactly governanceDecision and reason/,
  },
  {
    label: 'blocking status0 stdout is forbidden even when it is neutral JSON',
    input: {
      status: 0,
      outputMode: 'blocking',
      event: 'PreToolUse',
      stdout: contextStdout('PreToolUse'),
    },
    pattern: /blocking success must be silent/,
  },
  {
    label: 'unknown modes are integrity failures',
    input: { status: 0, outputMode: 'diagnostic', event: 'PreToolUse' },
    pattern: /unsupported enforcement outputMode:diagnostic/,
  },
  {
    label: 'unknown events are integrity failures',
    input: { status: 0, outputMode: 'blocking', event: 'Unknown' },
    pattern: /unsupported hook event:Unknown/,
  },
  {
    label: 'non-string output channels are integrity failures',
    input: { status: 0, outputMode: 'blocking', event: 'PreToolUse', stdout: Buffer.from('') },
    pattern: /stdout and stderr must be strings/,
  },
]
for (const test of invalidChildResults) {
  try {
    expectChildResultIntegrityFailure(test.input, test.pattern)
  } catch (error) {
    error.message = `${test.label}: ${error.message}`
    throw error
  }
}

for (const provider of [
  { id: 'claude', blockingExitCode: 2 },
  { id: 'codex', blockingExitCode: 2 },
]) {
  assert.deepEqual(normalizeProviderHookChildFailure({
    status: 2,
    outputMode: 'blocking',
    blockingExitCode: provider.blockingExitCode,
    stderr: 'policy violation',
  }), { exitCode: 2, enforcement: true, stderr: 'policy violation' })
  const diagnostic = normalizeProviderHookChildFailure({
    status: 1,
    outputMode: 'diagnostic',
    blockingExitCode: provider.blockingExitCode,
    stderr: 'diagnostic crashed',
  })
  assert.equal(diagnostic.exitCode, 2)
  assert.equal(diagnostic.enforcement, false)
  assert.match(diagnostic.stderr, /^GOVERNANCE_HOOK_NON_ENFORCEMENT_ERROR:diagnostic:child-exit-1:/)
}
assert.equal(normalizeProviderHookChildFailure({ status: 0, outputMode: 'blocking', blockingExitCode: 2 }), null)
expectChildResultIntegrityFailure({
  status: 1,
  outputMode: 'blocking',
  event: 'PreToolUse',
  stderr: 'crash',
}, /unsupported child exit code:1/)
assert.throws(
  () => normalizeProviderHookChildFailure({
    status: 1,
    outputMode: 'blocking',
    blockingExitCode: 2,
    stderr: 'crash',
  }),
  ProviderHookChildResultIntegrityError,
)
assert.deepEqual(
  [...providerHookOutputContract.enforcementOutputModes].sort(),
  ['blocking', 'governance-context', 'governance-context-or-block', 'governance-decision'],
)
assert.deepEqual(providerHookOutputContract.childResultKinds, [
  'clean',
  'policy-block',
  'governance-context',
  'governance-decision',
])
assert.equal(
  providerHookOutputContract.childResultIntegrityErrorCode,
  'PROVIDER_HOOK_CHILD_RESULT_INTEGRITY_FAILURE',
)

assert.throws(() => formatProviderHookContext({ transport: 'system-message', event: 'Unknown', message: 'x' }), /event is unsupported/)
assert.throws(() => formatProviderStopDecision({ transport: 'unknown', reason: 'x' }), /transport is unsupported/)
assert.throws(() => formatProviderStopDecision({ transport: 'invalid-stale-transport', reason: 'x' }), /transport is unsupported/)
console.log('✓ provider hook output transport strictly separates policy blocks from child-result integrity failures')

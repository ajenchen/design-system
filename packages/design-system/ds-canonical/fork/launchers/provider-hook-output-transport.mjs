const CONTEXT_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'SessionStart', 'UserPromptSubmit'])

function fail(message) {
  throw new Error(`provider hook output transport blocked:${message}`)
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`)
  return value
}

export function formatProviderHookContext({ transport, event, message } = {}) {
  text(message, 'context message')
  if (event === 'Stop') return { systemMessage: message }
  if (!CONTEXT_EVENTS.has(event)) fail(`context event is unsupported:${event || '<missing>'}`)
  if (transport === 'claude-hook-specific') {
    return { hookSpecificOutput: { hookEventName: event, additionalContext: message } }
  }
  if (transport === 'system-message') return { systemMessage: message }
  if (transport === 'stderr') return null
  fail(`context transport is unsupported:${transport || '<missing>'}`)
}

export function formatProviderStopDecision({ transport, reason } = {}) {
  text(reason, 'stop reason')
  if (transport === 'claude-decision-json') {
    return { decision: 'block', reason }
  }
  if (transport === 'continue-json') {
    return { continue: false, stopReason: reason }
  }
  if (transport === 'blocking-exit') return null
  fail(`stop transport is unsupported:${transport || '<missing>'}`)
}

const ENFORCEMENT_OUTPUT_MODES = new Set([
  'blocking',
  'governance-context',
  'governance-decision',
  'governance-context-or-block',
])
const CHILD_RESULT_OUTPUT_MODES = new Set(ENFORCEMENT_OUTPUT_MODES)
const POLICY_BLOCK_OUTPUT_MODES = new Set(['blocking', 'governance-context-or-block'])
const PROVIDER_HOOK_EVENTS = new Set([...CONTEXT_EVENTS, 'Stop'])
const CANONICAL_TOOL_INPUT_ENVIRONMENT = 'GOVERNANCE_TOOL_INPUT'
const PAYLOAD_ENVIRONMENT_NAME_PATTERN = /^[A-Z][A-Z0-9_]*_TOOL_INPUT$/
const HOSTILE_CHILD_RUNTIME_ENVIRONMENT_PATTERN =
  /^(?:PATH|GIT_.+|BASH_ENV|ENV|SHELLOPTS|BASHOPTS|CDPATH|GLOBIGNORE|NODE_OPTIONS|NODE_PATH|PYTHONHOME|PYTHONPATH|PYTHONSTARTUP|PYTHONINSPECT|PERL5OPT|RUBYOPT|LD_.+|DYLD_.+|BASH_FUNC_.+%%)$/
const CHILD_INTEGRITY_MARKER = 'GOVERNANCE_INTEGRITY:'
// This is the provider-to-Node bootstrap boundary only. System-owned locations
// win every collision; the runner replaces this path with its authenticated
// private tool profile before launching any canonical hook.
const PROVIDER_HOOK_EXECUTABLE_PATH =
  '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin:/home/linuxbrew/.linuxbrew/bin'
const ALLOWED_PROVIDER_HOOK_ENVIRONMENT_NAMES = Object.freeze([
  'GOVERNANCE_BRANCH_NAMESPACES_JSON',
  'GOVERNANCE_BYPASS_CHROME_HEADER_AVATAR',
  'GOVERNANCE_BYPASS_DS_ANCHOR',
  'GOVERNANCE_BYPASS_ESCAPE_MARKER_AUDIT',
  'GOVERNANCE_BYPASS_MAIN_WORKBENCH',
  'GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP',
  'GOVERNANCE_BYPASS_SOLO_WORKFLOW',
  'GOVERNANCE_CANONICAL_HOOK_ROOT',
  'GOVERNANCE_CORPUS_ROOT',
  'GOVERNANCE_DEPLOY_TARGETS_FILE',
  'GOVERNANCE_EVIDENCE_ROOT',
  'GOVERNANCE_FIRE_CANONICAL_ROOT_UNAVAILABLE',
  'GOVERNANCE_FIRE_INSTRUCTION_ENTRY_UNAVAILABLE',
  'GOVERNANCE_FIRE_MANAGED_ROOTS_UNAVAILABLE',
  'GOVERNANCE_FIRE_PROVIDER_RESOLVER_UNAVAILABLE',
  'GOVERNANCE_FIRE_SHARED_INSTRUCTION_ENTRY_UNAVAILABLE',
  'GOVERNANCE_HOOK_CORPUS_SHA256',
  'GOVERNANCE_INSTRUCTION_ENTRY',
  'GOVERNANCE_MEMORY_SYNC_SCRIPT',
  'GOVERNANCE_PEER_BRIEF_MARKERS_JSON',
  'GOVERNANCE_PEER_CLI',
  'GOVERNANCE_PEER_DISCOVERY_MARKERS_JSON',
  'GOVERNANCE_PEER_DISPLAY_NAME',
  'GOVERNANCE_PEER_LOCAL_EXECUTABLE',
  'GOVERNANCE_PEER_PROVIDER',
  'GOVERNANCE_PEER_REPLY_ARTIFACT_PREFIX',
  'GOVERNANCE_PLUGIN_ROOT',
  'GOVERNANCE_PROJECT_DIR',
  'GOVERNANCE_PROVIDER',
  'GOVERNANCE_PROVIDER_ADAPTER_JSON',
  'GOVERNANCE_PROVIDER_REGISTRY',
  'GOVERNANCE_READ_ONLY',
  'GOVERNANCE_REGISTERED_HOOK_COUNT',
  'GOVERNANCE_RELEASE_REPOSITORY',
  'GOVERNANCE_RUNTIME_ROOT',
  'GOVERNANCE_SELF_DISPLAY_NAME',
  'GOVERNANCE_SELF_PROVIDER',
  'GOVERNANCE_SESSION_ID',
  'GOVERNANCE_SHARED_INSTRUCTION_ENTRY',
  'GOVERNANCE_SKILL_DIRECTORY',
  'GOVERNANCE_STATE_DIR',
  'GOVERNANCE_STATIC_REPLAY',
  'GOVERNANCE_TELEMETRY_OPT_IN',
  'GOVERNANCE_TEST_BATCH_CLEAN_DESCENDANT_LOG',
  'GOVERNANCE_TEST_BATCH_EXPECTED_LENGTH',
  'GOVERNANCE_TEST_BATCH_LIVE_ROOT',
  'GOVERNANCE_TEST_BATCH_MODE',
  'GOVERNANCE_TEST_BATCH_ORDER_LOG',
  'GOVERNANCE_TEST_BATCH_SIGNAL_LOG',
  'GOVERNANCE_TEST_STATE',
  'GOVERNANCE_TOOL_PROFILE_SHA256',
  'GOVERNANCE_TRANSCRIPT_CONTRACT',
  'GOVERNANCE_TRANSCRIPT_PATH',
  'GOVERNANCE_TRANSCRIPT_TRUST',
  'GOVERNANCE_WRITE_STATE_TRUST',
  'HOME',
  'LANG',
  'LC_ALL',
  'NODE_ENV',
  'NO_COLOR',
  'TMPDIR',
  'TZ',
  'XDG_CONFIG_HOME',
])
const SAFE_PROVIDER_HOOK_ARGV_TOKEN = /^[A-Za-z0-9_./@-]+$/
const PROVIDER_HOOK_PRELAUNCH_UNSET_NAMES = Object.freeze([
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
])

function payloadEnvironmentNames(registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry) || !Array.isArray(registry.providers)) {
    fail('provider registry is required for stdin transport')
  }
  const names = new Set([CANONICAL_TOOL_INPUT_ENVIRONMENT])
  for (const provider of registry.providers) {
    const alias = provider?.adapter?.environmentMap?.[CANONICAL_TOOL_INPUT_ENVIRONMENT]
    if (alias === undefined) continue
    if (typeof alias !== 'string' || !PAYLOAD_ENVIRONMENT_NAME_PATTERN.test(alias)) {
      fail(`tool input environment alias is invalid:${provider?.id || '<unknown>'}`)
    }
    names.add(alias)
  }
  return names
}

function allowedProviderHookEnvironmentNames(registry) {
  const names = new Set(ALLOWED_PROVIDER_HOOK_ENVIRONMENT_NAMES)
  if (!registry || typeof registry !== 'object' || Array.isArray(registry) || !Array.isArray(registry.providers)) {
    fail('provider registry is required for child environment projection')
  }
  for (const provider of registry.providers) {
    const environmentMap = provider?.adapter?.environmentMap
    if (!environmentMap || typeof environmentMap !== 'object' || Array.isArray(environmentMap)) continue
    for (const [canonical, native] of Object.entries(environmentMap)) {
      if (canonical === CANONICAL_TOOL_INPUT_ENVIRONMENT) continue
      if (
        typeof canonical !== 'string'
        || !/^[A-Z][A-Z0-9_]*$/.test(canonical)
        || typeof native !== 'string'
        || !/^[A-Z][A-Z0-9_]*$/.test(native)
      ) {
        fail(`provider environment binding is invalid:${provider?.id || '<unknown>'}`)
      }
      names.add(canonical)
      names.add(native)
    }
  }
  return names
}

/**
 * Full provider hook payloads are unbounded file/transcript data. Passing them
 * through argv or env can exceed the operating system's process-launch limit,
 * so the canonical transport is one JSON record on stdin. Registry-declared
 * native aliases remain useful only as names that must be removed from the
 * child environment before a canonical hook or nested dispatcher is launched.
 */
export function sanitizeProviderHookEnvironment({ environment, registry } = {}) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
    fail('hook invocation environment must be an object')
  }
  const payloadNames = payloadEnvironmentNames(registry)
  const allowedNames = allowedProviderHookEnvironmentNames(registry)
  const childEnvironment = {}
  for (const name of [...allowedNames].sort()) {
    if (!Object.hasOwn(environment, name) || environment[name] === undefined) continue
    if (payloadNames.has(name)
      || PAYLOAD_ENVIRONMENT_NAME_PATTERN.test(name)
      || HOSTILE_CHILD_RUNTIME_ENVIRONMENT_PATTERN.test(name)) {
      continue
    }
    if (typeof environment[name] !== 'string' || environment[name].includes('\0')) {
      fail(`hook invocation environment value is invalid:${name}`)
    }
    childEnvironment[name] = environment[name]
  }
  return childEnvironment
}

export function buildProviderHookStdinInvocation({ environment, payload, registry } = {}) {
  let serialized
  try {
    serialized = JSON.stringify(payload)
  } catch (error) {
    fail(`hook payload is not JSON serializable:${error.message}`)
  }
  if (serialized === undefined) fail('hook payload is not JSON serializable')
  return {
    environment: sanitizeProviderHookEnvironment({ environment, registry }),
    input: `${serialized}\n`,
  }
}

/**
 * Native providers may start a hook directly from structured argv or may first
 * pass the command through their own trusted command processor. Prefix every
 * generated launcher with an absolute `env -u` boundary so the launcher shell
 * and its Node/Python/native children cannot consume inherited startup
 * injection when the provider honors argv directly. The provider process, any
 * shell it starts before this argv, and the operating-system loader that must
 * start `/usr/bin/env` itself remain part of the host trust boundary; protected
 * hooks-off CI is authoritative when that boundary is unavailable.
 */
export function buildProviderHookLaunchArgv(argv) {
  if (!Array.isArray(argv) || argv.length === 0) fail('hook launch argv must be a non-empty array')
  for (const token of argv) {
    if (typeof token !== 'string' || !token || token.includes('\0')) {
      fail('hook launch argv tokens must be non-empty NUL-free strings')
    }
  }
  return Object.freeze([
    '/usr/bin/env',
    ...PROVIDER_HOOK_PRELAUNCH_UNSET_NAMES.flatMap((name) => ['-u', name]),
    `PATH=${PROVIDER_HOOK_EXECUTABLE_PATH}`,
    ...argv,
  ])
}

/**
 * Materialize the one canonical repository hook-runner invocation for an
 * event/matcher group. Generators pass the canonical event while validators
 * pass the provider-native event recovered from the materialized config; both
 * routes resolve through the same registry binding and prelaunch boundary.
 */
export function buildProviderHookGroupLaunchArgv({
  provider,
  event,
  nativeEvent,
  groupIndex,
} = {}) {
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
    fail('event-group provider must be an object')
  }
  if (provider?.adapter?.hookView?.workingDirectoryPolicy !== 'repository-root') {
    fail(`${provider?.id || '<missing>'}:hook invocation working directory is not repository-root`)
  }
  if ((event === undefined) === (nativeEvent === undefined)) {
    fail('event-group invocation requires exactly one canonical or native event')
  }
  const bindings = provider?.adapter?.hookView?.eventBindings
  const supportedEvents = provider?.adapter?.hookView?.supportedEvents
  if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings) || !Array.isArray(supportedEvents)) {
    fail(`${provider?.id || '<missing>'}:hook event bindings are unavailable`)
  }
  let canonicalEvent = event
  if (nativeEvent !== undefined) {
    if (typeof nativeEvent !== 'string' || !nativeEvent) fail('native event must be a non-empty string')
    const matches = Object.entries(bindings)
      .filter(([, candidate]) => candidate === nativeEvent)
      .map(([candidate]) => candidate)
    if (matches.length !== 1) {
      fail(`${provider?.id || '<missing>'}:native hook event has no unique canonical binding:${nativeEvent}`)
    }
    canonicalEvent = matches[0]
  }
  if (
    typeof canonicalEvent !== 'string'
    || !PROVIDER_HOOK_EVENTS.has(canonicalEvent)
    || !supportedEvents.includes(canonicalEvent)
    || typeof bindings[canonicalEvent] !== 'string'
    || !bindings[canonicalEvent]
  ) {
    fail(`${provider?.id || '<missing>'}:canonical hook event is unsupported:${canonicalEvent || '<missing>'}`)
  }
  if (!Number.isSafeInteger(groupIndex) || groupIndex < 0) {
    fail('hook group index must be a non-negative safe integer')
  }
  const runnerArgv = [
    'node',
    provider.hookEntrypoint,
    '--provider',
    provider.id,
    '--event',
    canonicalEvent,
    '--group',
    String(groupIndex),
  ]
  if (!runnerArgv.every((token) => typeof token === 'string' && SAFE_PROVIDER_HOOK_ARGV_TOKEN.test(token))) {
    fail(`${provider?.id || '<missing>'}:hook invocation contains an unsafe argv token`)
  }
  return buildProviderHookLaunchArgv(runnerArgv)
}

export class ProviderHookChildResultIntegrityError extends Error {
  constructor(message) {
    super(`provider hook child-result integrity failure:${message}`)
    this.name = 'ProviderHookChildResultIntegrityError'
    this.code = 'PROVIDER_HOOK_CHILD_RESULT_INTEGRITY_FAILURE'
  }
}

function childResultIntegrityFailure(message) {
  throw new ProviderHookChildResultIntegrityError(message)
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function parseNeutralChildEnvelope(stdout) {
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch {
    childResultIntegrityFailure('success stdout is not one valid neutral JSON envelope')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    childResultIntegrityFailure('success stdout neutral envelope must be an object')
  }
  if (Object.hasOwn(parsed, 'governanceContext') && Object.hasOwn(parsed, 'governanceDecision')) {
    childResultIntegrityFailure('success stdout contains dual context and decision envelopes')
  }
  return parsed
}

function interpretNeutralContext({ parsed, event }) {
  if (!exactKeys(parsed, ['governanceContext'])) {
    childResultIntegrityFailure('context stdout must contain only governanceContext')
  }
  const context = parsed.governanceContext
  if (!exactKeys(context, ['hookEventName', 'message'])) {
    childResultIntegrityFailure('governanceContext must contain exactly hookEventName and message')
  }
  if (context.hookEventName !== event) {
    childResultIntegrityFailure(`governanceContext event mismatch:${context.hookEventName || '<missing>'}:${event}`)
  }
  if (typeof context.message !== 'string' || !context.message.trim()) {
    childResultIntegrityFailure('governanceContext message must be a non-empty string')
  }
  return Object.freeze({
    kind: 'governance-context',
    event,
    message: context.message,
  })
}

function interpretNeutralDecision({ parsed, event }) {
  if (event !== 'Stop') {
    childResultIntegrityFailure(`governanceDecision is only valid for Stop:${event}`)
  }
  if (!exactKeys(parsed, ['governanceDecision', 'reason'])) {
    childResultIntegrityFailure('decision stdout must contain exactly governanceDecision and reason')
  }
  if (parsed.governanceDecision !== 'block') {
    childResultIntegrityFailure('governanceDecision must equal block')
  }
  if (typeof parsed.reason !== 'string' || !parsed.reason.trim()) {
    childResultIntegrityFailure('governanceDecision reason must be a non-empty string')
  }
  return Object.freeze({
    kind: 'governance-decision',
    decision: 'block',
    reason: parsed.reason,
  })
}

/**
 * Interpret one canonical hook subprocess result without provider-specific I/O
 * or process side effects. Policy denial is a normal result. Every unsupported
 * exit/channel/envelope combination is instead an integrity failure, so a
 * crashed or malformed hook can never be reported as successful enforcement.
 */
export function interpretProviderHookChildResult({
  status,
  outputMode,
  event,
  stdout = '',
  stderr = '',
} = {}) {
  if (!Number.isInteger(status) || ![0, 2].includes(status)) {
    childResultIntegrityFailure(`unsupported child exit code:${status ?? '<missing>'}`)
  }
  if (!CHILD_RESULT_OUTPUT_MODES.has(outputMode)) {
    childResultIntegrityFailure(`unsupported enforcement outputMode:${outputMode || '<missing>'}`)
  }
  if (!PROVIDER_HOOK_EVENTS.has(event)) {
    childResultIntegrityFailure(`unsupported hook event:${event || '<missing>'}`)
  }
  if (typeof stdout !== 'string' || typeof stderr !== 'string') {
    childResultIntegrityFailure('child stdout and stderr must be strings')
  }

  const hasStdout = stdout.length > 0
  const hasStderr = stderr.length > 0
  if (hasStdout && hasStderr) {
    childResultIntegrityFailure('child output mixed stdout and stderr channels')
  }

  if (status === 2) {
    if (stderr.includes(CHILD_INTEGRITY_MARKER)) {
      childResultIntegrityFailure('blocking exit contains the reserved child-integrity marker')
    }
    if (!POLICY_BLOCK_OUTPUT_MODES.has(outputMode)) {
      childResultIntegrityFailure(`blocking exit contradicts outputMode:${outputMode}`)
    }
    if (hasStdout) {
      childResultIntegrityFailure('blocking exit must not write stdout')
    }
    if (!hasStderr || !stderr.trim()) {
      childResultIntegrityFailure('blocking exit requires a non-empty stderr policy reason')
    }
    return Object.freeze({
      kind: 'policy-block',
      reason: stderr.trim(),
    })
  }

  if (!hasStdout && !hasStderr) return Object.freeze({ kind: 'clean' })
  if (hasStderr) {
    childResultIntegrityFailure('successful enforcement hook must not write stderr')
  }
  if (outputMode === 'blocking') {
    childResultIntegrityFailure('blocking success must be silent')
  }

  const parsed = parseNeutralChildEnvelope(stdout)
  if (outputMode === 'governance-context' || outputMode === 'governance-context-or-block') {
    return interpretNeutralContext({ parsed, event })
  }
  return interpretNeutralDecision({ parsed, event })
}

/**
 * Compatibility adapter for callers that still need the provider-native exit
 * shape. Enforcement modes first pass through the single strict interpreter;
 * diagnostic-only failures retain their explicit non-enforcement label.
 */
export function normalizeProviderHookChildFailure({ status, outputMode, blockingExitCode, stdout = '', stderr = '' } = {}) {
  if (status === 0) return null
  if (!Number.isInteger(blockingExitCode) || blockingExitCode < 1 || blockingExitCode > 255) {
    fail('child/provider exit code is invalid')
  }
  if (CHILD_RESULT_OUTPUT_MODES.has(outputMode)) {
    const interpreted = interpretProviderHookChildResult({
      status,
      outputMode,
      event: 'PreToolUse',
      stdout,
      stderr,
    })
    if (interpreted.kind !== 'policy-block') {
      childResultIntegrityFailure(`failure normalizer received non-block result:${interpreted.kind}`)
    }
    return {
      exitCode: blockingExitCode,
      enforcement: true,
      stderr: interpreted.reason,
    }
  }
  if (!Number.isInteger(status) || status < 1 || status > 255) {
    fail('child/provider exit code is invalid')
  }
  const detail = String(stderr || stdout || `child exited ${status}`).trim().slice(0, 4000)
  return {
    exitCode: blockingExitCode,
    enforcement: false,
    stderr: `GOVERNANCE_HOOK_NON_ENFORCEMENT_ERROR:${outputMode || 'diagnostic'}:child-exit-${status}:${detail || 'no diagnostic'}`,
  }
}

export const providerHookOutputContract = Object.freeze({
  contextEvents: Object.freeze([...CONTEXT_EVENTS]),
  stopEvent: 'Stop',
  enforcementOutputModes: Object.freeze([...ENFORCEMENT_OUTPUT_MODES]),
  childResultKinds: Object.freeze(['clean', 'policy-block', 'governance-context', 'governance-decision']),
  childResultIntegrityErrorCode: 'PROVIDER_HOOK_CHILD_RESULT_INTEGRITY_FAILURE',
  childIntegrityMarker: CHILD_INTEGRITY_MARKER,
  inputTransport: 'stdin-json-record-v1',
  forbiddenChildEnvironment: CANONICAL_TOOL_INPUT_ENVIRONMENT,
  forbiddenChildEnvironmentPattern: PAYLOAD_ENVIRONMENT_NAME_PATTERN.source,
  forbiddenChildRuntimeEnvironmentPattern: HOSTILE_CHILD_RUNTIME_ENVIRONMENT_PATTERN.source,
  allowedChildEnvironmentNames: ALLOWED_PROVIDER_HOOK_ENVIRONMENT_NAMES,
  prelaunchEnvironmentUnsetNames: PROVIDER_HOOK_PRELAUNCH_UNSET_NAMES,
  executablePath: PROVIDER_HOOK_EXECUTABLE_PATH,
})

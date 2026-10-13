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
  // 2026-09-18:這一條漏在白名單外,所以 Stop hook 的推播閘從 2026-09-06 接上那天起就沒活過 ——
  // run-provider-hook.mjs 依 registry 算出 `pushNotification` 並寫進 environment,消毒器再把它
  // 整個丟掉,hook 裡永遠讀到 <unset> → NOTIFICATION_AVAILABLE=0 → 整個 mechanism 靜音。
  // 症狀是 user 反覆問「為何又沒有推播」,而程式碼與 commit message 看起來都已經修好了。
  // 教訓:改了「產生端」不等於接通,要有一條端到端的對照組(見 tests/test_stop_self_audit_push_gate.sh)。
  'GOVERNANCE_PUSH_NOTIFICATION_AVAILABLE',
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

/**
 * Decides how the adapter batch responds to ONE hook whose child result failed
 * integrity interpretation (crash exit, wrong channel, malformed envelope, or the
 * reserved integrity marker on its own stderr). Strict/CI lanes stay fail-closed
 * (exit 70). The ordinary lane degrades exactly that hook — a GOVERNANCE_WARNING
 * plus a model-visible degradation notice naming it — and keeps enforcing the rest,
 * so a single crashed hook can no longer silence its whole settings group (the
 * cloud-crash amplifier, baton §7 item 8). A degraded hook is never reported as
 * successful enforcement.
 *
 * N34 複核(2026-10-07):the reserved marker used to force 'fail-closed' even in the
 * ordinary lane, where "fail-closed" for the adapter means "skip the batch, exit 0" —
 * so one hook that hit governance_hook_integrity_fail (the shared helper every
 * canonical hook uses) or merely printed the marker silently switched off every other
 * hook in its group. The marker therefore no longer changes the ordinary-lane outcome:
 * that hook alone is degraded and named.
 */
export function classifyProviderHookChildFailure({ strict = false } = {}) {
  return strict ? 'fail-closed' : 'degrade-hook'
}

// ── G4 複核二(2026-10-07):「寫入前把關」的閘因缺工具跑不起來時,到底要擋什麼 ──
// 上一版:閘跑不起來 → 這次工具呼叫一律擋。結果缺 jq 時連 `ls`、`git status`、`brew install jq` 都被擋,
// AI 沒辦法自己把工具裝回來,只能丟回給 user(M36(b) 自鎖)。要保證的性質是「閘要判的寫入,不會在閘看不見時
// 通過」,上一版量的卻是「任何呼叫」(M37)。現在分三條路,判斷全在 node 裡做、不依賴缺的那個工具:
//   1. 唯讀指令(下方白名單,逐段檢查;任何寫檔重導、命令替換、背景執行都不算)→ 放行;
//   2. 只安裝「缺的那幾個宣告工具」的指令(下方固定文法)→ 放行;
//   3. 其餘呼叫:落在那道閘自己的管轄範圍內才擋(BLIND_GATE_SCOPES);判不出範圍的閘一律當成在範圍內(保守)。
// 1、2 放行時,那道閘仍記成「這次沒有跑」並告訴模型(降級通知),不會被當成通過。

const SHELL_LEX_MAX_BYTES = 64 * 1024
const SHELL_REDIRECT_OPERATORS = ['&>>', '&>', '<<<', '<<-', '<<', '>>', '>|', '>&', '<&', '<>', '>', '<']

// 把一行 shell 拆成「指令段」:每段有字詞(已去引號)與重導;遇到命令替換、行程替換、子 shell 括號、
// 背景執行、未閉合引號一律回 ok:false —— 判不出來的東西不得被當成唯讀。
export function lexShellCommand(command) {
  const source = String(command ?? '')
  if (Buffer.byteLength(source, 'utf8') > SHELL_LEX_MAX_BYTES) return { ok: false, reason: 'too-long' }
  const segments = []
  let words = []
  let redirects = []
  let word = null
  let index = 0
  const pushWord = () => {
    if (word !== null) words.push(word)
    word = null
  }
  const endSegment = (separator) => {
    pushWord()
    if (words.length || redirects.length) segments.push({ words, redirects, separator })
    else if (separator && separator !== ';') return false
    words = []
    redirects = []
    return true
  }
  const readQuotedOrBare = () => {
    // 讀一個重導目標字詞(可含引號)
    let value = null
    while (index < source.length) {
      const character = source[index]
      if (character === "'") {
        const close = source.indexOf("'", index + 1)
        if (close < 0) return null
        value = (value ?? '') + source.slice(index + 1, close)
        index = close + 1
        continue
      }
      if (character === '"') {
        let cursor = index + 1
        let buffer = ''
        while (cursor < source.length && source[cursor] !== '"') {
          if (source[cursor] === '`' || (source[cursor] === '$' && source[cursor + 1] === '(')) return null
          if (source[cursor] === '\\' && cursor + 1 < source.length) {
            buffer += source[cursor + 1]
            cursor += 2
            continue
          }
          buffer += source[cursor]
          cursor += 1
        }
        if (cursor >= source.length) return null
        value = (value ?? '') + buffer
        index = cursor + 1
        continue
      }
      if (/[\s;&|<>()`]/u.test(character)) break
      if (character === '$' && source[index + 1] === '(') return null
      value = (value ?? '') + character
      index += 1
    }
    return value
  }
  while (index < source.length) {
    const character = source[index]
    if (character === '#' && word === null) {
      const newline = source.indexOf('\n', index)
      index = newline < 0 ? source.length : newline
      continue
    }
    if (character === "'" || character === '"') {
      const value = readQuotedOrBare()
      if (value === null) return { ok: false, reason: 'quote-or-substitution' }
      word = (word ?? '') + value
      continue
    }
    if (character === '\\') {
      if (source[index + 1] === '\n') {
        index += 2
        continue
      }
      if (index + 1 < source.length) word = (word ?? '') + source[index + 1]
      index += 2
      continue
    }
    if (character === '`' || (character === '$' && source[index + 1] === '(')) {
      return { ok: false, reason: 'command-substitution' }
    }
    if (character === '(' || character === ')') return { ok: false, reason: 'subshell' }
    if (character === ' ' || character === '\t') {
      pushWord()
      index += 1
      continue
    }
    if (character === '\n' || character === ';') {
      if (source[index + 1] === ';' && character === ';') return { ok: false, reason: 'case-terminator' }
      endSegment(';')
      index += 1
      continue
    }
    if (character === '|') {
      const separator = source[index + 1] === '|' ? '||' : '|'
      if (!endSegment(separator)) return { ok: false, reason: 'empty-segment' }
      index += separator.length + (separator === '|' && source[index + 1] === '&' ? 1 : 0)
      continue
    }
    if (character === '&' && source[index + 1] === '&') {
      if (!endSegment('&&')) return { ok: false, reason: 'empty-segment' }
      index += 2
      continue
    }
    if (character === '<' || character === '>' || (character === '&' && source[index + 1] === '>')) {
      if ((character === '<' || character === '>') && source[index + 1] === '(') {
        return { ok: false, reason: 'process-substitution' }
      }
      let fd = null
      if (word !== null && /^\d+$/u.test(word)) {
        fd = word
        word = null
      }
      pushWord()
      const operator = SHELL_REDIRECT_OPERATORS.find((candidate) => source.startsWith(candidate, index))
      index += operator.length
      while (source[index] === ' ' || source[index] === '\t') index += 1
      if (operator === '<<' || operator === '<<-') {
        // heredoc 主體是否會被執行要看接收者;唯讀判斷一律不收 heredoc
        return { ok: false, reason: 'heredoc' }
      }
      const target = readQuotedOrBare()
      if (target === null || target === '') return { ok: false, reason: 'redirect-target' }
      redirects.push({ fd, operator, target })
      continue
    }
    if (character === '&') return { ok: false, reason: 'background' }
    word = (word ?? '') + character
    index += 1
  }
  pushWord()
  if (words.length || redirects.length) segments.push({ words, redirects, separator: null })
  return { ok: true, segments }
}

function redirectIsHarmless({ operator, target }) {
  if (operator === '<' || operator === '<<<') return true
  if ((operator === '>&' || operator === '<&') && /^(?:\d+|-)$/u.test(target)) return true
  return ['>', '>>', '&>', '&>>', '>|'].includes(operator) && /^\/dev\/(?:null|stdout|stderr)$/u.test(target)
}

const anyArguments = () => true
const FIND_ACTIONS = new Set(['-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprint', '-fprint0', '-fprintf', '-fls'])
const GIT_READ_ONLY_SUBCOMMANDS = new Set([
  'status', 'log', 'diff', 'show', 'rev-parse', 'ls-files', 'ls-tree', 'cat-file', 'describe', 'blame',
  'shortlog', 'grep', 'merge-base', 'for-each-ref', 'rev-list', 'count-objects', 'check-ignore', 'version',
  'help', 'show-ref', 'name-rev', 'whatchanged', 'cherry', 'var',
])
const GIT_LISTING_FLAGS = new Set(['--list', '-l', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--show-current'])
const GIT_BRANCH_WRITE_FLAGS = /^(?:-[dDmMcCfu]|--delete|--move|--copy|--force|--set-upstream-to|--unset-upstream|--edit-description|--track|--no-track)/u

function gitReadOnly(args) {
  let index = 0
  while (index < args.length) {
    if (args[index] === '-C') {
      index += 2
      continue
    }
    if (['--no-pager', '-P', '--no-optional-locks'].includes(args[index])) {
      index += 1
      continue
    }
    break
  }
  const subcommand = args[index]
  const rest = args.slice(index + 1)
  if (!subcommand) return true
  // 會寫檔或執行外部程式的選項(diff/log --output、外部 diff、grep 開 pager、上傳 pack、單次設定)
  if (rest.some((argument) => /^(?:--output|--ext-diff|--exec|--upload-pack|--receive-pack|--config-env|-O|--open-files-in-pager|-c$)/u.test(argument))) {
    return false
  }
  if (GIT_READ_ONLY_SUBCOMMANDS.has(subcommand)) return true
  const positional = rest.filter((argument) => !argument.startsWith('-'))
  switch (subcommand) {
    case 'branch':
      return !rest.some((argument) => GIT_BRANCH_WRITE_FLAGS.test(argument))
        && (positional.length === 0 || rest.some((argument) => GIT_LISTING_FLAGS.has(argument)))
    case 'tag':
      return !rest.some((argument) => /^(?:-[dafsmFu]|--delete|--annotate|--sign|--force|--message|--file)/u.test(argument))
        && (positional.length === 0 || rest.some((argument) => GIT_LISTING_FLAGS.has(argument)))
    case 'remote':
      return rest.length === 0 || ['-v', '--verbose', 'show', 'get-url'].includes(rest[0])
    case 'config':
      return rest.some((argument) => ['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l'].includes(argument))
        && !rest.some((argument) => /^(?:--unset|--add|--replace-all|--rename-section|--remove-section|-e$|--edit)/u.test(argument))
    case 'stash':
      return ['list', 'show'].includes(rest[0])
    case 'worktree':
      return rest[0] === 'list'
    case 'reflog':
      return rest.length === 0 || rest[0] === 'show'
    default:
      return false
  }
}

// sed 只收「-n + 只印某幾行」(`sed -n '1,40p' 檔案`):sed 的 w / e 指令會寫檔或執行,不逐一解析,直接不收
function sedPrintOnly(args) {
  if (!args.includes('-n')) return false
  const options = args.filter((argument) => argument.startsWith('-'))
  if (options.some((argument) => argument !== '-n' && argument !== '-e')) return false
  const scripts = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '-e') {
      scripts.push(args[index + 1] ?? '')
      index += 1
    }
  }
  if (!scripts.length) {
    const first = args.find((argument) => !argument.startsWith('-'))
    if (first === undefined) return false
    scripts.push(first)
  }
  return scripts.every((script) => /^\s*(?:\d+|\$)?\s*(?:,\s*(?:\d+|\$))?\s*p\s*$/u.test(script))
}

const READ_ONLY_COMMANDS = new Map([
  ...[
    'pwd', 'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'stat', 'which', 'whoami', 'id',
    'uname', 'echo', 'printf', 'true', 'false', 'test', '[', 'basename', 'dirname', 'realpath', 'readlink',
    'du', 'df', 'ps', 'printenv', 'diff', 'cmp', 'comm', 'shasum', 'sha1sum', 'sha256sum', 'md5', 'md5sum',
    'cksum', 'nl', 'cut', 'tr', 'column', 'sw_vers', 'locale', 'cd', 'pushd', 'popd', 'type', 'jq',
  ].map((name) => [name, anyArguments]),
  ['rg', (args) => !args.some((argument) => argument.startsWith('--pre'))],
  ['file', (args) => !args.some((argument) => argument === '-C' || argument === '--compile')],
  ['date', (args) => args.every((argument) => argument.startsWith('+') || argument === '-u' || argument === '-R')],
  ['env', (args) => args.length === 0],
  ['hostname', (args) => args.length === 0],
  ['command', (args) => ['-v', '-V'].includes(args[0])],
  ['sort', (args) => !args.some((argument) => argument.startsWith('-o') || argument.startsWith('--output'))],
  ['uniq', (args) => args.filter((argument) => !argument.startsWith('-')).length <= 1],
  ['tree', (args) => !args.some((argument) => argument.startsWith('-o'))],
  ['find', (args) => !args.some((argument) => FIND_ACTIONS.has(argument))],
  ['sed', sedPrintOnly],
  ['git', gitReadOnly],
  ['node', (args) => args.length === 1 && ['--version', '-v'].includes(args[0])],
  ['npm', (args) => ['--version', '-v', 'ls', 'list', 'view'].includes(args[0])],
  ['brew', (args) => ['list', 'ls', 'info', '--version', '--prefix', 'search', 'config'].includes(args[0])],
  ['apt-cache', (args) => ['policy', 'show', 'search', 'depends', 'madison'].includes(args[0])],
  ['dpkg', (args) => ['-l', '-s', '-L', '--list', '--status', '--listfiles'].includes(args[0])],
  ['xcode-select', (args) => args.length === 1 && ['-p', '--print-path', '-v', '--version'].includes(args[0])],
])

export function shellCommandIsReadOnly(command) {
  const lexed = lexShellCommand(command)
  if (!lexed.ok || !lexed.segments.length) return false
  return lexed.segments.every(({ words, redirects }) => {
    if (!redirects.every(redirectIsHarmless)) return false
    if (!words.length) return true
    const [name, ...args] = words
    // 只認裸指令名(經 PATH 找):帶路徑的執行檔、前置環境變數指派(`GIT_EXTERNAL_DIFF=… git diff`)都不收
    if (name.includes('/') || name.includes('=')) return false
    const accepts = READ_ONLY_COMMANDS.get(name)
    return Boolean(accepts && accepts(args))
  })
}

// 宣告工具 → 可接受的套件名(brew / apt / dnf / apk / port 的常見名稱)
const HOOK_TOOL_PACKAGES = Object.freeze({
  jq: ['jq'],
  perl: ['perl'],
  python3: ['python3', 'python', 'python@3', /^python@3\.\d+$/u],
  git: ['git'],
  bash: ['bash'],
  node: ['node', 'nodejs'],
})
const INSTALL_COMMAND_FORMS = [
  { manager: 'brew', verbs: ['install', 'reinstall'], flags: ['-q', '--quiet', '--formula'] },
  { manager: 'apt-get', verbs: ['install'], flags: ['-y', '--yes', '--assume-yes', '-q', '--quiet', '--no-install-recommends'] },
  { manager: 'apt', verbs: ['install'], flags: ['-y', '--yes', '--assume-yes', '-q', '--quiet', '--no-install-recommends'] },
  { manager: 'dnf', verbs: ['install'], flags: ['-y', '--assumeyes', '-q', '--quiet'] },
  { manager: 'yum', verbs: ['install'], flags: ['-y', '--assumeyes', '-q', '--quiet'] },
  { manager: 'microdnf', verbs: ['install'], flags: ['-y', '--assumeyes'] },
  { manager: 'apk', verbs: ['add'], flags: ['--no-cache', '-q', '--quiet'] },
  { manager: 'port', verbs: ['install'], flags: [] },
]
const UPDATE_COMMAND_FORMS = [
  { manager: 'apt-get', verbs: ['update'], flags: ['-y', '-q', '--quiet'] },
  { manager: 'apt', verbs: ['update'], flags: ['-y', '-q', '--quiet'] },
  { manager: 'brew', verbs: ['update'], flags: ['-q', '--quiet'] },
]
const INSTALL_ENVIRONMENT_ASSIGNMENT = /^(?:DEBIAN_FRONTEND|HOMEBREW_NO_AUTO_UPDATE|HOMEBREW_NO_INSTALL_CLEANUP|HOMEBREW_NO_ENV_HINTS)=[A-Za-z0-9_-]*$/u

function hookToolForPackage(name) {
  for (const [label, packages] of Object.entries(HOOK_TOOL_PACKAGES)) {
    if (packages.some((candidate) => (typeof candidate === 'string' ? candidate === name : candidate.test(name)))) return label
  }
  return ''
}

function matchPackageCommand(words, forms) {
  const [manager, verb, ...rest] = words
  const form = forms.find((candidate) => candidate.manager === manager && candidate.verbs.includes(verb))
  if (!form) return null
  const flags = rest.filter((argument) => argument.startsWith('-'))
  if (!flags.every((flag) => form.flags.includes(flag))) return null
  return rest.filter((argument) => !argument.startsWith('-'))
}

// 「只安裝缺的那幾個宣告工具」:每段都必須是(可選 sudo 與少數安裝用環境變數)+ 套件管理員安裝 / 更新,
// 安裝的每個套件都對得到一個**目前缺**的宣告工具;不得有管線、寫檔重導或其他指令夾帶。
export function shellCommandRestoresHookTools(command, missingTools = []) {
  const missing = new Set(missingTools)
  if (!missing.size) return false
  const lexed = lexShellCommand(command)
  if (!lexed.ok || !lexed.segments.length) return false
  let installs = 0
  for (const segment of lexed.segments) {
    if (segment.separator === '|') return false
    if (!segment.redirects.every(redirectIsHarmless)) return false
    let words = segment.words
    while (words.length && INSTALL_ENVIRONMENT_ASSIGNMENT.test(words[0])) words = words.slice(1)
    if (words[0] === 'sudo') words = words.slice(1)
    while (words.length && INSTALL_ENVIRONMENT_ASSIGNMENT.test(words[0])) words = words.slice(1)
    const updateOperands = matchPackageCommand(words, UPDATE_COMMAND_FORMS)
    if (updateOperands && updateOperands.length === 0) continue
    const packages = matchPackageCommand(words, INSTALL_COMMAND_FORMS)
    if (!packages || !packages.length) return false
    if (!packages.every((name) => missing.has(hookToolForPackage(name)))) return false
    installs += 1
  }
  return installs > 0
}

// 各道「寫入前把關」閘自己的管轄範圍(閘看不見時,只有範圍內的呼叫要擋)。沒列在這裡的閘 = 判不出範圍,
// 保守視為所有呼叫都在範圍內。key 必須是 hooks/registrations.json 裡 PreToolUse 的擋型 hook
//(scripts/test-provider-hook-output-transport.mjs 機械檢查,改名 / 刪除時會紅)。
const BLIND_GATE_SCOPES = Object.freeze({
  // 核准閘只判「寫到受管產品檔」;受管與否由 hooks/lib/approval-evidence.mjs#isGovernedApprovalTarget 判
  //(與 hook 內的 case 同一套規則,hook 測試 §18n 逐條比對)。算不出目標(null)→ 保守視為在範圍內。
  'check_substantive_edit_approval_preflight.sh': ({ governedTargets }) =>
    !Array.isArray(governedTargets) || governedTargets.length > 0,
  // 一人一分支閘只判 Bash 的開分支(checkout -b / switch -c)與 push(hooks/check_solo_workflow.sh R1 / R2);
  // 這裡放寬到「git 指令裡出現 push / checkout / switch」,只會多擋、不會漏擋。
  'check_solo_workflow.sh': ({ tool, command }) =>
    tool === 'Bash' && /\bgit\b[\s\S]*\b(?:push|checkout|switch)\b/u.test(String(command || '')),
  // 同儕簡報閘只判呼叫同儕 CLI 的 Bash(hooks/check_codex_brief_invariants.sh);不知道 CLI 名稱 → 保守在範圍內
  'check_codex_brief_invariants.sh': ({ tool, command, peerCli }) =>
    tool === 'Bash' && (!peerCli || String(command || '').includes(peerCli)),
})

export const blindGateScopedHooks = Object.freeze(Object.keys(BLIND_GATE_SCOPES))

export function classifyBlindHookCall({ hookName, tool, command = '', missingTools = [], scope = {} } = {}) {
  if (tool === 'Bash') {
    if (shellCommandRestoresHookTools(command, missingTools)) return { block: false, lane: 'restore' }
    if (shellCommandIsReadOnly(command)) return { block: false, lane: 'read-only' }
  }
  const inScope = BLIND_GATE_SCOPES[hookName]
  if (inScope && !inScope({ tool, command, ...scope })) return { block: false, lane: 'outside-gate-scope' }
  return { block: true, lane: 'gate-scope' }
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

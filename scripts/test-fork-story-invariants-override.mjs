#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  accessSync,
  chmodSync,
  constants,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_HOOK = join(ROOT, 'scripts/fork-hook-overrides/check_story_invariants.sh')
const SOURCE_HELPER_ROOT = join(ROOT, 'packages/design-system/ds-canonical/hooks')
const SOURCE_REGISTRY = join(
  ROOT,
  'packages/design-system/ds-canonical/references/story-baseline-registry.json',
)
const SOURCE_REGISTRY_DOCUMENT = JSON.parse(readFileSync(SOURCE_REGISTRY, 'utf8'))
const TEST_ROOT = mkdtempSync(join(tmpdir(), 'fork-story-invariant-override-'))
const CORPUS_ROOT = join(
  TEST_ROOT,
  'node_modules/@qijenchen/design-system/ds-canonical/fork',
)
const HOOK_ROOT = join(CORPUS_ROOT, 'hooks')
const REFERENCE_ROOT = join(CORPUS_ROOT, 'references')
const HOOK = join(HOOK_ROOT, 'check_story_invariants.sh')
const REGISTRY = join(REFERENCE_ROOT, 'story-baseline-registry.json')
const APP_REL = 'apps/demo/src/App.tsx'
const APP_FILE = join(TEST_ROOT, 'apps/demo/src/App.tsx')
const RUNTIME_ROOT = join(TEST_ROOT, 'runtime')
const PASS = []

function buildFixture() {
  mkdirSync(join(HOOK_ROOT, 'lib'), { recursive: true })
  mkdirSync(REFERENCE_ROOT, { recursive: true })
  mkdirSync(dirname(APP_FILE), { recursive: true })
  mkdirSync(RUNTIME_ROOT, { recursive: true })
  copyFileSync(SOURCE_HOOK, HOOK)
  copyFileSync(join(SOURCE_HELPER_ROOT, '_log-fire.sh'), join(HOOK_ROOT, '_log-fire.sh'))
  copyFileSync(
    join(SOURCE_HELPER_ROOT, 'lib/_hook_integrity.sh'),
    join(HOOK_ROOT, 'lib/_hook_integrity.sh'),
  )
  copyFileSync(
    join(SOURCE_HELPER_ROOT, 'lib/_provider_paths.sh'),
    join(HOOK_ROOT, 'lib/_provider_paths.sh'),
  )
  copyFileSync(SOURCE_REGISTRY, REGISTRY)
  writeFileSync(APP_FILE, 'export const App = () => null\n')
}

function eventPayload({
  tool = 'Edit',
  content = '',
  aliases = false,
  event = 'PreToolUse',
  path = APP_FILE,
  writeState = undefined,
} = {}) {
  const toolInput = { file_path: path }
  if (tool === 'Write') toolInput.content = content
  else if (tool === 'MultiEdit') toolInput.edits = [{ new_string: content }]
  else toolInput.new_string = content
  if (aliases) {
    toolInput.content = content
    toolInput.new_string = content
    toolInput.edits = [{ new_string: content }]
  }
  if (writeState !== undefined) toolInput.governance_write_state = writeState
  return JSON.stringify({
    hook_event_name: event,
    tool_name: tool,
    tool_input: toolInput,
  })
}

async function runHook(payload, {
  extraEnv = {},
  pathPrefix = '',
  timeoutMs = 20_000,
  writeStateTrust = 'unavailable',
} = {}) {
  return await new Promise((resolveRun, rejectRun) => {
    const started = Date.now()
    const environment = {
      ...process.env,
      GOVERNANCE_CORPUS_ROOT: CORPUS_ROOT,
      GOVERNANCE_PROJECT_DIR: TEST_ROOT,
      GOVERNANCE_READ_ONLY: '1',
      GOVERNANCE_TELEMETRY_OPT_IN: '0',
      GOVERNANCE_WRITE_STATE_TRUST: writeStateTrust,
      TMPDIR: RUNTIME_ROOT,
      ...(pathPrefix ? { PATH: `${pathPrefix}:${process.env.PATH}` } : {}),
      ...extraEnv,
    }
    if (writeStateTrust === null) delete environment.GOVERNANCE_WRITE_STATE_TRUST
    const child = spawn('bash', ['--', HOOK], {
      cwd: TEST_ROOT,
      detached: true,
      env: environment,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout = []
    const stderr = []
    let timedOut = false
    let settled = false
    child.stdout.on('data', chunk => stdout.push(chunk))
    child.stderr.on('data', chunk => stderr.push(chunk))
    child.on('error', error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectRun(error)
    })
    child.stdin.on('error', error => {
      if (error.code !== 'EPIPE' && !settled) {
        settled = true
        clearTimeout(timer)
        rejectRun(error)
      }
    })
    child.on('close', (status, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveRun({
        status: timedOut ? 124 : (status ?? 127),
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut,
        elapsedMs: Date.now() - started,
      })
    })
    const timer = setTimeout(() => {
      timedOut = true
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        child.kill('SIGKILL')
      }
    }, timeoutMs)
    child.stdin.end(payload)
  })
}

function mark(name) {
  PASS.push(name)
  process.stdout.write(`  PASS  ${name}\n`)
}

function assertSilent(result, name) {
  assert.equal(result.timedOut, false, `${name}: timed out`)
  assert.equal(result.status, 0, `${name}: exit ${result.status}\n${result.stderr}`)
  assert.equal(result.stdout, '', `${name}: unexpected stdout`)
  assert.equal(result.stderr, '', `${name}: unexpected stderr`)
  mark(name)
}

function assertBlock(result, name, needle) {
  assert.equal(result.timedOut, false, `${name}: timed out`)
  assert.equal(result.status, 2, `${name}: exit ${result.status}\n${result.stderr}`)
  assert.equal(result.stdout, '', `${name}: policy block must be stderr-only`)
  assert.match(result.stderr, new RegExp(needle), `${name}: missing policy diagnostic`)
  assert.doesNotMatch(result.stderr, /GOVERNANCE_INTEGRITY:|broken pipe/i)
  mark(name)
}

function assertIntegrity(result, name, needle) {
  assert.equal(result.timedOut, false, `${name}: timed out`)
  assert.equal(result.status, 70, `${name}: exit ${result.status}\n${result.stderr}`)
  assert.equal(result.stdout, '', `${name}: integrity failure must be stderr-only`)
  assert.match(result.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(result.stderr, new RegExp(needle), `${name}: missing integrity diagnostic`)
  assert.doesNotMatch(result.stderr, /broken pipe/i)
  mark(name)
}

function assertContext(result, name, needle) {
  assert.equal(result.timedOut, false, `${name}: timed out`)
  assert.equal(result.status, 0, `${name}: exit ${result.status}\n${result.stderr}`)
  assert.equal(result.stderr, '', `${name}: warning context must not use stderr`)
  assert.equal(result.stdout.endsWith('\n'), true, `${name}: JSON context needs one record newline`)
  const lines = result.stdout.trimEnd().split('\n')
  assert.equal(lines.length, 1, `${name}: warning must be one JSON record`)
  const parsed = JSON.parse(lines[0])
  assert.deepEqual(Object.keys(parsed), ['governanceContext'])
  assert.deepEqual(Object.keys(parsed.governanceContext).sort(), ['hookEventName', 'message'])
  assert.equal(parsed.governanceContext.hookEventName, 'PreToolUse')
  assert.match(parsed.governanceContext.message, new RegExp(needle))
  mark(name)
}

function writeRegistry(components) {
  writeFileSync(REGISTRY, `${JSON.stringify({
    ...SOURCE_REGISTRY_DOCUMENT,
    components,
  }, null, 2)}\n`)
}

function pattern(regex, severity = 'block', unlessRegex = undefined) {
  return {
    id: 'fixture-pattern',
    regex,
    severity,
    rationale: 'focused test fixture',
    ...(unlessRegex === undefined ? {} : { unlessRegex }),
  }
}

try {
  buildFixture()
  process.stdout.write('=== fork story invariant source override tests ===\n')

  assertSilent(
    await runHook(eventPayload({ tool: 'Write', content: 'export const App = () => null' })),
    'clean consumer source → exact silent pass',
  )

  const sidebarViolation = [
    '<Sidebar>',
    '  <SidebarHeader>',
    '    <span>Acme</span>',
    '  </SidebarHeader>',
    '</Sidebar>',
  ].join('\n')
  assertBlock(
    await runHook(eventPayload({ content: sidebarViolation })),
    'R8 multiline Sidebar simplified mock → block',
    'R8 story_archetype_registry',
  )

  const dataTableWarning = '<DataTable><Button startIcon={Filter} /></DataTable>'
  assertContext(
    await runHook(eventPayload({ content: dataTableWarning })),
    'R8 warn severity → one exact governance context',
    'severity: warn',
  )
  assertSilent(
    await runHook(eventPayload({
      content: `${dataTableWarning}<DataTableFilterPanel />`,
    })),
    'R8 unlessRegex match → silent',
  )

  const r9Violation = [
    '<div',
    '  className="flex px-[var(--layout-space-loose)]',
    '    border-b',
    '    border-divider"',
    '>Header</div>',
  ].join('\n')
  assertBlock(
    await runHook(eventPayload({ content: r9Violation })),
    'R9 multiline hand-crafted overlay header → block',
    'R9 hand-craft overlay',
  )
  assertSilent(
    await runHook(eventPayload({
      content: '// <div className="px-[var(--layout-space-loose)] border-b border-divider">\n<SurfaceHeader />',
    })),
    'R9 comment-only signature → silent',
  )
  assertSilent(
    await runHook(eventPayload({
      content: '<div className="px-[var(--layout-space-loose)]" data-x="border-b border-divider" />',
    })),
    'R9 cross-attribute signature → silent',
  )

  const largeFiller = 'safe-padding-0123456789abcdef'.repeat(12_000)
  assert.ok(Buffer.byteLength(largeFiller) > 256 * 1024)
  assertSilent(
    await runHook(eventPayload({
      tool: 'Write',
      content: `// @story-baseline-allow: approved migration\n${sidebarViolation}\n// ${largeFiller}`,
    })),
    '>256KiB early allow marker → exact silent pass',
  )
  assertBlock(
    await runHook(eventPayload({
      content: `${sidebarViolation}\n// ${largeFiller}`,
    })),
    '>256KiB early R8 policy token → block without SIGPIPE',
    'R8 story_archetype_registry',
  )
  assertBlock(
    await runHook(eventPayload({
      content: `${r9Violation}\n// ${largeFiller}`,
    })),
    '>256KiB early R9 policy token → block without SIGPIPE',
    'R9 hand-craft overlay',
  )

  writeRegistry({
    Sidebar: {
      antiPatterns: [
        pattern('ALIAS_END</Sidebar>[[:space:]]+<Sidebar>ALIAS_START'),
      ],
    },
    DataTable: { antiPatterns: [pattern('NEVER_MATCH_DATATABLE_8642')] },
    ChromeHeader: { antiPatterns: [pattern('NEVER_MATCH_CHROMEHEADER_8642')] },
  })
  const aliasContent = '<Sidebar>ALIAS_START safe ALIAS_END</Sidebar>'
  assertSilent(
    await runHook(eventPayload({ content: aliasContent, aliases: true })),
    'normalized content/new_string/edits aliases → authoritative Edit payload once',
  )

  copyFileSync(SOURCE_REGISTRY, REGISTRY)
  const lineRich = Array.from(
    { length: 4_000 },
    (_, index) => `const safeLine${String(index).padStart(4, '0')} = ${index}; // inert fixture padding`,
  ).join('\n')
  const lineRichResult = await runHook(eventPayload({
    content: lineRich,
    aliases: true,
  }))
  assertSilent(lineRichResult, '4,000-line normalized replay → silent within 20s')
  assert.ok(lineRichResult.elapsedMs < 20_000)

  unlinkSync(REGISTRY)
  assertIntegrity(
    await runHook(eventPayload({ content: sidebarViolation })),
    'missing registry → fail closed',
    'registry is unavailable or unsafe',
  )

  symlinkSync(SOURCE_REGISTRY, REGISTRY)
  assertIntegrity(
    await runHook(eventPayload({ content: sidebarViolation })),
    'symlinked registry → fail closed',
    'registry escapes the corpus or crosses a symlink',
  )
  unlinkSync(REGISTRY)

  writeFileSync(REGISTRY, '{')
  assertIntegrity(
    await runHook(eventPayload({ content: sidebarViolation })),
    'malformed registry JSON → fail closed',
    'registry is invalid',
  )

  writeFileSync(REGISTRY, `${JSON.stringify({
    ...SOURCE_REGISTRY_DOCUMENT,
    schemaVersion: 2,
  }, null, 2)}\n`)
  assertIntegrity(
    await runHook(eventPayload({ content: sidebarViolation })),
    'wrong registry schemaVersion → fail closed',
    'registry is invalid',
  )

  writeFileSync(REGISTRY, `${JSON.stringify({
    ...SOURCE_REGISTRY_DOCUMENT,
    _meta: {
      ...SOURCE_REGISTRY_DOCUMENT._meta,
      owner: '.claude/references/story-baseline-registry.json',
    },
  }, null, 2)}\n`)
  assertIntegrity(
    await runHook(eventPayload({ content: sidebarViolation })),
    'provider-view registry owner → fail closed',
    'registry is invalid',
  )

  writeRegistry({
    Sidebar: { antiPatterns: [] },
    DataTable: { antiPatterns: [pattern('SAFE')] },
    ChromeHeader: { antiPatterns: [pattern('SAFE')] },
  })
  assertIntegrity(
    await runHook(eventPayload({ content: sidebarViolation })),
    'empty required registry pattern set → fail closed',
    'registry is invalid',
  )

  writeRegistry({
    Sidebar: { antiPatterns: [pattern('[')] },
    DataTable: { antiPatterns: [pattern('SAFE')] },
    ChromeHeader: { antiPatterns: [pattern('SAFE')] },
  })
  assertIntegrity(
    await runHook(eventPayload({ content: sidebarViolation })),
    'invalid registry ERE → fail closed',
    'regex is not executable',
  )

  copyFileSync(SOURCE_REGISTRY, REGISTRY)
  const realJq = (process.env.PATH || '')
    .split(delimiter)
    .filter(Boolean)
    .map(directory => join(directory, 'jq'))
    .find(candidate => {
      try {
        accessSync(candidate, constants.X_OK)
        return true
      } catch {
        return false
      }
    })
  assert.ok(realJq, 'jq must be available on PATH for the query-failure fixture')
  const shimRoot = join(TEST_ROOT, 'query-failure-bin')
  const shim = join(shimRoot, 'jq')
  mkdirSync(shimRoot, { recursive: true })
  writeFileSync(shim, [
    '#!/bin/bash',
    'for argument in "$@"; do',
    '  case "$argument" in',
    "    *'.components[$c].antiPatterns[]'*) exit 41 ;;",
    '  esac',
    'done',
    'exec "$GOVERNANCE_TEST_REAL_JQ" "$@"',
    '',
  ].join('\n'))
  chmodSync(shim, 0o755)
  assertIntegrity(
    await runHook(eventPayload({ content: sidebarViolation }), {
      extraEnv: { GOVERNANCE_TEST_REAL_JQ: realJq },
      pathPrefix: shimRoot,
    }),
    'registry query command failure → fail closed',
    'registry query failed',
  )

  assertIntegrity(
    await runHook('{'),
    'malformed hook input → stderr-only integrity failure',
    'invalid input envelope',
  )
  assertSilent(
    await runHook(eventPayload({ event: 'PostToolUse', content: sidebarViolation })),
    'PostToolUse consumer replay → exact silent pass',
  )
  assertSilent(
    await runHook(eventPayload({ tool: 'Read', content: sidebarViolation })),
    'unsupported tool → exact silent pass',
  )

  const cleanAfterImage = '<Sidebar><WorkspaceBrand /></Sidebar>'
  assertSilent(
    await runHook(eventPayload({
      content: sidebarViolation,
      writeState: {
        schemaVersion: 1,
        path: APP_REL,
        kind: 'text',
        content: cleanAfterImage,
      },
    }), { writeStateTrust: 'runner-v1' }),
    'proposed-text clean after-image overrides violating raw Edit fragment',
  )
  assertBlock(
    await runHook(eventPayload({
      content: cleanAfterImage,
      writeState: {
        schemaVersion: 1,
        path: APP_REL,
        kind: 'text',
        content: sidebarViolation,
      },
    }), { writeStateTrust: 'runner-v1' }),
    'proposed-text violating after-image overrides clean raw Edit fragment',
    'R8 story_archetype_registry',
  )
  assertBlock(
    await runHook(eventPayload({
      tool: 'MultiEdit',
      content: cleanAfterImage,
      writeState: {
        schemaVersion: 1,
        path: APP_REL,
        kind: 'text',
        content: sidebarViolation,
      },
    }), { writeStateTrust: 'runner-v1' }),
    'proposed-text MultiEdit enforces the full violating after-image',
    'R8 story_archetype_registry',
  )
  assertIntegrity(
    await runHook(eventPayload({
      content: cleanAfterImage,
    }), { writeStateTrust: 'runner-v1' }),
    'runner-v1 without proposed state → fail closed',
    'missing or malformed',
  )
  assertIntegrity(
    await runHook(eventPayload({
      content: cleanAfterImage,
      writeState: {
        schemaVersion: '1',
        path: APP_REL,
        kind: 'text',
        content: null,
      },
    }), { writeStateTrust: 'runner-v1' }),
    'malformed proposed state → fail closed',
    'missing or malformed',
  )
  assertIntegrity(
    await runHook(eventPayload({
      content: cleanAfterImage,
      writeState: {
        schemaVersion: 1,
        path: 'apps/other/src/Other.tsx',
        kind: 'text',
        content: sidebarViolation,
      },
    }), { writeStateTrust: 'runner-v1' }),
    'mismatched proposed state path → fail closed',
    'does not match',
  )
  assertSilent(
    await runHook(eventPayload({
      content: sidebarViolation,
      writeState: {
        schemaVersion: 1,
        path: APP_REL,
        kind: 'deleted',
      },
    }), { writeStateTrust: 'runner-v1' }),
    'trusted deleted after-image → exact silent pass',
  )

  writeFileSync(
    APP_FILE,
    `// @story-baseline-allow: stale disk exception\n${sidebarViolation}\n`,
  )
  assertBlock(
    await runHook(eventPayload({
      content: cleanAfterImage,
      writeState: {
        schemaVersion: 1,
        path: APP_REL,
        kind: 'text',
        content: sidebarViolation,
      },
    }), { writeStateTrust: 'runner-v1' }),
    'trusted after-image removing stale disk allow marker → block immediately',
    'R8 story_archetype_registry',
  )
  writeFileSync(APP_FILE, 'export const App = () => null\n')

  const nullAliasFallback = JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: {
      file_path: APP_FILE,
      new_string: null,
      content: sidebarViolation,
    },
  })
  assertBlock(
    await runHook(nullAliasFallback, { writeStateTrust: 'unavailable' }),
    'event-v1 null new_string falls through to valid content string',
    'R8 story_archetype_registry',
  )

  process.stdout.write(`✓ ${PASS.length}/${PASS.length} fork story override focused checks passed\n`)
} finally {
  rmSync(TEST_ROOT, { recursive: true, force: true })
}

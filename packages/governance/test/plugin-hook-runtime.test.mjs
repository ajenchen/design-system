import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { buildClaudePluginHookView } from '../../../scripts/gen-codex-adapter.mjs'
import { buildProviderRuntimeValidator } from '../../../scripts/gen-provider-runtime-validator.mjs'
import { buildProviderHookLaunchArgv } from '../../../scripts/lib/provider-hook-output-transport.mjs'

// These adversarial suites assert the fail-closed integrity lane. The production
// default is fail-open (hooks are accelerators, not the trust boundary); strict
// semantics are opted into exactly like a high-assurance deployment would.
Object.assign(process.env, { GOVERNANCE_HOOK_STRICT: '1' })


const repoRoot = resolve(import.meta.dirname, '../../..')
const registrations = JSON.parse(await readFile(
  resolve(repoRoot, 'packages/design-system/ds-canonical/hooks/registrations.json'),
  'utf8',
))

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}

async function copyFileTree(source, target) {
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target, { recursive: true })
}

async function snapshot(root, current = root) {
  const rows = []
  for (const name of (await readdir(current)).sort()) {
    if (current === root && name === '.git') continue
    const path = resolve(current, name)
    const info = await stat(path)
    const rel = path.slice(root.length + 1)
    if (info.isDirectory()) rows.push(['d', rel], ...(await snapshot(root, path)))
    else rows.push(['f', rel, createHash('sha256').update(await readFile(path)).digest('hex')])
  }
  return rows
}

async function fixture(t) {
  const plugin = await mkdtemp(resolve(tmpdir(), 'governance-plugin-cache-'))
  const target = await mkdtemp(resolve(tmpdir(), 'governance-plugin-target-'))
  const outside = await mkdtemp(resolve(tmpdir(), 'governance-plugin-outside-'))
  t.after(() => Promise.all([
    rm(plugin, { recursive: true, force: true }),
    rm(target, { recursive: true, force: true }),
    rm(outside, { recursive: true, force: true }),
  ]))
  for (const [source, destination = source] of [
    ['AGENTS.md'],
    ['scripts/run-provider-hook.mjs'],
    ['scripts/lib/canonical-path-containment.mjs'],
    ['scripts/lib/closed-tool-execution.mjs'],
    ['scripts/lib/provider-hook-output-transport.mjs'],
    ['packages/governance/src/canonical-order.mjs'],
    ['packages/governance/src/closed-tool-execution.mjs'],
    ['packages/governance/src/provider-hook-normalization.mjs'],
    ['packages/governance/src/provider-review-binding.mjs'],
    ['packages/governance/src/authority-decision-evidence.mjs'],
    ['scripts/lib/provider-contract-validation.mjs'],
    ['scripts/lib/provider-runtime-contract.mjs'],
    ['scripts/lib/provider-runtime-validation.mjs'],
    ['generated/governance/provider-runtime-validator.mjs'],
    ['packages/governance/canonical/providers.json'],
    ['packages/governance/canonical/schemas/providers.schema.json'],
    ['packages/design-system/ds-canonical/hooks/registrations.schema.json'],
    ['packages/design-system/src/tokens/utility-registry.json'],
    ['packages/design-system/ds-canonical/references'],
    ['packages/design-system/ds-canonical/rules'],
    ['packages/design-system/ds-canonical/skills'],
    ['scripts/schemas/provider-skill-semantics.schema.json'],
    ['packages/design-system/ds-canonical/hooks'],
  ]) await copyFileTree(resolve(repoRoot, source), resolve(plugin, destination))
  await writeFile(
    resolve(plugin, 'generated/governance/provider-runtime-validator.mjs'),
    buildProviderRuntimeValidator({ root: repoRoot }),
  )
  const view = buildClaudePluginHookView().config
  await mkdir(resolve(plugin, 'hooks'), { recursive: true })
  await writeFile(resolve(plugin, 'hooks/hooks.json'), `${JSON.stringify(view, null, 2)}\n`)

  for (const root of [plugin, target]) {
    git(root, 'init', '-q')
    git(root, 'config', 'user.email', 'governance-test@example.invalid')
    git(root, 'config', 'user.name', 'governance-test')
  }
  await copyFileTree(
    resolve(repoRoot, 'packages/governance/canonical/manifest.json'),
    resolve(target, 'packages/governance/canonical/manifest.json'),
  )
  await mkdir(resolve(target, 'governance/generated/adapters'), { recursive: true })
  await mkdir(resolve(target, 'apps/demo/src'), { recursive: true })
  await writeFile(resolve(target, 'CLAUDE.md'), '# consumer\n')
  await writeFile(resolve(target, 'apps/demo/src/Bad.tsx'), 'const unsafe: any = 1\n')
  await writeFile(resolve(target, 'governance/generated/adapters/claude-hook.mjs'), `
let body = ''
for await (const chunk of process.stdin) body += chunk
if ('GOVERNANCE_TOOL_INPUT' in process.env || 'CLAUDE_TOOL_INPUT' in process.env) {
  console.error('provider payload environment leaked into canonical child')
  process.exit(73)
}
const input = JSON.parse(body || '{}')
process.stdout.write(JSON.stringify({governanceContext:{hookEventName:input.hook_event_name,message:'plugin control plane reached target'}}))
`)
  await writeFile(resolve(plugin, 'README.md'), 'clean plugin cache fixture\n')
  return { plugin, target, outside, view }
}

function argumentValue(argv, name) {
  const index = argv.indexOf(name)
  return index === -1 ? null : argv[index + 1] ?? null
}

function projectedGroupSpecs(view) {
  const projected = new Set(view.projected.map(({ event, hook }) => `${event}\0${hook}`))
  const specs = []
  for (const [event, groups] of Object.entries(registrations.hooks)) {
    for (const [groupIndex, group] of groups.entries()) {
      const eligible = group.hooks.some((descriptor) =>
        projected.has(`${event}\0${descriptor.hook || descriptor.command}`))
      if (!eligible) continue
      specs.push({ event, groupIndex, matcher: group.matcher || '' })
    }
  }
  return specs
}

function projectedGroupFor(view, event, groupIndex) {
  const config = view.config || view
  const matches = Object.entries(config.hooks)
    .flatMap(([nativeEvent, groups]) => groups.map((group) => ({ nativeEvent, group })))
    .filter(({ group }) => (group.hooks || []).some((handler) =>
      argumentValue(handler.args || [], '--event') === event
      && argumentValue(handler.args || [], '--group') === String(groupIndex)))
  assert.equal(matches.length, 1, `expected one generated plugin group handler:${event}:${groupIndex}`)
  return matches[0]
}

function handlerForGroup(view, event, groupIndex) {
  const { group } = projectedGroupFor(view, event, groupIndex)
  assert.equal(group.hooks.length, 1, `expected one batched handler:${event}:${groupIndex}`)
  return group.hooks[0]
}

function commandFor(view, hookName, eventName = null) {
  const matches = []
  for (const [event, groups] of Object.entries(registrations.hooks)) {
    if (eventName && event !== eventName) continue
    for (const [groupIndex, group] of groups.entries()) {
      if (group.hooks.some((descriptor) => (descriptor.hook || descriptor.command) === hookName)) {
        matches.push(handlerForGroup(view, event, groupIndex))
      }
    }
  }
  assert.equal(matches.length, 1, `expected one generated plugin group for canonical hook:${hookName}`)
  return matches[0]
}

function run({ plugin, target, descriptor, payload, extraEnv = {} }) {
  const environment = {
    ...process.env,
    CLAUDE_PLUGIN_ROOT: plugin,
    CLAUDE_PROJECT_DIR: target,
    GOVERNANCE_PROVIDER: 'claude',
    ...extraEnv,
  }
  for (const name of ['GOVERNANCE_PROJECT_DIR', 'GOVERNANCE_STATE_DIR', 'GOVERNANCE_RUNTIME_ROOT', 'GOVERNANCE_TELEMETRY_OPT_IN', 'GOVERNANCE_READ_ONLY']) {
    if (!(name in extraEnv)) delete environment[name]
  }
  const event = argumentValue(descriptor.args, '--event')
  const groupIndex = argumentValue(descriptor.args, '--group')
  assert.deepEqual(
    [descriptor.command, ...descriptor.args],
    buildProviderHookLaunchArgv([
      'node',
      '${CLAUDE_PLUGIN_ROOT}/scripts/run-provider-hook.mjs',
      '--provider', 'claude',
      '--event', event,
      '--group', groupIndex,
      '--target-role', 'ds-author',
    ]),
    'generated plugin command must preserve the exact structured prelaunch boundary',
  )
  const argv = [descriptor.command, ...descriptor.args]
    .map((value) => value.replaceAll('${CLAUDE_PLUGIN_ROOT}', plugin))
  assert.equal(argv[0], '/usr/bin/env')
  return spawnSync(process.execPath, [
    '--',
    resolve(import.meta.dirname, 'fixtures/provider-hook-structured-launch-wrapper.mjs'),
  ], {
    cwd: plugin,
    env: process.env,
    input: JSON.stringify({
      command: argv[0],
      args: argv.slice(1),
      cwd: plugin,
      env: environment,
      input: `${JSON.stringify(payload)}\n`,
    }),
    encoding: 'utf8',
  })
}

test('clean authority plugin cache projects all canonical Claude registrations and isolates corpus from target', async (t) => {
  const data = await fixture(t)
  assert.equal(data.view.description.includes('canonical hooks='), true)
  const specs = projectedGroupSpecs(buildClaudePluginHookView())
  const descriptors = Object.values(data.view.hooks)
    .flatMap((groups) => groups.flatMap((group) => group.hooks))
  assert.equal(specs.length, 16)
  assert.equal(descriptors.length, specs.length)
  for (const { event, groupIndex, matcher } of specs) {
    const { nativeEvent, group } = projectedGroupFor({ config: data.view }, event, groupIndex)
    assert.equal(nativeEvent, event)
    assert.deepEqual(
      group,
      {
        ...(matcher ? { matcher } : {}),
        hooks: [{
          type: 'command',
          command: '/usr/bin/env',
          args: buildProviderHookLaunchArgv([
            'node',
            '${CLAUDE_PLUGIN_ROOT}/scripts/run-provider-hook.mjs',
            '--provider', 'claude',
            '--event', event,
            '--group', String(groupIndex),
            '--target-role', 'ds-author',
          ]).slice(1),
        }],
      },
    )
  }
  await assert.rejects(stat(resolve(data.plugin, 'node_modules')))
  await assert.rejects(stat(resolve(data.plugin, 'package.json')))
  const standaloneValidator = await readFile(resolve(data.plugin, 'generated/governance/provider-runtime-validator.mjs'), 'utf8')
  assert.doesNotMatch(standaloneValidator, /\brequire\(/)
  assert.doesNotMatch(standaloneValidator, /^\s*import\s+.*\sfrom\s+['"][^./]/m)

  const before = await snapshot(data.plugin)
  const targetBefore = await snapshot(data.target)
  const control = run({
    ...data,
    descriptor: commandFor(data.view, 'governance_control_plane.sh'),
    payload: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: 'governance/generated/example.json', content: '{}' },
    },
  })
  assert.equal(control.status, 0, control.stderr)
  assert.match(JSON.parse(control.stdout).hookSpecificOutput.additionalContext, /reached target/)

  const fanout = run({
    ...data,
    descriptor: commandFor(data.view, 'check_consumer_code_quality.sh'),
    payload: {
      hook_event_name: 'PostToolUse', tool_name: 'MultiEdit',
      tool_input: { edits: [
        { file_path: 'README.md', old_string: '# consumer\n', new_string: '# benign\n' },
        {
          file_path: 'apps/demo/src/Bad.tsx',
          old_string: 'const unsafe: any = 1\n',
          new_string: 'const unsafe: any = 1\n',
        },
      ] },
    },
  })
  assert.equal(fanout.status, 2)
  assert.match(fanout.stderr, /GOV-CONSUMER-QUALITY-001/)
  assert.doesNotMatch(fanout.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.deepEqual(await snapshot(data.plugin), before, 'plugin corpus must remain byte-for-byte read-only')
  assert.deepEqual(await snapshot(data.target), targetBefore, 'hook projection must not apply the proposed write to the target')
})

test('authority plugin is inactive in product and unknown targets before transcript validation', async (t) => {
  const data = await fixture(t)
  const authorityManifest = resolve(data.target, 'packages/governance/canonical/manifest.json')
  await rm(authorityManifest)
  await mkdir(resolve(data.target, 'governance'), { recursive: true })
  await writeFile(resolve(data.target, 'governance/lock.json'), `${JSON.stringify({
    schemaVersion: 1,
    role: 'template-consumer',
  })}\n`)
  const descriptor = commandFor(data.view, 'check_propose_without_benchmark.sh', 'UserPromptSubmit')
  const payload = {
    hook_event_name: 'UserPromptSubmit',
    prompt: 'hi',
  }

  const product = run({ ...data, descriptor, payload })
  assert.equal(product.status, 0, product.stderr)
  assert.equal(product.stdout, '')
  assert.equal(product.stderr, '')

  const largeProduct = run({
    ...data,
    descriptor,
    payload: { ...payload, prompt: 'x'.repeat(1024 * 1024) },
  })
  assert.equal(largeProduct.status, 0, largeProduct.stderr)
  assert.equal(largeProduct.stdout, '')
  assert.equal(largeProduct.stderr, '')

  await rm(resolve(data.target, 'governance/lock.json'))
  const unknown = run({ ...data, descriptor, payload })
  assert.equal(unknown.status, 0, unknown.stderr)
  assert.equal(unknown.stdout, '')
  assert.equal(unknown.stderr, '')
})

test('plugin runner carries large normalized payloads only through stdin', async (t) => {
  const data = await fixture(t)
  const result = run({
    ...data,
    descriptor: commandFor(data.view, 'governance_control_plane.sh'),
    payload: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: {
        file_path: 'governance/generated/large.json',
        content: 'x'.repeat(512 * 1024),
      },
    },
    extraEnv: {
      GOVERNANCE_TOOL_INPUT: 'stale-neutral-payload',
      CLAUDE_TOOL_INPUT: 'stale-claude-payload',
    },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /reached target/)
})

test('plugin structured launcher removes inherited startup injection before runner bootstrap', async (t) => {
  const data = await fixture(t)
  const nodePoison = resolve(data.outside, 'node-poison.cjs')
  const shellPoison = resolve(data.outside, 'shell-poison.sh')
  await writeFile(nodePoison, 'process.exit(92)\n')
  await writeFile(shellPoison, 'exit 91\n')
  const result = run({
    ...data,
    descriptor: commandFor(data.view, 'governance_control_plane.sh'),
    payload: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: 'governance/generated/prelaunch.json', content: '{}' },
    },
    extraEnv: {
      PATH: data.outside,
      GIT_DIR: data.outside,
      BASH_ENV: shellPoison,
      NODE_OPTIONS: `--require=${nodePoison}`,
      NODE_PATH: data.outside,
    },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /reached target/)
})

test('plugin runner scrubs inherited payload aliases before every child process', async (t) => {
  const data = await fixture(t)
  const result = spawnSync(process.execPath, [
    '--',
    resolve(import.meta.dirname, 'fixtures/provider-hook-payload-environment-wrapper.mjs'),
  ], {
    cwd: data.plugin,
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: data.plugin,
      CLAUDE_PROJECT_DIR: data.target,
      GOVERNANCE_PROVIDER: 'claude',
    },
    input: `${JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: 'governance/generated/small.json', content: '{}' },
    })}\n`,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /reached target/)
})

test('clean plugin runner blocks target escapes and inherited telemetry redirection', async (t) => {
  const data = await fixture(t)
  const quality = commandFor(data.view, 'check_consumer_code_quality.sh')
  for (const filePath of ['../outside.tsx', resolve(data.outside, 'outside.tsx')]) {
    const result = run({
      ...data,
      descriptor: quality,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: { file_path: filePath, content: 'const x: any = 1' },
      },
    })
    assert.equal(result.status, 70)
    assert.match(result.stderr, /GOVERNANCE_INTEGRITY:/)
    assert.match(result.stderr, /changed path escapes repository root/)
  }

  const logger = commandFor(data.view, 'log_governance_fires.sh')
  const payload = {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: 'CLAUDE.md', content: '# changed\n' },
  }
  const redirected = run({
    ...data,
    descriptor: logger,
    payload,
    extraEnv: { GOVERNANCE_TELEMETRY_OPT_IN: '1', GOVERNANCE_STATE_DIR: data.outside },
  })
  assert.equal(redirected.status, 70)
  assert.match(redirected.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(redirected.stderr, /GOVERNANCE_STATE_DIR_OUTSIDE_RUNTIME_ROOT/)
  await assert.rejects(stat(resolve(data.outside, 'hook-fires.jsonl')))
})

test('ordinary and CI plugin hooks are read-only; explicit telemetry stays in target Git runtime', async (t) => {
  const data = await fixture(t)
  const logger = commandFor(data.view, 'log_governance_fires.sh')
  const payload = {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: 'CLAUDE.md', content: '# changed\n' },
  }

  assert.equal(run({ ...data, descriptor: logger, payload }).status, 0)
  assert.equal(run({
    ...data,
    descriptor: logger,
    payload,
    extraEnv: { GOVERNANCE_TELEMETRY_OPT_IN: '1', GOVERNANCE_READ_ONLY: '1', GOVERNANCE_STATE_DIR: resolve(data.target, '.claude/logs') },
  }).status, 0)
  await assert.rejects(stat(resolve(data.target, '.claude/logs')))
  await assert.rejects(stat(resolve(data.target, '.git/governance-runtime')))

  const opted = run({ ...data, descriptor: logger, payload, extraEnv: { GOVERNANCE_TELEMETRY_OPT_IN: '1' } })
  assert.equal(opted.status, 0, opted.stderr)
  assert.match(await readFile(resolve(data.target, '.git/governance-runtime/hook-fires.jsonl'), 'utf8'), /CLAUDE\.md/)
  await assert.rejects(stat(resolve(data.plugin, '.git/governance-runtime')))
  await assert.rejects(stat(resolve(data.target, '.claude/logs')))
})

test('plugin telemetry rejects default-root and nested state symlinks without touching external targets', async (t) => {
  const data = await fixture(t)
  const logger = commandFor(data.view, 'log_governance_fires.sh')
  const payload = {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: 'CLAUDE.md', content: '# changed\n' },
  }
  const sentinel = resolve(data.outside, 'sentinel.txt')
  await writeFile(sentinel, 'unchanged\n')

  const runtimeRoot = resolve(await realpath(resolve(data.target, '.git')), 'governance-runtime')
  await symlink(data.outside, runtimeRoot, 'dir')
  const defaultRedirect = run({ ...data, descriptor: logger, payload, extraEnv: { GOVERNANCE_TELEMETRY_OPT_IN: '1' } })
  assert.equal(defaultRedirect.status, 70)
  assert.match(defaultRedirect.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(defaultRedirect.stderr, /governance runtime root crosses a symbolic link/)
  assert.equal(await readFile(sentinel, 'utf8'), 'unchanged\n')
  await assert.rejects(stat(resolve(data.outside, 'hook-fires.jsonl')))

  await rm(runtimeRoot)
  await mkdir(runtimeRoot)
  await symlink(data.outside, resolve(runtimeRoot, 'nested'), 'dir')
  const nestedRedirect = run({
    ...data,
    descriptor: logger,
    payload,
    extraEnv: { GOVERNANCE_TELEMETRY_OPT_IN: '1', GOVERNANCE_STATE_DIR: resolve(runtimeRoot, 'nested') },
  })
  assert.equal(nestedRedirect.status, 70)
  assert.match(nestedRedirect.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(nestedRedirect.stderr, /governance state directory crosses a symbolic link/)
  assert.equal(await readFile(sentinel, 'utf8'), 'unchanged\n')
  await assert.rejects(stat(resolve(data.outside, 'hook-fires.jsonl')))
})

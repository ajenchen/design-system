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
  // 群組數由 canonical 登記推導(projectedGroupSpecs),不寫死:2026-09-24 寫死的 16 在 PreToolUse
  // 多了第 7 群後成為假紅。要保證的性質是「每個 canonical 群組恰好投影一個 handler」,由下一行與迴圈驗。
  assert.ok(specs.length > 0, 'canonical 群組推導數必須非零,否則下面全是空斷言')
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

// ── N34 / G4(2026-10-07):一支壞掉的 hook 只降級它自己;缺 jq 不得讀成「檢查通過」──
// 兩者都走 ordinary(fail-open)那條路:GOVERNANCE_HOOK_STRICT=0、不密封語料,直接呼叫 runner,
// PATH 由本測試決定(open profile 依 hook 實際拿到的 PATH 判斷工具在不在)。
function directGroupRun(data, { event, group, payload, env = {}, hookPath = null }) {
  // 同一條結構化啟動路徑(/usr/bin/env + 固定 PATH),只把 PATH 換成本測試指定的目錄。
  const argv = buildProviderHookLaunchArgv([
    'node',
    '${CLAUDE_PLUGIN_ROOT}/scripts/run-provider-hook.mjs',
    '--provider', 'claude',
    '--event', event,
    '--group', String(group),
    '--target-role', 'ds-author',
  ])
    .map((value) => value.replaceAll('${CLAUDE_PLUGIN_ROOT}', data.plugin))
    .map((value) => (hookPath && value.startsWith('PATH=') ? `PATH=${hookPath}` : value))
  assert.equal(argv.filter((value) => value.startsWith('PATH=')).length, 1, 'launch argv must set exactly one PATH')
  return spawnSync(process.execPath, [
    '--',
    resolve(import.meta.dirname, 'fixtures/provider-hook-structured-launch-wrapper.mjs'),
  ], {
    cwd: data.plugin,
    env: process.env,
    input: JSON.stringify({
      command: argv[0],
      args: argv.slice(1),
      cwd: data.plugin,
      env: {
        HOME: process.env.HOME || data.outside,
        TMPDIR: process.env.TMPDIR || tmpdir(),
        CLAUDE_PLUGIN_ROOT: data.plugin,
        CLAUDE_PROJECT_DIR: data.target,
        GOVERNANCE_PROVIDER: 'claude',
        GOVERNANCE_HOOK_STRICT: '0',
        GOVERNANCE_READ_ONLY: '1',
        ...env,
      },
      input: `${JSON.stringify(payload)}\n`,
    }),
    encoding: 'utf8',
  })
}

async function userPromptGroupFixture(t, hooks) {
  const data = await fixture(t)
  const group = registrations.hooks.UserPromptSubmit.findIndex((item) =>
    item.hooks.some((descriptor) => descriptor.hook === 'check_propose_without_benchmark.sh'))
  assert.ok(group >= 0, 'UserPromptSubmit group must exist in canonical registrations')
  const names = registrations.hooks.UserPromptSubmit[group].hooks.map((descriptor) => descriptor.hook)
  assert.ok(names.length >= 3, 'the group must hold several hooks for an isolation test to mean anything')
  for (const [name, body] of Object.entries(hooks(names))) {
    await writeFile(resolve(data.plugin, 'packages/design-system/ds-canonical/hooks', name), `#!/bin/bash\n${body}\n`)
  }
  const transcript = resolve(await realpath(data.target), 'transcript.jsonl')
  await writeFile(transcript, `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } })}\n`, { mode: 0o600 })
  return { data, group, names, transcript }
}

test('N34: one broken UserPromptSubmit hook degrades only itself; the rest of the group still delivers', async (t) => {
  const { data, group, names, transcript } = await userPromptGroupFixture(t, ([first, second, third]) => ({
    // 三種「只屬於這一支」的失敗:非 UTF-8 輸出、被 signal 砍掉;中間那支正常回 context
    [first]: "cat >/dev/null; printf '\\377'",
    [second]: `cat >/dev/null; printf '%s\\n' '{"governanceContext":{"hookEventName":"UserPromptSubmit","message":"SECOND-HOOK-RAN"}}'`,
    [third]: 'kill -9 $$',
  }))
  const payload = { hook_event_name: 'UserPromptSubmit', prompt: 'hi', transcript_path: transcript }
  const ordinary = directGroupRun(data, { event: 'UserPromptSubmit', group, payload })
  assert.equal(ordinary.status, 0, ordinary.stderr)
  const context = JSON.parse(ordinary.stdout).hookSpecificOutput.additionalContext
  assert.match(context, /SECOND-HOOK-RAN/, 'the healthy hook in the same group must still deliver')
  assert.match(context, /治理檢查降級/, 'degraded hooks must be visible to the model, not only on stderr')
  assert.ok(context.includes(names[0]) && context.includes(names[2]), 'both degraded hooks must be named')
  assert.match(ordinary.stderr, /hook degraded \(this hook only\)/)

  const strict = directGroupRun(data, { event: 'UserPromptSubmit', group, payload, env: { GOVERNANCE_HOOK_STRICT: '1' } })
  assert.equal(strict.status, 70, 'strict / CI lanes stay fail closed')
  assert.match(strict.stderr, /GOVERNANCE_INTEGRITY:/)
})

// 缺工具的 PATH:標準目錄裡每個可執行檔都連結進來,只去掉指定的工具(只放幾支會讓 hook 連 sed / tr 都找不到)。
async function toolBinWithout(t, excluded) {
  const bin = await mkdtemp(resolve(tmpdir(), `governance-bin-without-${excluded.join('-')}-`))
  t.after(() => rm(bin, { recursive: true, force: true }))
  const seen = new Set(excluded)
  for (const directory of ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']) {
    let names = []
    try { names = await readdir(directory) } catch { continue }
    for (const name of names) {
      if (seen.has(name)) continue
      seen.add(name)
      try {
        const info = await stat(resolve(directory, name))
        if (!info.isFile()) continue
        await symlink(resolve(directory, name), resolve(bin, name))
      } catch {}
    }
  }
  // env 依 PATH 找 node;測試用的 node 就是正在跑測試的這一支
  try { await stat(resolve(bin, 'node')) } catch { await symlink(process.execPath, resolve(bin, 'node')) }
  for (const name of excluded) {
    await assert.rejects(stat(resolve(bin, name)), `${name} must be absent from the test PATH`)
  }
  return bin
}

test('G4: a hook that invokes a missing jq is degraded alone and named; the rest of its group still runs', async (t) => {
  const { data, group, names, transcript } = await userPromptGroupFixture(t, ([first, second, third]) => ({
    // 不需要 jq 的 hook:缺 jq 時照常跑、照常回 context
    [first]: `cat >/dev/null; printf '%s\\n' '{"governanceContext":{"hookEventName":"UserPromptSubmit","message":"FIRST-RAN-WITHOUT-JQ"}}'`,
    // 照真實 hook 的寫法:jq 讀不到就當沒事 exit 0 —— 缺 jq 時這正是「靜默放行」
    [second]: `INPUT=$(cat); PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // ""' 2>/dev/null); [ -z "$PROMPT" ] && exit 0; printf '%s\\n' '{"governanceContext":{"hookEventName":"UserPromptSubmit","message":"SAW-PROMPT"}}'`,
    [third]: 'cat >/dev/null; exit 0',
  }))
  const payload = { hook_event_name: 'UserPromptSubmit', prompt: 'hi', transcript_path: transcript }
  const healthy = directGroupRun(data, { event: 'UserPromptSubmit', group, payload })
  assert.equal(healthy.status, 0, healthy.stderr)
  const healthyContext = JSON.parse(healthy.stdout).hookSpecificOutput.additionalContext
  assert.match(healthyContext, /SAW-PROMPT/, 'control: with jq the hook really runs')
  assert.doesNotMatch(healthyContext, /治理檢查降級/, 'control: nothing is degraded when every tool exists')

  const bin = await toolBinWithout(t, ['jq'])
  const missing = directGroupRun(data, { event: 'UserPromptSubmit', group, payload, hookPath: bin })
  assert.equal(missing.status, 0, missing.stderr)
  const context = JSON.parse(missing.stdout).hookSpecificOutput.additionalContext
  assert.match(context, /FIRST-RAN-WITHOUT-JQ/, 'a hook that does not use jq must keep running (no whole-batch skip)')
  assert.doesNotMatch(context, /SAW-PROMPT/, 'the jq hook cannot have run its check')
  assert.match(context, /治理檢查降級/)
  assert.ok(context.includes(names[1]), 'the hook that hit the missing jq must be named to the model')
  assert.ok(!context.includes(`HOOK_TOOL_MISSING:jq:${names[0]}`), 'the hook that never called jq is not blamed')
  assert.match(context, /HOOK_TOOL_MISSING:jq/)
  assert.match(context, /brew install jq/, 'the install hint names the missing tool')

  // Strict / CI lane:密封工具組把同一份 CLOSED_HOOK_TOOL_LABELS 釘在絕對路徑,呼叫端 PATH 少了 jq
  // 也不會讓 hook 在沒有 jq 的情況下跑(主機真的沒有 jq → HOOK_TOOL_PROFILE_UNAVAILABLE,exit 70)。
  const strict = directGroupRun(data, { event: 'UserPromptSubmit', group, payload, hookPath: bin, env: { GOVERNANCE_HOOK_STRICT: '1' } })
  assert.equal(strict.status, 0, strict.stderr)
  assert.match(JSON.parse(strict.stdout).hookSpecificOutput.additionalContext, /SAW-PROMPT/, 'the sealed lane hands hooks the pinned jq')
})

// 核准閘(PreToolUse、outputMode blocking)經正式入口、一般模式:
// - 缺 jq:閘跑不起來 → 這次寫入擋下(fail closed),訊息講明缺什麼、怎麼裝;
// - 缺 perl 與 python3(閘用不到):照常判 —— 工程改動放行、UI 改動照擋(改前:缺任一工具就整批跳過,UI 改動也放行)。
async function approvalGateFixture(t) {
  const data = await fixture(t)
  const group = registrations.hooks.PreToolUse.findIndex((item) =>
    item.hooks.some((descriptor) => descriptor.hook === 'check_substantive_edit_approval_preflight.sh'))
  assert.ok(group >= 0)
  const target = await realpath(data.target)
  const transcript = resolve(target, 'approval-transcript.jsonl')
  await writeFile(transcript, `${JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: '所有 engineering bug、refactor、test、governance、infra remediation 都授權直接完成' }] },
  })}\n`, { mode: 0o600 })
  const edit = (newString) => ({
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: resolve(target, 'apps/demo/src/Bad.tsx'), old_string: 'const unsafe: any = 1', new_string: newString },
    transcript_path: transcript,
    session_id: 'g4-approval',
  })
  return {
    data,
    group,
    engineering: edit('const unsafe: unknown = 1'),
    ui: edit('const unsafe = <div className="bg-red-500 p-4" />'),
  }
}

test('G4: the approval gate fails closed when jq is missing and keeps judging when only perl / python3 are missing', async (t) => {
  const { data, group, engineering, ui } = await approvalGateFixture(t)
  const run = (payload, hookPath = null) => directGroupRun(data, { event: 'PreToolUse', group, payload, hookPath })

  const control = run(engineering)
  assert.equal(control.status, 0, `control: engineering edit with standing authorization passes\n${control.stderr}`)
  const controlUi = run(ui)
  assert.equal(controlUi.status, 2, controlUi.stderr)
  assert.match(controlUi.stderr, /BLOCKER: Pre-action gate/)

  const noJq = await toolBinWithout(t, ['jq'])
  const blocked = run(engineering, noJq)
  assert.equal(blocked.status, 2, `a missing jq must not switch the approval gate off\n${blocked.stderr}`)
  assert.match(blocked.stderr, /治理閘缺工具/)
  assert.match(blocked.stderr, /HOOK_TOOL_MISSING:jq:check_substantive_edit_approval_preflight\.sh/)
  assert.match(blocked.stderr, /brew install jq/)

  const noPerlPython = await toolBinWithout(t, ['perl', 'python3'])
  const stillApproved = run(engineering, noPerlPython)
  assert.equal(stillApproved.status, 0, `the gate does not use perl / python3, so it still judges\n${stillApproved.stderr}`)
  const stillBlocked = run(ui, noPerlPython)
  assert.equal(stillBlocked.status, 2, stillBlocked.stderr)
  assert.match(stillBlocked.stderr, /BLOCKER: Pre-action gate/, 'blocked by the gate itself, not by a missing-tool skip')
  assert.doesNotMatch(stillBlocked.stderr, /治理閘缺工具/)
})

test('N34: a hook that reports the reserved integrity marker is degraded alone in the ordinary lane', async (t) => {
  const { data, group, names, transcript } = await userPromptGroupFixture(t, ([first, second, third]) => ({
    // 共用 helper governance_hook_integrity_fail 的實際行為:標記 + exit 70
    [first]: "cat >/dev/null; printf 'GOVERNANCE_INTEGRITY: helper failed for this hook only\\n' >&2; exit 70",
    [second]: `cat >/dev/null; printf '%s\\n' '{"governanceContext":{"hookEventName":"UserPromptSubmit","message":"SECOND-HOOK-RAN"}}'`,
    [third]: 'cat >/dev/null; exit 0',
  }))
  const payload = { hook_event_name: 'UserPromptSubmit', prompt: 'hi', transcript_path: transcript }
  const ordinary = directGroupRun(data, { event: 'UserPromptSubmit', group, payload })
  assert.equal(ordinary.status, 0, ordinary.stderr)
  assert.ok(ordinary.stdout.trim(), `the group must still deliver context:\n${ordinary.stderr}`)
  const context = JSON.parse(ordinary.stdout).hookSpecificOutput.additionalContext
  assert.match(context, /SECOND-HOOK-RAN/, 'the healthy hook in the same group must still deliver')
  assert.match(context, /治理檢查降級/)
  assert.ok(context.includes(names[0]), 'the hook that hit its integrity failure must be named to the model')
  assert.doesNotMatch(ordinary.stderr, /hooks skipped \(fail-open\)/, 'no whole-group skip')

  const strict = directGroupRun(data, { event: 'UserPromptSubmit', group, payload, env: { GOVERNANCE_HOOK_STRICT: '1' } })
  assert.equal(strict.status, 70, 'strict / CI lanes stay fail closed')
  assert.match(strict.stderr, /GOVERNANCE_INTEGRITY:/)
})

test('N34: an ordinary-lane whole-batch failure is announced to the model, not only on stderr', async (t) => {
  const { data, group, transcript } = await userPromptGroupFixture(t, ([first, second, third]) => ({
    [first]: 'cat >/dev/null; exit 0',
    [second]: 'cat >/dev/null; exit 0',
    [third]: 'cat >/dev/null; exit 0',
  }))
  // 會讓入口整批停下的輸入(prompt 不是字串)—— 一般模式依設計放行,但必須讓模型知道這批沒跑
  const payload = { hook_event_name: 'UserPromptSubmit', prompt: { not: 'a string' }, transcript_path: transcript }
  const ordinary = directGroupRun(data, { event: 'UserPromptSubmit', group, payload })
  assert.equal(ordinary.status, 0, ordinary.stderr)
  assert.match(ordinary.stderr, /hooks skipped \(fail-open\)/)
  assert.ok(ordinary.stdout.trim(), `the skipped batch must reach the model:\n${ordinary.stderr}`)
  assert.match(JSON.parse(ordinary.stdout).hookSpecificOutput.additionalContext, /治理檢查這次整批沒有執行/)
})

// N47 ① 複核:Bash 的工作目錄要經正式入口轉交給 hook。改前入口把 cwd 丟掉,hook 退回專案根目錄解析,
// 在 apps/demo 底下下 `sed -i … src/Bad.tsx` 經入口放行(直接呼叫 hook 才擋 —— 繞過入口的測試是假綠)。
test('N47 ①: the Bash working directory reaches the approval gate through the provider entry point', async (t) => {
  const { data, group } = await approvalGateFixture(t)
  const target = await realpath(data.target)
  const transcript = resolve(target, 'neutral-transcript.jsonl')
  await writeFile(transcript, `${JSON.stringify({ type: 'user', message: { role: 'user', content: '繼續' } })}\n`, { mode: 0o600 })
  const bash = (command, cwd) => ({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
    cwd,
    transcript_path: transcript,
    session_id: 'n47-cwd',
  })
  for (const strict of ['0', '1']) {
    const relative = directGroupRun(data, {
      event: 'PreToolUse', group, payload: bash("sed -i '' 's/any/unknown/' src/Bad.tsx", resolve(target, 'apps/demo')), env: { GOVERNANCE_HOOK_STRICT: strict },
    })
    assert.equal(relative.status, 2, `strict=${strict}: a bare relative write under the governed cwd must be blocked\n${relative.stderr}`)
    assert.match(relative.stderr, /BLOCKER: Pre-action gate/)
    const readOnly = directGroupRun(data, {
      event: 'PreToolUse', group, payload: bash('grep -n unsafe src/Bad.tsx', resolve(target, 'apps/demo')), env: { GOVERNANCE_HOOK_STRICT: strict },
    })
    assert.equal(readOnly.status, 0, `strict=${strict}: control — a read in the same cwd passes\n${readOnly.stderr}`)
  }
})

// ── G4 複核二(2026-10-07):缺工具時只擋「這道閘本來要判的寫入」,不得把 AI 鎖死 ──
// 上一版把「這支閘跑不起來」直接換成「這次工具呼叫一律擋」:缺 jq 時 ls、git status、連 `brew install jq`
// 都被擋,AI 沒辦法自己把工具裝回來(M36(b) 自鎖)。現在的判準(scripts/lib/provider-hook-output-transport.mjs
// classifyBlindHookCall):唯讀指令與「只安裝缺的那幾個工具」的指令永遠放行(降級並告知模型);其餘只有落在
// 那道閘自己的管轄範圍內才擋。
function bashPayload(command, { cwd = null, transcript, session = 'g4-scope' }) {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
    ...(cwd ? { cwd } : {}),
    transcript_path: transcript,
    session_id: session,
  }
}

function contextOf(result) {
  if (!result.stdout.trim()) return ''
  return JSON.parse(result.stdout).hookSpecificOutput?.additionalContext || ''
}

test('G4 複核二: with jq missing the approval gate still blocks governed writes, but reads and installing jq pass; restoring jq is normal', async (t) => {
  const { data, group, engineering, ui } = await approvalGateFixture(t)
  const target = await realpath(data.target)
  const transcript = engineering.transcript_path
  const run = (payload, hookPath = null) => directGroupRun(data, { event: 'PreToolUse', group, payload, hookPath })
  const noJq = await toolBinWithout(t, ['jq'])

  for (const [label, payload] of [['UI edit', ui], ['engineering edit', engineering]]) {
    const blocked = run(payload, noJq)
    assert.equal(blocked.status, 2, `${label}: a governed write must stay blocked while the gate is blind\n${blocked.stderr}`)
    assert.match(blocked.stderr, /治理閘缺工具/)
    assert.match(blocked.stderr, /缺的工具:jq/)
    assert.match(blocked.stderr, /brew install jq/)
    assert.match(blocked.stderr, /唯讀指令.*照常放行/, 'the block message must say how to get unstuck')
  }
  const shellWrite = run(bashPayload("sed -i '' 's/any/unknown/' src/Bad.tsx", { cwd: resolve(target, 'apps/demo'), transcript }), noJq)
  assert.equal(shellWrite.status, 2, `a shell write to a governed file stays blocked\n${shellWrite.stderr}`)
  const smuggled = run(bashPayload("brew install jq && sed -i '' 's/any/unknown/' src/Bad.tsx", { cwd: resolve(target, 'apps/demo'), transcript }), noJq)
  assert.equal(smuggled.status, 2, `an install command cannot carry a governed write through the restore lane\n${smuggled.stderr}`)

  for (const command of ['ls -la', 'git status', 'grep -n unsafe apps/demo/src/Bad.tsx', 'cat apps/demo/src/Bad.tsx | head -5', 'brew install jq', 'sudo apt-get install -y jq']) {
    const passed = run(bashPayload(command, { cwd: target, transcript }), noJq)
    assert.equal(passed.status, 0, `${command}: reads and installing the missing tool must never be blocked\n${passed.stderr}`)
    assert.match(contextOf(passed), /治理檢查降級/, `${command}: the model is still told the gate did not run`)
    assert.match(contextOf(passed), /brew install jq/, `${command}: the notice says how to restore the tool`)
  }
  const readme = run({ ...engineering, tool_input: { file_path: resolve(target, 'CLAUDE.md'), old_string: '# consumer', new_string: '# consumer app' } }, noJq)
  assert.equal(readme.status, 0, `a write the approval gate never judges is not blocked by it\n${readme.stderr}`)
  assert.match(contextOf(readme), /治理檢查降級/)

  // 裝回 jq(用完整 PATH)→ 一切照常:UI 改動由閘本身擋、工程改動放行、沒有任何降級通知
  const restoredUi = run(ui)
  assert.equal(restoredUi.status, 2, restoredUi.stderr)
  assert.match(restoredUi.stderr, /BLOCKER: Pre-action gate/)
  assert.doesNotMatch(restoredUi.stderr, /治理閘缺工具/)
  const restoredEngineering = run(engineering)
  assert.equal(restoredEngineering.status, 0, restoredEngineering.stderr)
  assert.doesNotMatch(`${restoredEngineering.stdout}${restoredEngineering.stderr}`, /治理檢查降級|治理閘缺工具/)
  const restoredRead = run(bashPayload('ls -la', { cwd: target, transcript }))
  assert.equal(restoredRead.status, 0, restoredRead.stderr)
  assert.doesNotMatch(`${restoredRead.stdout}${restoredRead.stderr}`, /治理檢查降級|治理閘缺工具/)
})

test('G4 複核二: with python3 missing the solo-workflow gate blocks only branch / push commands', async (t) => {
  const data = await fixture(t)
  const group = registrations.hooks.PreToolUse.findIndex((item) =>
    item.hooks.some((descriptor) => descriptor.hook === 'check_solo_workflow.sh'))
  assert.ok(group >= 0)
  const target = await realpath(data.target)
  const transcript = resolve(target, 'solo-transcript.jsonl')
  await writeFile(transcript, `${JSON.stringify({ type: 'user', message: { role: 'user', content: '繼續' } })}\n`, { mode: 0o600 })
  const run = (command, hookPath = null) => directGroupRun(data, {
    event: 'PreToolUse', group, payload: bashPayload(command, { cwd: target, transcript, session: 'g4-solo' }), hookPath,
  })
  const control = run('git push origin main')
  assert.equal(control.status, 2, control.stderr)
  assert.match(control.stderr, /R2 BLOCKER/, 'control: with python3 the gate itself blocks a direct push')

  const noPython = await toolBinWithout(t, ['python3'])
  const push = run('git push origin main', noPython)
  assert.equal(push.status, 2, `the gate cannot judge a push without python3, so the push stays blocked\n${push.stderr}`)
  assert.match(push.stderr, /治理閘缺工具/)
  assert.match(push.stderr, /python3/)
  for (const command of ['ls -la', 'git status', 'brew install python3', 'npm test']) {
    const passed = run(command, noPython)
    assert.equal(passed.status, 0, `${command}: outside the gate's scope (or a read / the install) must pass\n${passed.stderr}`)
    assert.doesNotMatch(passed.stderr, /治理閘缺工具/)
  }
  assert.match(contextOf(run('git status', noPython)), /治理檢查降級/, 'a git read that did reach python3 is reported, not hidden')
})

test('G4 複核二: telemetry is a side channel — with telemetry on and python3 missing the approval gate still judges', async (t) => {
  const { data, group, engineering, ui } = await approvalGateFixture(t)
  const noPython = await toolBinWithout(t, ['python3'])
  const env = { GOVERNANCE_READ_ONLY: '0', GOVERNANCE_TELEMETRY_OPT_IN: '1' }
  const approved = directGroupRun(data, { event: 'PreToolUse', group, payload: engineering, hookPath: noPython, env })
  assert.equal(approved.status, 0, `a failed telemetry write must not make the gate look blind\n${approved.stderr}`)
  assert.doesNotMatch(`${approved.stdout}${approved.stderr}`, /治理閘缺工具|治理檢查降級/)
  const blocked = directGroupRun(data, { event: 'PreToolUse', group, payload: ui, hookPath: noPython, env })
  assert.equal(blocked.status, 2, blocked.stderr)
  assert.match(blocked.stderr, /BLOCKER: Pre-action gate/, 'blocked by the gate itself')
  assert.doesNotMatch(blocked.stderr, /治理閘缺工具/)
})

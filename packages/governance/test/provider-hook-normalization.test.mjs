import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { evaluateHook } from '../src/hook-api.mjs'
import { normalizeProviderHookInput } from '../src/provider-hook-normalization.mjs'
import { cleanup, makeRepository } from './helpers.mjs'

const authorityRoot = resolve(import.meta.dirname, '../../..')
const registry = JSON.parse(await readFile(resolve(authorityRoot, 'packages/governance/canonical/providers.json'), 'utf8'))
const providers = Object.fromEntries(registry.providers.map((provider) => [provider.id, provider]))
providers.novel = {
  id: 'novel',
  normalization: {
    eventFields: ['lifecycle'],
    toolFields: ['action'],
    pathFields: ['target'],
    pathArrayFields: ['targets'],
    writeTools: ['patch'],
    eventAliases: { afterwrite: 'PostToolUse' },
    toolAliases: { patch: 'MultiEdit' },
  },
}

function semantic(normalized) {
  const { provider, ...value } = normalized
  return value
}

function payload(provider, path, { absolute = false, patch = false } = {}) {
  if (provider === 'claude') {
    return { hook_event_name: 'after_write', tool_name: 'patch', tool_input: { file_path: path } }
  }
  if (provider === 'codex') {
    if (patch) return {
      event: 'after_write',
      tool: 'patch',
      patch: `*** Begin Patch\n*** Update File: ${path}\n+changed\n*** End Patch`,
    }
    return { event: 'after_write', tool: 'patch', changes: [{ path }] }
  }
  if (provider === 'generic') return { event: 'after_write', operation: 'apply_patch', paths: [{ path }] }
  return { lifecycle: 'after_write', action: 'patch', targets: [{ path }] }
}

test('aliases are applied before operation inference across relative, absolute, array, patch, and novel transports', async (t) => {
  const repoRoot = await mkdtemp(resolve(tmpdir(), 'provider-hook-normalization-'))
  t.after(() => rm(repoRoot, { recursive: true, force: true }))
  const relativePath = 'governance/generated/control-plane.json'
  const inputs = {
    claude: payload('claude', resolve(repoRoot, relativePath), { absolute: true }),
    codex: payload('codex', relativePath, { patch: true }),
    generic: payload('generic', relativePath),
    novel: payload('novel', relativePath),
  }
  const values = Object.entries(inputs).map(([id, input]) =>
    semantic(normalizeProviderHookInput({ provider: providers[id], input, repoRoot }).normalized))

  assert.deepEqual(values, Array(4).fill({
    event: 'PostToolUse',
    tool: 'MultiEdit',
    operation: 'write',
    paths: [relativePath],
    blocked: false,
    evidence: [],
  }))

  const postWritePatch = normalizeProviderHookInput({
    provider: providers.codex,
    repoRoot,
    input: { event: 'post_write', tool: 'patch', changes: [{ path: relativePath }] },
  }).normalized
  assert.equal(postWritePatch.event, 'PostToolUse')
  assert.equal(postWritePatch.tool, 'MultiEdit')
  assert.equal(postWritePatch.operation, 'write')
})

test('one shared body stays single-copy across many changed paths', async (t) => {
  const repoRoot = await mkdtemp(resolve(tmpdir(), 'provider-hook-shared-content-'))
  t.after(() => rm(repoRoot, { recursive: true, force: true }))
  const sharedContent = 'x'.repeat(128 * 1024)
  const paths = Array.from({ length: 10 }, (_, index) => `src/Shared-${index}.tsx`)
  const input = {
    event: 'after_write',
    tool: 'MultiEdit',
    tool_input: { changed_paths: paths, new_string: sharedContent },
  }
  const normalized = normalizeProviderHookInput({
    provider: providers.codex,
    input,
    repoRoot,
  })

  assert.equal(normalized.sharedContent, sharedContent)
  assert.deepEqual(normalized.records.map((record) => record.path), paths)
  assert.equal(normalized.records.every((record) => record.content === ''), true)
  assert.equal(normalized.records.every((record) => Object.keys(record.source).length === 0), true)
  assert.ok(
    Buffer.byteLength(JSON.stringify(normalized), 'utf8') < Buffer.byteLength(sharedContent, 'utf8') + 32 * 1024,
    'normalized transport must remain O(input + path descriptors), not O(path count × shared body)',
  )
})

test('declared PostToolUse write transports yield path-local records without materializing files', async (t) => {
  const repoRoot = await mkdtemp(resolve(tmpdir(), 'provider-hook-post-write-transport-'))
  t.after(() => rm(repoRoot, { recursive: true, force: true }))
  const input = {
    event: 'PostToolUse',
    tool_name: 'apply_patch',
    tool_input: {
      command: [
        '*** Begin Patch',
        '*** Add File: src/First.tsx',
        '+export const First = true',
        '*** Add File: src/Second.tsx',
        '+export const Second = true',
        '*** End Patch',
      ].join('\n'),
    },
  }
  const normalized = normalizeProviderHookInput({
    provider: providers.codex,
    input,
    repoRoot,
  })

  assert.equal(normalized.mutation.engine, 'codex-apply-patch-v1')
  assert.deepEqual(normalized.records.map(({ path, content }) => ({ path, content })), [{
    path: 'src/First.tsx',
    content: 'export const First = true\n',
  }, {
    path: 'src/Second.tsx',
    content: 'export const Second = true\n',
  }])
  await assert.rejects(readFile(resolve(repoRoot, 'src/First.tsx')), /ENOENT/)
  await assert.rejects(readFile(resolve(repoRoot, 'src/Second.tsx')), /ENOENT/)
})

test('package hook API emits identical canonical protected-write evidence for every registered provider', async (t) => {
  const repoRoot = await makeRepository()
  t.after(() => cleanup(repoRoot))
  const path = 'governance/generated/control-plane.json'
  const outcomes = []
  for (const provider of ['claude', 'codex', 'generic']) {
    const evaluated = await evaluateHook({ provider, repoRoot, input: payload(provider, path, { patch: provider === 'codex' }) })
    assert.equal(evaluated.exitCode, 2)
    outcomes.push({
      normalized: semantic(evaluated.normalized),
      evidence: evaluated.result.diagnostics.find((item) => item.evidence.kind === 'generated-artifact-write')?.evidence,
    })
  }
  assert.deepEqual(outcomes, Array(3).fill({
    normalized: {
      event: 'PostToolUse',
      tool: 'MultiEdit',
      operation: 'write',
      paths: [path],
      blocked: true,
      evidence: [{
        kind: 'generated-artifact-write',
        path,
        expected: 'edit canonical source then regenerate',
        actual: 'MultiEdit',
      }],
    },
    evidence: {
      kind: 'generated-artifact-write',
      path,
      expected: 'edit canonical source then regenerate',
      actual: 'MultiEdit',
    },
  }))
})

test('outside, NUL, and symlink paths block with provider-neutral evidence, including a novel provider', async (t) => {
  const repoRoot = await mkdtemp(resolve(tmpdir(), 'provider-hook-adversarial-'))
  const outsideRoot = await mkdtemp(resolve(tmpdir(), 'provider-hook-outside-'))
  t.after(() => Promise.all([
    rm(repoRoot, { recursive: true, force: true }),
    rm(outsideRoot, { recursive: true, force: true }),
  ]))
  await symlink(outsideRoot, resolve(repoRoot, 'linked'))

  for (const [path, reasonCode, evidencePath] of [
    ['../outside.ts', 'OUTSIDE_REPOSITORY', '../outside.ts'],
    ['bad\0path.ts', 'NUL_BYTE', 'bad\\0path.ts'],
    ['linked/file.ts', 'SYMLINK_COMPONENT', 'linked'],
  ]) {
    const values = ['claude', 'codex', 'generic', 'novel'].map((id) =>
      semantic(normalizeProviderHookInput({ provider: providers[id], input: payload(id, path), repoRoot }).normalized))
    assert.deepEqual(values, Array(4).fill({
      event: 'PostToolUse',
      tool: 'MultiEdit',
      operation: 'write',
      paths: [],
      blocked: true,
      evidence: [{
        kind: 'hook-path-invalid',
        path: evidencePath,
        expected: 'repository-contained path without symbolic-link components',
        actual: reasonCode,
      }],
    }))
  }
})

test('package API blocks rather than silently discarding an invalid supplied path', async (t) => {
  const repoRoot = await makeRepository()
  t.after(() => cleanup(repoRoot))
  const evidence = []
  for (const provider of ['claude', 'codex', 'generic']) {
    const evaluated = await evaluateHook({ provider, repoRoot, input: payload(provider, '../outside.ts') })
    assert.equal(evaluated.exitCode, 2)
    assert.equal(evaluated.normalized.blocked, true)
    assert.deepEqual(evaluated.normalized.paths, [])
    evidence.push(evaluated.result.diagnostics.find((item) => item.evidence.kind === 'hook-path-invalid')?.evidence)
  }
  assert.deepEqual(evidence, Array(3).fill({
    kind: 'hook-path-invalid',
    path: '../outside.ts',
    expected: 'repository-contained path without symbolic-link components',
    actual: 'OUTSIDE_REPOSITORY',
  }))
})

test('one valid path cannot conceal an invalid array entry or a later escaping patch header', async (t) => {
  const repoRoot = await mkdtemp(resolve(tmpdir(), 'provider-hook-mixed-'))
  t.after(() => rm(repoRoot, { recursive: true, force: true }))

  const malformed = normalizeProviderHookInput({
    provider: providers.generic,
    repoRoot,
    input: { event: 'after_write', operation: 'apply_patch', paths: ['src/valid.ts', { path: 42 }] },
  })
  assert.equal(malformed.normalized.blocked, true)
  assert.deepEqual(malformed.normalized.paths, ['src/valid.ts'])
  assert.equal(malformed.issues.some((item) => item.reasonCode === 'INVALID_PATH_TYPE'), true)

  const masked = normalizeProviderHookInput({
    provider: providers.claude,
    repoRoot,
    input: {
      hook_event_name: 'after_write',
      tool_name: 'patch',
      tool_input: { file_path: '../../outside.ts', changed_paths: ['src/valid.ts'] },
    },
  })
  assert.equal(masked.normalized.blocked, true)
  assert.deepEqual(masked.normalized.paths, ['src/valid.ts'])
  assert.equal(masked.issues.some((item) => item.reasonCode === 'OUTSIDE_REPOSITORY'), true)

  const mixedPatch = normalizeProviderHookInput({
    provider: providers.codex,
    repoRoot,
    input: {
      event: 'after_write',
      tool: 'patch',
      patch: '*** Begin Patch\n*** Update File: src/valid.ts\n+ok\n*** Update File: ../../outside.ts\n+bad\n*** End Patch',
    },
  })
  assert.equal(mixedPatch.normalized.blocked, true)
  assert.deepEqual(mixedPatch.normalized.paths, ['src/valid.ts'])
  assert.equal(mixedPatch.issues.some((item) => item.reasonCode === 'OUTSIDE_REPOSITORY'), true)

  for (const patch of [
    '*** Begin Patch\n*** Update File: \n*** End Patch',
    '--- "a/../../outside.ts"\n+++ "b/../../outside.ts"\n+bad',
  ]) {
    const invalidPatch = normalizeProviderHookInput({
      provider: providers.codex,
      repoRoot,
      input: { event: 'after_write', tool: 'patch', patch },
    })
    assert.equal(invalidPatch.normalized.blocked, true)
  }
})

test('repository runner uses the same fail-closed path verdict for Claude and Codex', async (t) => {
  const project = await mkdtemp(resolve(tmpdir(), 'provider-hook-runner-target-'))
  const outside = await mkdtemp(resolve(tmpdir(), 'provider-hook-runner-outside-'))
  t.after(() => Promise.all([
    rm(project, { recursive: true, force: true }),
    rm(outside, { recursive: true, force: true }),
  ]))
  assert.equal(spawnSync('git', ['-C', project, 'init', '-q']).status, 0)
  await symlink(outside, resolve(project, 'linked'))
  const runner = resolve(authorityRoot, 'scripts/run-provider-hook.mjs')
  const run = (provider, path) => spawnSync(process.execPath, ['--', runner, '--provider', provider, '--hook', 'governance_control_plane.sh'], {
    cwd: project,
    env: { ...process.env, GOVERNANCE_PROJECT_DIR: project, GOVERNANCE_READ_ONLY: '1' },
    input: `${JSON.stringify(payload(provider, path))}\n`,
    encoding: 'utf8',
  })

  for (const provider of ['claude', 'codex']) {
    for (const [path, message] of [
      ['../outside.ts', /changed path escapes repository root/],
      [resolve(project, '../outside-absolute.ts'), /changed path escapes repository root/],
      ['bad\0path.ts', /changed path contains NUL/],
      ['linked/file.ts', /changed path crosses a symbolic link:linked/],
      [42, /changed path must be a string/],
    ]) {
      const result = run(provider, path)
      assert.equal(result.status, 70, `${provider}:${path}:${result.stderr}`)
      assert.match(result.stderr, /GOVERNANCE_INTEGRITY:/)
      assert.match(result.stderr, message)
    }
  }
})

test('normalization rejects path, edit, and operation amplification inside bounded parse loops', async (t) => {
  const repoRoot = await makeRepository()
  t.after(() => cleanup(repoRoot))
  let checkpoints = 0
  const checkpoint = () => { checkpoints += 1 }

  const excessivePaths = normalizeProviderHookInput({
    provider: providers.novel,
    repoRoot,
    checkpoint,
    input: {
      lifecycle: 'afterwrite',
      action: 'patch',
      targets: Array.from({ length: 1025 }, (_, index) => ({ path: `src/path-${index}.tsx` })),
    },
  })
  assert.equal(excessivePaths.records.length, 0)
  assert.deepEqual(excessivePaths.issues.map((value) => value.reasonCode), ['PATH_COUNT_EXCEEDED'])

  const excessiveEdits = normalizeProviderHookInput({
    provider: providers.claude,
    repoRoot,
    checkpoint,
    input: {
      hook_event_name: 'PreToolUse',
      tool_name: 'MultiEdit',
      tool_input: {
        edits: Array.from({ length: 1025 }, (_, index) => ({
          file_path: `src/edit-${index}.tsx`,
          old_string: 'before',
          new_string: 'after',
        })),
      },
    },
  })
  assert.equal(excessiveEdits.records.length, 0)
  assert.deepEqual(excessiveEdits.issues.map((value) => value.reasonCode), ['MUTATION_EDIT_COUNT_EXCEEDED'])

  const excessivePostEdits = normalizeProviderHookInput({
    provider: providers.claude,
    repoRoot,
    checkpoint,
    input: {
      hook_event_name: 'PostToolUse',
      tool_name: 'MultiEdit',
      tool_input: {
        edits: Array.from({ length: 1025 }, (_, index) => ({
          file_path: `src/post-edit-${index}.tsx`,
          old_string: 'before',
          new_string: 'after',
        })),
      },
    },
  })
  assert.equal(excessivePostEdits.records.length, 0)
  assert.deepEqual(
    excessivePostEdits.issues.map((value) => value.reasonCode),
    ['MUTATION_EDIT_COUNT_EXCEEDED'],
  )

  const oversizedSinglePath = normalizeProviderHookInput({
    provider: providers.novel,
    repoRoot,
    checkpoint,
    input: {
      lifecycle: 'afterwrite',
      action: 'patch',
      target: 'x'.repeat(4097),
    },
  })
  assert.deepEqual(oversizedSinglePath.issues.map((value) => value.reasonCode), ['PATH_TOO_LONG'])

  const excessiveSegments = normalizeProviderHookInput({
    provider: providers.novel,
    repoRoot,
    checkpoint,
    input: {
      lifecycle: 'afterwrite',
      action: 'patch',
      target: Array.from({ length: 257 }, () => 'x').join('/'),
    },
  })
  assert.deepEqual(
    excessiveSegments.issues.map((value) => value.reasonCode),
    ['PATH_SEGMENT_COUNT_EXCEEDED'],
  )

  const operations = Array.from({ length: 1025 }, (_, index) => [
    `*** Add File: src/operation-${index}.tsx`,
    '+export const value = true',
  ]).flat()
  const excessiveOperations = normalizeProviderHookInput({
    provider: providers.codex,
    repoRoot,
    checkpoint,
    input: {
      event: 'PreToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command: ['*** Begin Patch', ...operations, '*** End Patch'].join('\n'),
      },
    },
  })
  assert.equal(excessiveOperations.records.length, 0)
  assert.deepEqual(
    excessiveOperations.issues.map((value) => value.reasonCode),
    ['MUTATION_OPERATION_COUNT_EXCEEDED'],
  )
  assert.equal(checkpoints > 4, true, 'bounded loops must expose deadline checkpoints')
})

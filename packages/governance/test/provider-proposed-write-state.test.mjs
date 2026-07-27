import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { renameSync, symlinkSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  materializeProviderWriteState,
  materializeProviderWriteStates,
  normalizeProviderHookInput,
  parseProviderWriteMutation,
  ProviderWriteStateError,
} from '../src/provider-hook-normalization.mjs'

const authorityRoot = resolve(import.meta.dirname, '../../..')
const registry = JSON.parse(await readFile(
  resolve(authorityRoot, 'packages/governance/canonical/providers.json'),
  'utf8',
))
const providers = Object.fromEntries(registry.providers.map((provider) => [provider.id, provider]))

async function repository(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'provider-proposed-write-state-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(resolve(root, 'src'), { recursive: true })
  await mkdir(resolve(root, 'node_modules'), { recursive: true })
  await symlink(
    resolve(authorityRoot, 'node_modules/typescript'),
    resolve(root, 'node_modules/typescript'),
    'dir',
  )
  await writeFile(resolve(root, 'src/existing.txt'), 'alpha\nbeta\ngamma\n')
  return root
}

function state(root, provider, input, path) {
  const mutation = parseProviderWriteMutation({
    provider: providers[provider],
    input,
    repoRoot: root,
  })
  return {
    mutation,
    materialized: materializeProviderWriteState({ repoRoot: root, mutation, path }),
  }
}

test('Claude Write, Edit, and MultiEdit materialize exact in-memory after-images without writing', async (t) => {
  const root = await repository(t)

  const written = state(root, 'claude', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: 'src/new.txt', content: 'new\nfile\n' },
  }, 'src/new.txt')
  assert.equal(written.mutation.engine, 'full-file-v1')
  assert.deepEqual(written.materialized, {
    schemaVersion: 1,
    path: 'src/new.txt',
    kind: 'text',
    content: 'new\nfile\n',
  })
  await assert.rejects(readFile(resolve(root, 'src/new.txt')), /ENOENT/)

  const edited = state(root, 'claude', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: {
      file_path: 'src/existing.txt',
      old_string: 'beta',
      new_string: 'BETA',
    },
  }, 'src/existing.txt')
  assert.equal(edited.mutation.engine, 'exact-replace-v1')
  assert.equal(edited.materialized.content, 'alpha\nBETA\ngamma\n')

  const multi = state(root, 'claude', {
    hook_event_name: 'PreToolUse',
    tool_name: 'MultiEdit',
    tool_input: {
      file_path: 'src/existing.txt',
      edits: [
        { old_string: 'alpha', new_string: 'ALPHA' },
        { old_string: 'gamma', new_string: 'GAMMA' },
      ],
    },
  }, 'src/existing.txt')
  assert.equal(multi.mutation.engine, 'exact-replace-list-v1')
  const literalReplacement = state(root, 'claude', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: {
      file_path: 'src/existing.txt',
      old_string: 'alpha',
      new_string: '$&',
      replace_all: true,
    },
  }, 'src/existing.txt')
  assert.equal(literalReplacement.materialized.content, '$&\nbeta\ngamma\n')
  assert.equal(multi.materialized.content, 'ALPHA\nbeta\nGAMMA\n')
  assert.equal(await readFile(resolve(root, 'src/existing.txt'), 'utf8'), 'alpha\nbeta\ngamma\n')
})

test('Codex apply_patch command materializes update, add, delete, and move paths exactly', async (t) => {
  const root = await repository(t)
  await writeFile(resolve(root, 'src/delete.txt'), 'remove me\n')
  await writeFile(resolve(root, 'src/move.txt'), 'move me\n')
  const input = {
    event: 'PreToolUse',
    tool_name: 'apply_patch',
    tool_input: {
      command: [
        '*** Begin Patch',
        '*** Update File: src/existing.txt',
        '@@',
        ' alpha',
        '-beta',
        '+BETA',
        ' gamma',
        '*** Add File: src/added.txt',
        '+added',
        '+body',
        '*** Delete File: src/delete.txt',
        '*** Update File: src/move.txt',
        '*** Move to: src/moved.txt',
        '@@',
        ' move me',
        '*** End Patch',
      ].join('\n'),
    },
  }
  const mutation = parseProviderWriteMutation({ provider: providers.codex, input, repoRoot: root })
  assert.equal(mutation.transportId, 'codex-apply-patch-v1')
  assert.deepEqual(
    mutation.operations.map((operation) => [operation.kind, operation.path, operation.moveTo ?? null]),
    [
      ['update', 'src/existing.txt', null],
      ['add', 'src/added.txt', null],
      ['delete', 'src/delete.txt', null],
      ['update', 'src/move.txt', 'src/moved.txt'],
    ],
  )
  const batch = Object.fromEntries(materializeProviderWriteStates({
    repoRoot: root,
    mutation,
    paths: [
      'src/existing.txt',
      'src/added.txt',
      'src/delete.txt',
      'src/move.txt',
      'src/moved.txt',
      'src/existing.txt',
    ],
  }).map((entry) => [entry.path, entry]))
  assert.equal(Object.keys(batch).length, 5)
  assert.equal(batch['src/existing.txt'].content, 'alpha\nBETA\ngamma\n')
  assert.equal(batch['src/added.txt'].content, 'added\nbody\n')
  assert.equal(batch['src/delete.txt'].kind, 'deleted')
  assert.equal(batch['src/move.txt'].kind, 'deleted')
  assert.equal(batch['src/moved.txt'].content, 'move me\n')
  await assert.rejects(readFile(resolve(root, 'src/added.txt')), /ENOENT/)
  assert.equal(await readFile(resolve(root, 'src/delete.txt'), 'utf8'), 'remove me\n')
  const normalized = normalizeProviderHookInput({ provider: providers.codex, input, repoRoot: root })
  assert.equal(
    normalized.records.find((record) => record.path === 'src/existing.txt').content,
    'BETA',
    'legacy fragment-oriented hooks must receive Codex additions for the current path',
  )
  assert.equal(
    normalized.records.find((record) => record.path === 'src/added.txt').content,
    'added\nbody\n',
  )
})

test('generic unified diffs use exact line coordinates and support a new text file', async (t) => {
  const root = await repository(t)
  const input = {
    event: 'PreToolUse',
    tool: 'apply_patch',
    diff: [
      '--- a/src/existing.txt',
      '+++ b/src/existing.txt',
      '@@ -1,3 +1,3 @@',
      ' alpha',
      '-beta',
      '+BETA',
      ' gamma',
      '--- /dev/null',
      '+++ b/src/new.txt',
      '@@ -0,0 +1,2 @@',
      '+one',
      '+two',
    ].join('\n'),
  }
  const mutation = parseProviderWriteMutation({ provider: providers.generic, input, repoRoot: root })
  assert.equal(mutation.engine, 'unified-diff-v1')
  assert.equal(materializeProviderWriteState({ repoRoot: root, mutation, path: 'src/existing.txt' }).content, 'alpha\nBETA\ngamma\n')
  assert.equal(materializeProviderWriteState({ repoRoot: root, mutation, path: 'src/new.txt' }).content, 'one\ntwo\n')
})

test('unified no-newline markers preserve the exact old and new side independently', async (t) => {
  const root = await repository(t)
  await writeFile(resolve(root, 'src/no-newline.txt'), 'old')

  const addFinalNewline = parseProviderWriteMutation({
    provider: providers.generic,
    repoRoot: root,
    input: {
      event: 'PreToolUse',
      tool: 'apply_patch',
      diff: [
        '--- a/src/no-newline.txt',
        '+++ b/src/no-newline.txt',
        '@@ -1 +1 @@',
        '-old',
        '\\ No newline at end of file',
        '+new',
      ].join('\n'),
    },
  })
  assert.equal(
    materializeProviderWriteState({
      repoRoot: root,
      mutation: addFinalNewline,
      path: 'src/no-newline.txt',
    }).content,
    'new\n',
  )

  const newWithoutFinalNewline = parseProviderWriteMutation({
    provider: providers.generic,
    repoRoot: root,
    input: {
      event: 'PreToolUse',
      tool: 'apply_patch',
      diff: [
        '--- /dev/null',
        '+++ b/src/new-no-newline.txt',
        '@@ -0,0 +1 @@',
        '+new',
        '\\ No newline at end of file',
      ].join('\n'),
    },
  })
  assert.equal(
    materializeProviderWriteState({
      repoRoot: root,
      mutation: newWithoutFinalNewline,
      path: 'src/new-no-newline.txt',
    }).content,
    'new',
  )
})

test('Codex End of File anchors an addition-only update chunk', async (t) => {
  const root = await repository(t)
  const mutation = parseProviderWriteMutation({
    provider: providers.codex,
    repoRoot: root,
    input: {
      event: 'PreToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command: [
          '*** Begin Patch',
          '*** Update File: src/existing.txt',
          '@@',
          '+delta',
          '*** End of File',
          '*** End Patch',
        ].join('\n'),
      },
    },
  })
  assert.equal(
    materializeProviderWriteState({
      repoRoot: root,
      mutation,
      path: 'src/existing.txt',
    }).content,
    'alpha\nbeta\ngamma\ndelta\n',
  )
})

test('Codex additions append at EOF and accepted updates canonicalize one final LF', async (t) => {
  const root = await repository(t)
  await writeFile(resolve(root, 'src/no-final-lf.txt'), 'old')
  const bareAddition = parseProviderWriteMutation({
    provider: providers.codex,
    repoRoot: root,
    input: {
      event: 'PreToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command: [
          '*** Begin Patch',
          '*** Update File: src/no-final-lf.txt',
          '@@ ignored-label',
          '+appended',
          '*** End Patch',
        ].join('\n'),
      },
    },
  })
  assert.equal(
    materializeProviderWriteState({
      repoRoot: root,
      mutation: bareAddition,
      path: 'src/no-final-lf.txt',
    }).content,
    'old\nappended\n',
  )

  const contextOnly = parseProviderWriteMutation({
    provider: providers.codex,
    repoRoot: root,
    input: {
      event: 'PreToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command: [
          '*** Begin Patch',
          '*** Update File: src/no-final-lf.txt',
          '@@',
          ' old',
          '*** End Patch',
        ].join('\n'),
      },
    },
  })
  assert.equal(
    materializeProviderWriteState({
      repoRoot: root,
      mutation: contextOnly,
      path: 'src/no-final-lf.txt',
    }).content,
    'old\n',
  )
})

test('malformed, ambiguous, escaping, and symlinked proposed mutations fail closed', async (t) => {
  const root = await repository(t)
  await writeFile(resolve(root, 'src/ambiguous.txt'), 'same\nsame\n')
  const outside = await mkdtemp(resolve(tmpdir(), 'provider-proposed-write-outside-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  await symlink(outside, resolve(root, 'src/link'))

  const failures = [
    {
      provider: 'claude',
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: 'src/ambiguous.txt', old_string: 'same', new_string: 'changed' },
      },
      path: 'src/ambiguous.txt',
      code: 'EDIT_CONTEXT_AMBIGUOUS',
    },
    {
      provider: 'codex',
      input: {
        event: 'PreToolUse',
        tool_name: 'apply_patch',
        tool_input: { command: '*** Begin Patch\n*** Update File: ../../outside.txt\n@@\n-old\n+new\n*** End Patch' },
      },
      path: null,
      code: 'OUTSIDE_REPOSITORY',
    },
    {
      provider: 'claude',
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: 'src/link/file.txt', content: 'unsafe' },
      },
      path: null,
      code: 'SYMLINK_COMPONENT',
    },
    {
      provider: 'generic',
      input: {
        event: 'PreToolUse',
        tool: 'apply_patch',
        diff: 'diff --git a/src/existing.txt b/src/existing.txt\n--- a/src/existing.txt\n+++ b/src/existing.txt',
      },
      path: null,
      code: 'PATCH_INVALID',
    },
    {
      provider: 'codex',
      input: {
        event: 'PreToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          command: [
            '*** Begin Patch',
            '*** Update File: src/existing.txt',
            '*** Move to: src/moved-without-hunk.txt',
            '*** End Patch',
          ].join('\n'),
        },
      },
      path: null,
      code: 'PATCH_INVALID',
    },
  ]

  for (const failure of failures) {
    let mutation
    assert.throws(
      () => {
        mutation = parseProviderWriteMutation({
          provider: providers[failure.provider],
          input: failure.input,
          repoRoot: root,
        })
        if (failure.path) materializeProviderWriteState({ repoRoot: root, mutation, path: failure.path })
      },
      (error) => error instanceof ProviderWriteStateError && error.code === failure.code,
    )
    const normalized = normalizeProviderHookInput({
      provider: providers[failure.provider],
      input: failure.input,
      repoRoot: root,
    })
    if (!failure.path) {
      assert.equal(normalized.normalized.blocked, true)
      const expectedKind = ['OUTSIDE_REPOSITORY', 'SYMLINK_COMPONENT'].includes(failure.code)
        ? 'hook-path-invalid'
        : 'hook-write-mutation-invalid'
      assert.equal(normalized.normalized.evidence[0].kind, expectedKind)
    }
  }
})

test('source materialization detects a parent-directory symlink swap between inspection and open', async (t) => {
  const root = await repository(t)
  await mkdir(resolve(root, 'src/race-parent'), { recursive: true })
  await writeFile(resolve(root, 'src/race-parent/file.txt'), 'inside')
  const outside = await mkdtemp(resolve(tmpdir(), 'provider-source-race-outside-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  await writeFile(resolve(outside, 'file.txt'), 'outside')

  const mutation = parseProviderWriteMutation({
    provider: providers.claude,
    repoRoot: root,
    input: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: 'src/race-parent/file.txt',
        old_string: 'inside',
        new_string: 'changed',
      },
    },
  })
  let swapped = false
  assert.throws(
    () => materializeProviderWriteState({
      repoRoot: root,
      mutation,
      path: 'src/race-parent/file.txt',
      sourceOpenBarrier: ({ phase }) => {
        if (phase !== 'after-source-chain-snapshot' || swapped) return
        swapped = true
        renameSync(
          resolve(root, 'src/race-parent'),
          resolve(root, 'src/race-parent-original'),
        )
        symlinkSync(outside, resolve(root, 'src/race-parent'), 'dir')
      },
    }),
    (error) => error instanceof ProviderWriteStateError && error.code === 'SOURCE_RACED',
  )
  assert.equal(await readFile(resolve(outside, 'file.txt'), 'utf8'), 'outside')
  assert.equal(
    await readFile(resolve(root, 'src/race-parent-original/file.txt'), 'utf8'),
    'inside',
  )
})

test('the repository runner enforces the first breaking Claude edit and true Codex apply_patch after-image', async (t) => {
  const root = await repository(t)
  const runner = resolve(authorityRoot, 'scripts/run-provider-hook.mjs')
  await writeFile(
    resolve(root, 'src/existing.tsx'),
    'export const Existing = () => <AppShell layout="primary-sidebar" />\n',
  )
  assert.equal(spawnSync('git', ['-C', root, 'init', '-q']).status, 0)

  const run = (provider, input) => spawnSync(process.execPath, [
    '--',
    runner,
    '--provider',
    provider,
    '--hook',
    'chrome_header_dispatcher.sh',
  ], {
    cwd: root,
    env: {
      ...process.env,
      GOVERNANCE_PROJECT_DIR: root,
      GOVERNANCE_READ_ONLY: '1',
      GOVERNANCE_WRITE_STATE_TRUST: 'attacker-spoof',
    },
    input: `${JSON.stringify(input)}\n`,
    encoding: 'utf8',
  })

  const breakingClaudeEdit = run('claude', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: {
      file_path: 'src/existing.tsx',
      old_string: 'layout="primary-sidebar"',
      new_string: 'layout="primary-header"',
      governance_write_state: {
        schemaVersion: 1,
        path: 'src/existing.tsx',
        kind: 'text',
        content: 'attacker supplied benign state',
      },
    },
  })
  assert.equal(breakingClaudeEdit.status, 2, breakingClaudeEdit.stderr)
  assert.equal(breakingClaudeEdit.stdout, '')
  assert.match(breakingClaudeEdit.stderr, /V1 缺 globalHeader/)

  const breakingClaudeWrite = run('claude', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: {
      file_path: 'src/new-claude.tsx',
      content: 'export const NewClaude = () => <AppShell layout="primary-header" />\n',
    },
  })
  assert.equal(breakingClaudeWrite.status, 2, breakingClaudeWrite.stderr)
  assert.equal(breakingClaudeWrite.stdout, '')
  assert.match(breakingClaudeWrite.stderr, /V1 缺 globalHeader/)
  await assert.rejects(readFile(resolve(root, 'src/new-claude.tsx')), /ENOENT/)

  const breakingCodexPatch = run('codex', {
    event: 'PreToolUse',
    tool_name: 'apply_patch',
    tool_input: {
      command: [
        '*** Begin Patch',
        '*** Add File: src/new-codex.tsx',
        '+export const NewCodex = () => <AppShell layout="primary-header" />',
        '*** End Patch',
      ].join('\n'),
    },
  })
  assert.equal(breakingCodexPatch.status, 2, breakingCodexPatch.stderr)
  assert.equal(breakingCodexPatch.stdout, '')
  assert.match(breakingCodexPatch.stderr, /V1 缺 globalHeader/)
  await assert.rejects(readFile(resolve(root, 'src/new-codex.tsx')), /ENOENT/)

  const cleanCodexPatch = run('codex', {
    event: 'PreToolUse',
    tool_name: 'apply_patch',
    tool_input: {
      command: [
        '*** Begin Patch',
        '*** Add File: src/clean-codex.tsx',
        '+export const CleanCodex = () => (',
        '+  <AppShell layout="primary-header" globalHeader={<div />} />',
        '+)',
        '*** End Patch',
      ].join('\n'),
    },
  })
  assert.equal(cleanCodexPatch.status, 0, cleanCodexPatch.stderr)
  assert.equal(cleanCodexPatch.stdout, '')
  assert.equal(cleanCodexPatch.stderr, '')

  const mismatchedClaudeEdit = run('claude', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: {
      file_path: 'src/existing.tsx',
      old_string: 'not present',
      new_string: 'replacement',
    },
  })
  assert.equal(mismatchedClaudeEdit.status, 70)
  assert.match(mismatchedClaudeEdit.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(mismatchedClaudeEdit.stderr, /PROPOSED_TEXT_MATERIALIZATION_FAILED:EDIT_CONTEXT_MISMATCH/)
})

test('proposed state rejects oversized after-images, oversized sources, and non-UTF-8 disk state', async (t) => {
  const root = await repository(t)
  const limit = 16 * 1024 * 1024
  await writeFile(resolve(root, 'src/growth.txt'), 'xy')
  await writeFile(resolve(root, 'src/dense.txt'), 'x'.repeat(4096))
  await writeFile(resolve(root, 'src/dense-lines.txt'), 'x\n'.repeat(16_385))
  await writeFile(resolve(root, 'src/aggregate-a.txt'), `${'a'.repeat(1024 * 1024)}needle`)
  await writeFile(resolve(root, 'src/aggregate-b.txt'), `${'b'.repeat(1024 * 1024)}needle`)
  await writeFile(resolve(root, 'src/oversized.txt'), Buffer.alloc(limit + 1, 0x61))
  await writeFile(resolve(root, 'src/non-utf8.txt'), Buffer.from([0xff, 0xfe]))

  const growingMutation = parseProviderWriteMutation({
    provider: providers.claude,
    repoRoot: root,
    input: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: 'src/growth.txt',
        old_string: 'x',
        new_string: 'z'.repeat(limit),
      },
    },
  })
  assert.throws(
    () => materializeProviderWriteState({ repoRoot: root, mutation: growingMutation, path: 'src/growth.txt' }),
    (error) => error instanceof ProviderWriteStateError && error.code === 'TEXT_TOO_LARGE',
  )

  const denseReplacement = parseProviderWriteMutation({
    provider: providers.claude,
    repoRoot: root,
    input: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: 'src/dense.txt',
        old_string: 'x',
        new_string: 'z'.repeat(1024 * 1024),
        replace_all: true,
      },
    },
  })
  assert.throws(
    () => materializeProviderWriteState({ repoRoot: root, mutation: denseReplacement, path: 'src/dense.txt' }),
    (error) => error instanceof ProviderWriteStateError && error.code === 'TEXT_TOO_LARGE',
  )

  const denseLineMutation = {
    schemaVersion: 1,
    operations: [{
      kind: 'update',
      path: 'src/dense-lines.txt',
      chunks: [{ header: null, changes: [{ kind: ' ', text: 'x' }], endOfFile: false }],
    }],
  }
  assert.throws(
    () => materializeProviderWriteState({
      repoRoot: root,
      mutation: denseLineMutation,
      path: 'src/dense-lines.txt',
    }),
    (error) => error instanceof ProviderWriteStateError && error.code === 'SOURCE_LINE_COUNT_EXCEEDED',
  )

  const aggregateMutation = {
    schemaVersion: 1,
    operations: [
      {
        kind: 'edit',
        path: 'src/aggregate-a.txt',
        edits: [{ oldString: 'needle', newString: 'A' }],
      },
      {
        kind: 'edit',
        path: 'src/aggregate-b.txt',
        edits: [{ oldString: 'needle', newString: 'B' }],
      },
    ],
  }
  assert.throws(
    () => materializeProviderWriteStates({
      repoRoot: root,
      mutation: aggregateMutation,
      paths: ['src/aggregate-a.txt', 'src/aggregate-b.txt'],
      limits: { maximumAggregateTextBytes: 1536 * 1024 },
    }),
    (error) => error instanceof ProviderWriteStateError && error.code === 'AGGREGATE_TEXT_TOO_LARGE',
  )

  for (const [path, code] of [
    ['src/oversized.txt', 'SOURCE_TOO_LARGE'],
    ['src/non-utf8.txt', 'SOURCE_NOT_UTF8'],
  ]) {
    const mutation = {
      schemaVersion: 1,
      operations: [{
        kind: 'edit',
        path,
        edits: [{ oldString: 'never', newString: 'used' }],
      }],
    }
    assert.throws(
      () => materializeProviderWriteState({ repoRoot: root, mutation, path }),
      (error) => error instanceof ProviderWriteStateError && error.code === code,
    )
  }
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  validateProviderRegistryDocument,
  validateProviderWriteTransports,
} from '../../../scripts/lib/provider-contract-validation.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const registry = JSON.parse(readFileSync(resolve(repoRoot, 'packages/governance/canonical/providers.json'), 'utf8'))

function provider(id) {
  return structuredClone(registry.providers.find((item) => item.id === id))
}

test('canonical providers declare raw-tool write transports with engine-specific positional fields', () => {
  assert.doesNotThrow(() => validateProviderRegistryDocument(structuredClone(registry)))
  assert.deepEqual(provider('claude').normalization.writeTransports, [
    {
      id: 'claude-edit-v1',
      rawTools: ['Edit'],
      engine: 'exact-replace-v1',
      payloadFields: ['tool_input.file_path', 'tool_input.old_string', 'tool_input.new_string', 'tool_input.replace_all'],
    },
    {
      id: 'claude-multi-edit-v1',
      rawTools: ['MultiEdit'],
      engine: 'exact-replace-list-v1',
      payloadFields: ['tool_input.file_path', 'tool_input.edits', 'old_string', 'new_string', 'replace_all'],
    },
    {
      id: 'claude-write-v1',
      rawTools: ['Write'],
      engine: 'full-file-v1',
      payloadFields: ['tool_input.file_path', 'tool_input.content'],
    },
  ])
  assert.deepEqual(provider('codex').normalization.writeTransports, [
    {
      id: 'codex-apply-patch-v1',
      rawTools: ['apply_patch'],
      engine: 'codex-apply-patch-v1',
      payloadFields: ['tool_input.command'],
    },
  ])
  assert.deepEqual(provider('generic').normalization.writeTransports, [
    {
      id: 'generic-edit-v1',
      rawTools: ['edit'],
      engine: 'exact-replace-v1',
      payloadFields: ['path', 'old_content', 'new_content', 'replace_all'],
    },
    {
      id: 'generic-unified-diff-v1',
      rawTools: ['apply_patch'],
      engine: 'unified-diff-v1',
      payloadFields: ['diff'],
    },
    {
      id: 'generic-write-v1',
      rawTools: ['write'],
      engine: 'full-file-v1',
      payloadFields: ['path', 'content'],
    },
  ])
})

test('write transport schema is closed and fixes each engine payload tuple arity', () => {
  const mutations = [
    {
      mutate(value) { delete value.providers[0].normalization.writeTransports },
      expected: /committed JSON Schema/,
    },
    {
      mutate(value) { value.providers[0].normalization.writeTransports[0].unexpected = true },
      expected: /committed JSON Schema/,
    },
    {
      mutate(value) { value.providers[0].normalization.writeTransports[0].engine = 'heuristic-parser-v1' },
      expected: /committed JSON Schema/,
    },
    {
      mutate(value) { value.providers[0].normalization.writeTransports[0].payloadFields.pop() },
      expected: /committed JSON Schema/,
    },
    {
      mutate(value) { value.providers[0].normalization.writeTransports[0].payloadFields[0] = '../file_path' },
      expected: /committed JSON Schema/,
    },
  ]
  for (const { mutate, expected } of mutations) {
    const value = structuredClone(registry)
    mutate(value)
    assert.throws(() => validateProviderRegistryDocument(value), expected)
  }
})

test('write transport semantic validation rejects ambiguous ids, raw tools, and ordering', () => {
  const duplicateId = provider('claude')
  duplicateId.normalization.writeTransports.push({
    ...structuredClone(duplicateId.normalization.writeTransports[0]),
    rawTools: ['apply_patch'],
  })
  assert.throws(() => validateProviderWriteTransports(duplicateId), /write transport id is duplicated/)

  const duplicateRawTool = provider('claude')
  duplicateRawTool.normalization.writeTransports.push({
    id: 'claude-z-v1',
    rawTools: ['Write'],
    engine: 'full-file-v1',
    payloadFields: ['tool_input.path', 'tool_input.content'],
  })
  assert.throws(() => validateProviderWriteTransports(duplicateRawTool), /raw write tool is mapped by multiple transports/)

  const undeclaredRawTool = provider('claude')
  undeclaredRawTool.normalization.writeTransports.push({
    id: 'claude-z-v1',
    rawTools: ['FutureWrite'],
    engine: 'full-file-v1',
    payloadFields: ['tool_input.path', 'tool_input.content'],
  })
  assert.throws(() => validateProviderWriteTransports(undeclaredRawTool), /is not declared by normalization\.writeTools/)

  const unsorted = provider('claude')
  unsorted.normalization.writeTransports.reverse()
  assert.throws(() => validateProviderWriteTransports(unsorted), /must be sorted by id/)

  const wrongArity = provider('codex')
  wrongArity.normalization.writeTransports[0].payloadFields.push('tool_input.patch')
  assert.throws(() => validateProviderWriteTransports(wrongArity), /must contain 1 fields/)
})

#!/usr/bin/env node
// Thin product-runtime adapter over the provider-neutral normalization SSOT. It emits one compact
// normalized base record; dispatchers construct and consume each per-file invocation sequentially
// so MultiEdit payloads never become an O(fileCount × payloadSize) buffered document.

import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  materializeProviderWriteStates,
  normalizeProviderHookInput,
  providerHookIssueMessage,
} from './provider-hook-normalization.mjs'
import {
  interpretProviderHookChildResult,
} from './provider-hook-output-transport.mjs'

const INPUT_CONTRACTS = new Set(['event-v1', 'proposed-text-v1'])
const MAX_CHILD_OUTPUT_BYTES = 1024 * 1024
const MAX_PROVIDER_INPUT_BYTES = 64 * 1024 * 1024
const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true })
export const PROVIDER_HOOK_DISPATCH_LIMITS = Object.freeze({
  maxChangedFileCount: 256,
  maxDescriptorCount: 64,
  maxInvocationCount: 1024,
  maxProposedAfterImageBytes: 16 * 1024 * 1024,
})

function dispatchLimitFailure(message) {
  const error = new Error(message)
  error.code = 'PROVIDER_HOOK_DISPATCH_LIMIT_EXCEEDED'
  throw error
}

function scrubUntrustedControlFields(value) {
  if (Array.isArray(value)) return value.map((entry) => scrubUntrustedControlFields(entry))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'transcript_path' && !key.startsWith('governance_'))
    .map(([key, entry]) => [key, scrubUntrustedControlFields(entry)]))
}

function deleteAtPath(value, path) {
  const segments = String(path).split('.')
  let cursor = value
  for (const segment of segments.slice(0, -1)) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return
    cursor = cursor[segment]
  }
  if (cursor && typeof cursor === 'object' && !Array.isArray(cursor)) {
    delete cursor[segments.at(-1)]
  }
}

function getAtPath(value, path) {
  return String(path).split('.').reduce(
    (current, segment) =>
      current && typeof current === 'object' ? current[segment] : undefined,
    value,
  )
}

function selectedWriteTransportFields(input, normalization) {
  const rawTool = (normalization.toolFields || [])
    .map((field) => getAtPath(input, field))
    .find((value) => typeof value === 'string' && value.trim())
  if (!rawTool) return []
  const wanted = rawTool.trim().toLowerCase()
  return (normalization.writeTransports || [])
    .filter((transport) =>
      Array.isArray(transport.rawTools)
      && transport.rawTools.some((tool) => String(tool).trim().toLowerCase() === wanted))
    .flatMap((transport) => transport.payloadFields || [])
}

function providerPayloadWithoutWriteTransport(input, normalization, operation) {
  const sanitized = scrubUntrustedControlFields(input)
  if (operation !== 'write') return sanitized
  const selectedFields = new Set([
    ...(normalization.pathFields || []),
    ...(normalization.pathArrayFields || []),
    ...selectedWriteTransportFields(input, normalization),
    'file_path',
    'path',
    'content',
    'new_string',
    'old_string',
    'text',
    'patch',
    'diff',
    'command',
    'changed_paths',
    'changes',
    'edits',
    'files',
    'tool_input.file_path',
    'tool_input.path',
    'tool_input.content',
    'tool_input.new_string',
    'tool_input.old_string',
    'tool_input.text',
    'tool_input.patch',
    'tool_input.diff',
    'tool_input.command',
    'tool_input.changed_paths',
    'tool_input.changes',
    'tool_input.edits',
    'tool_input.files',
  ])
  for (const field of selectedFields) deleteAtPath(sanitized, field)
  return sanitized
}

function eventDescriptors(hookContracts, event) {
  if (hookContracts === undefined) return []
  if (!hookContracts || typeof hookContracts !== 'object' || Array.isArray(hookContracts)) {
    throw new TypeError('hook contracts must be an event-keyed object')
  }
  const descriptors = hookContracts[event] ?? []
  if (!Array.isArray(descriptors)) throw new TypeError(`hook contracts for ${event || '<missing>'} must be an array`)
  for (const [index, descriptor] of descriptors.entries()) {
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
      throw new TypeError(`hook contract ${event}[${index}] must be an object`)
    }
    const inputContract = descriptor.inputContract
    if (!INPUT_CONTRACTS.has(inputContract)) {
      throw new TypeError(`hook contract ${event}[${index}] has missing or unsupported inputContract:${inputContract || '<missing>'}`)
    }
    if (typeof descriptor.matcher !== 'string') {
      throw new TypeError(`hook contract ${event}[${index}] has invalid matcher`)
    }
  }
  return descriptors
}

export function normalizeProviderEventPayload({
  input,
  adapter,
  providerId = 'generic',
  projectRoot = process.cwd(),
  hookContracts,
  dispatchLimits = PROVIDER_HOOK_DISPATCH_LIMITS,
} = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('payload must be an object')
  }
  if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter) || !adapter.normalization) {
    throw new TypeError('normalization metadata is required')
  }

  const resolvedProjectRoot = resolve(projectRoot)
  const provider = { id: providerId, normalization: adapter.normalization }
  const hookInput = normalizeProviderHookInput({
    provider,
    input,
    repoRoot: resolvedProjectRoot,
  })
  if (hookInput.issues.length) {
    const error = new Error(providerHookIssueMessage(hookInput.issues[0]))
    error.code = 'PROVIDER_HOOK_INPUT_INVALID'
    throw error
  }

  const { event, tool, operation } = hookInput.normalized
  const sanitizedInput = providerPayloadWithoutWriteTransport(input, adapter.normalization, operation)
  const toolInput = sanitizedInput.tool_input
    && typeof sanitizedInput.tool_input === 'object'
    && !Array.isArray(sanitizedInput.tool_input)
    ? sanitizedInput.tool_input
    : {}
  const changedFiles = hookInput.records.map((record) => {
    return {
      path: record.path,
      ...(record.content
        ? { content: record.content, new_string: record.content }
        : {}),
    }
  })
  if (changedFiles.length > dispatchLimits.maxChangedFileCount) {
    dispatchLimitFailure(`changed-file count exceeds ${dispatchLimits.maxChangedFileCount}`)
  }
  const trustedInput = sanitizedInput
  const descriptors = eventDescriptors(hookContracts, event).filter(
    (descriptor) => !descriptor.matcher || descriptor.matcher.split('|').includes(tool),
  )
  if (descriptors.length > dispatchLimits.maxDescriptorCount) {
    dispatchLimitFailure(`descriptor count exceeds ${dispatchLimits.maxDescriptorCount}`)
  }
  const invocationFileCount = operation === 'write' && changedFiles.length ? changedFiles.length : 1
  const invocationCount = descriptors.length * invocationFileCount
  if (!Number.isSafeInteger(invocationCount) || invocationCount > dispatchLimits.maxInvocationCount) {
    dispatchLimitFailure(`invocation count exceeds ${dispatchLimits.maxInvocationCount}`)
  }
  const needsProposedText = descriptors.some(
    (descriptor) => descriptor.inputContract === 'proposed-text-v1',
  )
  let materializedWriteStates = []
  if (needsProposedText) {
    if (event !== 'PreToolUse' || operation !== 'write' || !hookInput.mutation || !changedFiles.length) {
      const error = new Error('proposed-text-v1 requires a materializable PreToolUse write')
      error.code = 'PROPOSED_TEXT_MUTATION_UNAVAILABLE'
      throw error
    }
    materializedWriteStates = materializeProviderWriteStates({
      repoRoot: resolvedProjectRoot,
      mutation: hookInput.mutation,
      paths: changedFiles.map((record) => record.path),
    })
    let totalAfterImageBytes = 0
    for (const state of materializedWriteStates) {
      if (typeof state?.content === 'string') {
        totalAfterImageBytes += Buffer.byteLength(state.content, 'utf8')
      }
      if (!Number.isSafeInteger(totalAfterImageBytes)
        || totalAfterImageBytes > dispatchLimits.maxProposedAfterImageBytes) {
        dispatchLimitFailure(
          `proposed after-image bytes exceed ${dispatchLimits.maxProposedAfterImageBytes}`,
        )
      }
    }
  }
  return {
    ...trustedInput,
    provider: provider.id,
    hook_event_name: event,
    event,
    tool_name: tool,
    tool,
    operation,
    governance_normalized: hookInput.normalized,
    transcript_path: '',
    tool_input: toolInput,
    changed_files: changedFiles,
    ...(hookInput.sharedContent ? { governance_shared_content: hookInput.sharedContent } : {}),
    ...(materializedWriteStates.length
      ? { governance_materialized_write_states: materializedWriteStates }
      : {}),
  }
}

function readBoundedChildOutput(path, label) {
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_CHILD_OUTPUT_BYTES) {
    throw new Error(`${label} must be a bounded regular file`)
  }
  try {
    return STRICT_UTF8.decode(readFileSync(path))
  } catch {
    throw new Error(`${label} must be strict UTF-8`)
  }
}

function runChildInterpreterCli() {
  const [statusText, outputMode, event, stdoutPath, stderrPath] = process.argv.slice(3)
  if (!/^[0-9]+$/.test(statusText || '') || !stdoutPath || !stderrPath) {
    throw new TypeError('child interpreter arguments are incomplete')
  }
  const interpreted = interpretProviderHookChildResult({
    status: Number(statusText),
    outputMode,
    event,
    stdout: readBoundedChildOutput(stdoutPath, 'child stdout'),
    stderr: readBoundedChildOutput(stderrPath, 'child stderr'),
  })
  process.stdout.write(`${JSON.stringify(interpreted)}\n`)
}

async function runNormalizerCli() {
  const inputChunks = []
  let inputBytes = 0
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    inputBytes += bytes.length
    if (inputBytes > MAX_PROVIDER_INPUT_BYTES) {
      console.error(`GOVERNANCE_INTEGRITY:PROVIDER_EVENT_INPUT_TOO_LARGE:input exceeds ${MAX_PROVIDER_INPUT_BYTES} bytes`)
      process.exit(70)
    }
    inputChunks.push(bytes)
  }
  let raw
  try {
    raw = STRICT_UTF8.decode(Buffer.concat(inputChunks, inputBytes))
  } catch {
    console.error('GOVERNANCE_INTEGRITY:PROVIDER_EVENT_INPUT_NOT_UTF8:input is not strict UTF-8')
    process.exit(70)
  }

  let input
  try {
    input = JSON.parse(raw || '{}')
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('payload must be an object')
    }
  } catch (error) {
    console.error(`GOVERNANCE_INTEGRITY:PROVIDER_EVENT_PAYLOAD_INVALID:${error.message}`)
    process.exit(70)
  }

  let adapter
  try {
    adapter = JSON.parse(process.env.GOVERNANCE_PROVIDER_ADAPTER_JSON || '')
    if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter) || !adapter.normalization) {
      throw new TypeError('normalization metadata is required')
    }
  } catch (error) {
    console.error(`GOVERNANCE_INTEGRITY:PROVIDER_EVENT_ADAPTER_INVALID:${error.message}`)
    process.exit(70)
  }

  let hookContracts
  try {
    hookContracts = JSON.parse(process.env.GOVERNANCE_HOOK_CONTRACTS_JSON || '{}')
    if (!hookContracts || typeof hookContracts !== 'object' || Array.isArray(hookContracts)) {
      throw new TypeError('hook contracts must be an event-keyed object')
    }
  } catch (error) {
    console.error(`GOVERNANCE_INTEGRITY:PROVIDER_EVENT_CONTRACTS_INVALID:${error.message}`)
    process.exit(70)
  }

  try {
    const normalized = normalizeProviderEventPayload({
      input,
      adapter,
      providerId: process.env.GOVERNANCE_PROVIDER || 'generic',
      projectRoot: process.env.GOVERNANCE_PROJECT_DIR || process.cwd(),
      hookContracts,
    })
    process.stdout.write(`${JSON.stringify(normalized)}\n`)
  } catch (error) {
    console.error(`GOVERNANCE_INTEGRITY:${error.code || 'PROVIDER_EVENT_NORMALIZATION_FAILED'}:${error.message}`)
    process.exit(70)
  }
}

let IS_MAIN = false
if (process.argv[1]) {
  try {
    IS_MAIN = realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    IS_MAIN = false
  }
}
if (IS_MAIN) {
  if (process.argv[2] === '--interpret-child') {
    try {
      runChildInterpreterCli()
    } catch (error) {
      console.error(`GOVERNANCE_INTEGRITY:${error.code || 'PROVIDER_HOOK_CHILD_RESULT_INTEGRITY_FAILURE'}:${error.message}`)
      process.exit(70)
    }
  } else {
    await runNormalizerCli()
  }
}

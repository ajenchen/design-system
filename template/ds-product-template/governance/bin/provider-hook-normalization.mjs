import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { compareUtf8Bytes } from './canonical-order.mjs'

const WRITE_TOOLS = new Set(['edit', 'write', 'multiedit'])
const EXECUTE_TOOLS = new Set(['bash', 'execute', 'exec'])
const WRITE_EVENT_KEYS = new Set(['beforewrite', 'prewrite', 'afterwrite', 'postwrite', 'write'])
const PATH_EXPECTATION = 'repository-contained path without symbolic-link components'
const MAX_PROPOSED_TEXT_BYTES = 16 * 1024 * 1024
const MAX_PROPOSED_TEXT_LINES = 16_384
const MAX_PROVIDER_PATH_BYTES = 4096
const MAX_PROVIDER_PATH_SEGMENTS = 256
const DEFAULT_NORMALIZATION_LIMITS = Object.freeze({
  maximumPathCandidates: 1024,
  maximumMutationOperations: 1024,
  maximumMutationEdits: 1024,
  maximumPatchLines: 16_384,
  maximumAggregateTextBytes: MAX_PROPOSED_TEXT_BYTES,
})
const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true })

export class ProviderWriteStateError extends Error {
  constructor(code, message, { path = '<unknown>', pathIssue = null } = {}) {
    super(`provider proposed state blocked:${code}:${message}`)
    this.name = 'ProviderWriteStateError'
    this.code = code
    this.path = path
    this.pathIssue = pathIssue
  }
}

function stateFail(code, message, options) {
  throw new ProviderWriteStateError(code, message, options)
}

function normalizationLimits(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    stateFail('MUTATION_INVALID', 'normalization limits must be an object')
  }
  return Object.fromEntries(Object.entries(DEFAULT_NORMALIZATION_LIMITS).map(([name, fallback]) => {
    const candidate = value[name] ?? fallback
    if (!Number.isSafeInteger(candidate) || candidate < 1) {
      stateFail('MUTATION_INVALID', `${name} must be a positive safe integer`)
    }
    return [name, candidate]
  }))
}

function normalizationCheckpoint(checkpoint, label) {
  if (checkpoint === null || checkpoint === undefined) return
  if (typeof checkpoint !== 'function') stateFail('MUTATION_INVALID', 'normalization checkpoint must be a function')
  checkpoint(label)
}

function enforceCountLimit(count, maximum, code, label) {
  if (!Number.isSafeInteger(count) || count > maximum) {
    stateFail(code, `${label} exceeds ${maximum}`)
  }
}

function boundedPatchLines(body, { limits, checkpoint, label }) {
  let count = 1
  let cursor = 0
  while (cursor < body.length) {
    const newline = body.indexOf('\n', cursor)
    if (newline < 0) break
    count += 1
    enforceCountLimit(count, limits.maximumPatchLines, 'MUTATION_EDIT_COUNT_EXCEEDED', `${label} line count`)
    if ((count & 255) === 0) normalizationCheckpoint(checkpoint, `${label}:lines:${count}`)
    cursor = newline + 1
  }
  normalizationCheckpoint(checkpoint, `${label}:lines-complete`)
  return body.split('\n')
}

function getAtPath(value, path) {
  return String(path).split('.').reduce(
    (current, key) => current && typeof current === 'object' ? current[key] : undefined,
    value,
  )
}

function firstString(input, fields) {
  for (const field of fields || []) {
    const value = getAtPath(input, field)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function aliasKey(value) {
  return String(value || '').trim().toLowerCase()
}

function compactAliasKey(value) {
  return aliasKey(value).replaceAll(/[^a-z0-9]/g, '')
}

function aliasValue(value, aliases, { compact = false } = {}) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const directKey = aliasKey(raw)
  if (typeof aliases?.[directKey] === 'string') return aliases[directKey].trim()
  if (compact) {
    const wanted = compactAliasKey(raw)
    if (typeof aliases?.[wanted] === 'string') return aliases[wanted].trim()
    for (const [key, candidate] of Object.entries(aliases || {})) {
      if (compactAliasKey(key) === wanted && typeof candidate === 'string') return candidate.trim()
    }
  }
  return raw
}

function issue(reasonCode, path = '<invalid>') {
  return {
    reasonCode,
    evidence: {
      kind: 'hook-path-invalid',
      path,
      expected: PATH_EXPECTATION,
      actual: reasonCode,
    },
  }
}

function mutationIssue(reasonCode, path = '<write-mutation>') {
  return {
    reasonCode,
    evidence: {
      kind: 'hook-write-mutation-invalid',
      path,
      expected: 'registry-declared write transport with an exact in-memory after-image',
      actual: reasonCode,
    },
  }
}

export function providerHookIssueMessage(value) {
  switch (value?.reasonCode) {
    case 'NUL_BYTE': return 'provider hook adapter blocked:changed path contains NUL'
    case 'CONTROL_CHARACTER': return 'provider hook adapter blocked:changed path contains a control character'
    case 'OUTSIDE_REPOSITORY': return 'provider hook adapter blocked:changed path escapes repository root'
    case 'REPOSITORY_ROOT': return 'provider hook adapter blocked:changed path must identify a file below the repository root'
    case 'SYMLINK_COMPONENT': return `provider hook adapter blocked:changed path crosses a symbolic link:${value.evidence.path}`
    case 'PATH_INSPECTION_FAILED': return `provider hook adapter blocked:changed path cannot be safely inspected:${value.evidence.path}`
    case 'EMPTY_PATH': return 'provider hook adapter blocked:changed path is empty'
    case 'INVALID_PATH_TYPE': return 'provider hook adapter blocked:changed path must be a string'
    case 'PATH_ARRAY_INVALID': return 'provider hook adapter blocked:changed path collection must be a string or array'
    case 'PATH_ENTRY_INVALID': return 'provider hook adapter blocked:changed path entry must contain a string path or file_path'
    case 'QUOTED_PATCH_PATH': return 'provider hook adapter blocked:quoted patch paths require an explicit canonical decoder'
    case 'SURROUNDING_WHITESPACE': return 'provider hook adapter blocked:changed path has ambiguous surrounding whitespace'
    case 'AMBIGUOUS_SEPARATOR': return 'provider hook adapter blocked:changed path uses a platform-ambiguous separator'
    case 'PATCH_INVALID': return 'provider hook adapter blocked:write patch syntax is invalid'
    case 'PATCH_TOO_LARGE': return 'provider hook adapter blocked:write patch exceeds the bounded payload limit'
    case 'TEXT_INVALID': return 'provider hook adapter blocked:write payload text is invalid'
    case 'TEXT_TOO_LARGE': return 'provider hook adapter blocked:write payload text exceeds the bounded payload limit'
    case 'EDIT_INVALID': return 'provider hook adapter blocked:write edit payload is invalid'
    case 'MUTATION_INVALID': return 'provider hook adapter blocked:write mutation transport is invalid'
    case 'PATH_COUNT_EXCEEDED': return 'provider hook adapter blocked:changed path candidate count exceeds the bounded limit'
    case 'PATH_TOO_LONG': return `provider hook adapter blocked:changed path exceeds ${MAX_PROVIDER_PATH_BYTES} bytes`
    case 'PATH_SEGMENT_COUNT_EXCEEDED': return `provider hook adapter blocked:changed path exceeds ${MAX_PROVIDER_PATH_SEGMENTS} segments`
    case 'MUTATION_OPERATION_COUNT_EXCEEDED': return 'provider hook adapter blocked:write mutation operation count exceeds the bounded limit'
    case 'MUTATION_EDIT_COUNT_EXCEEDED': return 'provider hook adapter blocked:write mutation edit count exceeds the bounded limit'
    default: return 'provider hook adapter blocked:changed path is invalid'
  }
}

function inspectPath(repoRoot, value) {
  if (typeof value !== 'string') return { issue: issue('INVALID_PATH_TYPE') }
  if (Buffer.byteLength(value, 'utf8') > MAX_PROVIDER_PATH_BYTES) {
    return { issue: issue('PATH_TOO_LONG', '<oversized-path>') }
  }
  const trimmed = value.trim()
  if (!trimmed) return { issue: issue('EMPTY_PATH') }
  if (trimmed.includes('\0')) return { issue: issue('NUL_BYTE', trimmed.replaceAll('\0', '\\0')) }
  if (/[\u0001-\u001f\u007f]/.test(trimmed)) return { issue: issue('CONTROL_CHARACTER', '<control-character>') }
  if (trimmed !== value) return { issue: issue('SURROUNDING_WHITESPACE', '<surrounding-whitespace>') }

  // Treat both slash spellings as separators. Otherwise `..\\outside` would be a harmless-looking
  // in-repository filename on POSIX but an escape on a Windows consumer.
  if (process.platform !== 'win32' && trimmed.includes('\\')) {
    return { issue: issue('AMBIGUOUS_SEPARATOR', '<backslash-path>') }
  }
  const portable = trimmed.replaceAll('\\', '/')
  if (portable.split('/').filter(Boolean).length > MAX_PROVIDER_PATH_SEGMENTS) {
    return { issue: issue('PATH_SEGMENT_COUNT_EXCEEDED', '<excessive-path-segments>') }
  }
  if (/^[A-Za-z]:\//.test(portable) && process.platform !== 'win32') {
    return { issue: issue('OUTSIDE_REPOSITORY', portable) }
  }
  const root = resolve(repoRoot)
  const absolute = resolve(isAbsolute(portable) ? portable : resolve(root, portable))
  const rel = relative(root, absolute)
  if (!rel) return { issue: issue('REPOSITORY_ROOT', '.') }
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return { issue: issue('OUTSIDE_REPOSITORY', portable) }
  }

  let cursor = root
  for (const segment of rel.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment)
    try {
      const info = lstatSync(cursor)
      if (info.isSymbolicLink()) {
        return { issue: issue('SYMLINK_COMPONENT', relative(root, cursor).replaceAll('\\', '/')) }
      }
    } catch (error) {
      if (error?.code === 'ENOENT') break
      return { issue: issue('PATH_INSPECTION_FAILED', rel.replaceAll('\\', '/')) }
    }
  }
  return { path: rel.replaceAll('\\', '/') }
}

function requiredRepositoryPath(repoRoot, value, label) {
  const inspected = inspectPath(repoRoot, value)
  if (inspected.issue) {
    stateFail(inspected.issue.reasonCode, `${label} is unsafe`, {
      path: inspected.issue.evidence.path,
      pathIssue: inspected.issue,
    })
  }
  return inspected.path
}

function patchText(value, label) {
  if (typeof value !== 'string' || !value) stateFail('PATCH_INVALID', `${label} must be a non-empty string`)
  if (value.includes('\0')) stateFail('PATCH_INVALID', `${label} contains NUL`)
  if (Buffer.byteLength(value, 'utf8') > MAX_PROPOSED_TEXT_BYTES) {
    stateFail('PATCH_TOO_LARGE', `${label} exceeds ${MAX_PROPOSED_TEXT_BYTES} bytes`)
  }
  return value.replaceAll('\r\n', '\n')
}

function assertText(value, label) {
  if (typeof value !== 'string') stateFail('TEXT_INVALID', `${label} must be a string`)
  if (value.includes('\0')) stateFail('TEXT_INVALID', `${label} contains NUL`)
  if (Buffer.byteLength(value, 'utf8') > MAX_PROPOSED_TEXT_BYTES) {
    stateFail('TEXT_TOO_LARGE', `${label} exceeds ${MAX_PROPOSED_TEXT_BYTES} bytes`)
  }
  return value
}

function portablePatchPath(value, prefix, repoRoot) {
  if (typeof value !== 'string' || !value || /^["']/.test(value)) {
    stateFail('PATCH_INVALID', `${prefix} path is missing or quoted`)
  }
  const withoutPrefix = value.replace(/^[ab]\//, '')
  return requiredRepositoryPath(repoRoot, withoutPrefix, prefix)
}

function parseCodexChunk(lines, header, budget) {
  const changes = []
  let endOfFile = false
  for (const line of lines) {
    budget.edits += 1
    enforceCountLimit(
      budget.edits,
      budget.limits.maximumMutationEdits,
      'MUTATION_EDIT_COUNT_EXCEEDED',
      'Codex patch edit count',
    )
    if ((budget.edits & 255) === 0) {
      normalizationCheckpoint(budget.checkpoint, `codex-patch:edits:${budget.edits}`)
    }
    if (line === '*** End of File') {
      if (endOfFile) stateFail('PATCH_INVALID', 'duplicate End of File marker')
      endOfFile = true
      continue
    }
    if (endOfFile) stateFail('PATCH_INVALID', 'content follows End of File marker')
    if (!/^[ +\-]/.test(line)) stateFail('PATCH_INVALID', `invalid update line prefix:${line.slice(0, 40)}`)
    changes.push({ kind: line[0], text: line.slice(1) })
  }
  if (!changes.length && !endOfFile) stateFail('PATCH_INVALID', 'empty update chunk')
  return { header, changes, endOfFile }
}

/**
 * Parse Codex's native `*** Begin Patch` transport without executing it.
 * The returned AST preserves file and hunk order so one later operation cannot
 * be hidden by an earlier valid path.
 */
export function parseCodexApplyPatch({
  command,
  repoRoot = process.cwd(),
  limits: limitOptions = {},
  checkpoint = null,
} = {}) {
  const limits = normalizationLimits(limitOptions)
  const body = patchText(command, 'Codex apply_patch command')
  const lines = boundedPatchLines(body, {
    limits,
    checkpoint,
    label: 'codex-patch',
  })
  if (lines.at(-1) === '') lines.pop()
  if (lines[0] !== '*** Begin Patch' || lines.at(-1) !== '*** End Patch') {
    stateFail('PATCH_INVALID', 'Codex patch must have exact Begin/End markers')
  }
  const operations = []
  const budget = { edits: 0, limits, checkpoint }
  let index = 1
  while (index < lines.length - 1) {
    enforceCountLimit(
      operations.length + 1,
      limits.maximumMutationOperations,
      'MUTATION_OPERATION_COUNT_EXCEEDED',
      'Codex patch operation count',
    )
    normalizationCheckpoint(checkpoint, `codex-patch:operation:${operations.length + 1}`)
    const header = lines[index]
    const match = header.match(/^\*\*\* (Add|Update|Delete) File: (.+)$/)
    if (!match) stateFail('PATCH_INVALID', `unexpected patch control line:${header.slice(0, 80)}`)
    const kind = match[1].toLowerCase()
    const path = portablePatchPath(match[2], `${kind} file`, repoRoot)
    index += 1

    if (kind === 'add') {
      const added = []
      while (index < lines.length - 1 && !/^\*\*\* (?:Add|Update|Delete) File: /.test(lines[index])) {
        const line = lines[index]
        if (!line.startsWith('+')) stateFail('PATCH_INVALID', 'Add File body must contain only + lines', { path })
        budget.edits += 1
        enforceCountLimit(
          budget.edits,
          limits.maximumMutationEdits,
          'MUTATION_EDIT_COUNT_EXCEEDED',
          'Codex patch edit count',
        )
        added.push(line.slice(1))
        index += 1
      }
      operations.push({ kind: 'add', path, content: `${added.join('\n')}${added.length ? '\n' : ''}` })
      continue
    }

    if (kind === 'delete') {
      if (index < lines.length - 1 && !/^\*\*\* (?:Add|Update|Delete) File: /.test(lines[index])) {
        stateFail('PATCH_INVALID', 'Delete File must not contain a body', { path })
      }
      operations.push({ kind: 'delete', path })
      continue
    }

    let moveTo = null
    if (lines[index]?.startsWith('*** Move to: ')) {
      moveTo = portablePatchPath(lines[index].slice('*** Move to: '.length), 'move destination', repoRoot)
      index += 1
    }
    const chunks = []
    let chunkHeader = null
    let chunkLines = []
    const flushChunk = () => {
      if (!chunkLines.length && chunkHeader === null) return
      chunks.push(parseCodexChunk(chunkLines, chunkHeader, budget))
      chunkHeader = null
      chunkLines = []
    }
    while (index < lines.length - 1 && !/^\*\*\* (?:Add|Update|Delete) File: /.test(lines[index])) {
      const line = lines[index]
      if (line === '@@' || line.startsWith('@@ ')) {
        flushChunk()
        chunkHeader = line === '@@' ? '' : line.slice(3)
      } else if (line === '*** End of File') {
        chunkLines.push(line)
      } else if (line.startsWith('*** ')) {
        stateFail('PATCH_INVALID', `unexpected update control line:${line.slice(0, 80)}`, { path })
      } else {
        chunkLines.push(line)
      }
      index += 1
    }
    flushChunk()
    if (!chunks.length) stateFail('PATCH_INVALID', 'Update File requires at least one non-empty chunk', { path })
    operations.push({ kind: 'update', path, ...(moveTo ? { moveTo } : {}), chunks })
  }
  if (!operations.length) stateFail('PATCH_INVALID', 'Codex patch contains no file operation')
  return { schemaVersion: 1, engine: 'codex-apply-patch-v1', operations }
}

function unifiedPath(value, prefix, repoRoot) {
  const raw = String(value || '').split('\t', 1)[0]
  if (raw === '/dev/null') return null
  return portablePatchPath(raw, prefix, repoRoot)
}

/**
 * Parse ordinary text unified diffs into the same ordered mutation AST.
 * Binary/combined/rename-metadata forms are deliberately rejected instead of
 * guessed; a future provider can add a separately tested engine.
 */
export function parseUnifiedDiff({
  diff,
  repoRoot = process.cwd(),
  limits: limitOptions = {},
  checkpoint = null,
} = {}) {
  const limits = normalizationLimits(limitOptions)
  const body = patchText(diff, 'unified diff')
  const lines = boundedPatchLines(body, {
    limits,
    checkpoint,
    label: 'unified-diff',
  })
  if (lines.at(-1) === '') lines.pop()
  const operations = []
  let editCount = 0
  let index = 0
  while (index < lines.length) {
    enforceCountLimit(
      operations.length + 1,
      limits.maximumMutationOperations,
      'MUTATION_OPERATION_COUNT_EXCEEDED',
      'unified diff operation count',
    )
    normalizationCheckpoint(checkpoint, `unified-diff:operation:${operations.length + 1}`)
    if (/^(?:diff --git|index |new file mode|deleted file mode|similarity index|rename from|rename to|Binary files|GIT binary patch)/.test(lines[index])) {
      stateFail('PATCH_INVALID', `unsupported unified diff metadata:${lines[index].slice(0, 80)}`)
    }
    const oldHeader = lines[index]?.match(/^--- (.+)$/)
    const newHeader = lines[index + 1]?.match(/^\+\+\+ (.+)$/)
    if (!oldHeader || !newHeader) {
      stateFail('PATCH_INVALID', `expected ---/+++ file headers:${String(lines[index] || '').slice(0, 80)}`)
    }
    const oldPath = unifiedPath(oldHeader[1], 'unified old file', repoRoot)
    const newPath = unifiedPath(newHeader[1], 'unified new file', repoRoot)
    if (!oldPath && !newPath) stateFail('PATCH_INVALID', 'unified diff cannot map /dev/null to /dev/null')
    index += 2
    const chunks = []
    while (index < lines.length && !lines[index].startsWith('--- ')) {
      const hunk = lines[index]?.match(/^@@ -([0-9]+)(?:,([0-9]+))? \+([0-9]+)(?:,([0-9]+))? @@(?: .*)?$/)
      if (!hunk) stateFail('PATCH_INVALID', `expected unified hunk header:${String(lines[index] || '').slice(0, 80)}`)
      index += 1
      const changes = []
      let oldCount = 0
      let newCount = 0
      while (index < lines.length && !lines[index].startsWith('@@ ') && !lines[index].startsWith('--- ')) {
        const line = lines[index]
        editCount += 1
        enforceCountLimit(
          editCount,
          limits.maximumMutationEdits,
          'MUTATION_EDIT_COUNT_EXCEEDED',
          'unified diff edit count',
        )
        if ((editCount & 255) === 0) {
          normalizationCheckpoint(checkpoint, `unified-diff:edits:${editCount}`)
        }
        if (line === '\\ No newline at end of file') {
          const previous = changes.at(-1)
          if (!previous) stateFail('PATCH_INVALID', 'no-newline marker must follow a unified diff line')
          if (previous.oldNoNewline || previous.newNoNewline) {
            stateFail('PATCH_INVALID', 'duplicate no-newline marker')
          }
          if (previous.kind !== '+') previous.oldNoNewline = true
          if (previous.kind !== '-') previous.newNoNewline = true
          index += 1
          continue
        }
        if (!/^[ +\-]/.test(line)) stateFail('PATCH_INVALID', `invalid unified line prefix:${line.slice(0, 40)}`)
        if (line[0] !== '+') oldCount += 1
        if (line[0] !== '-') newCount += 1
        changes.push({ kind: line[0], text: line.slice(1) })
        index += 1
      }
      const declaredOld = Number(hunk[2] ?? 1)
      const declaredNew = Number(hunk[4] ?? 1)
      if (oldCount !== declaredOld || newCount !== declaredNew) {
        stateFail('PATCH_INVALID', `unified hunk count mismatch:${oldCount}/${declaredOld}:${newCount}/${declaredNew}`)
      }
      const oldChanges = changes.filter((change) => change.kind !== '+')
      const newChanges = changes.filter((change) => change.kind !== '-')
      if (oldChanges.some((change, changeIndex) => change.oldNoNewline && changeIndex !== oldChanges.length - 1)) {
        stateFail('PATCH_INVALID', 'old-side no-newline marker must describe the final old-side hunk line')
      }
      if (newChanges.some((change, changeIndex) => change.newNoNewline && changeIndex !== newChanges.length - 1)) {
        stateFail('PATCH_INVALID', 'new-side no-newline marker must describe the final new-side hunk line')
      }
      chunks.push({
        oldStart: Number(hunk[1]),
        newStart: Number(hunk[3]),
        changes,
      })
    }
    if (!chunks.length) stateFail('PATCH_INVALID', 'unified file section contains no hunk')
    if (!oldPath) operations.push({ kind: 'add-unified', path: newPath, chunks })
    else if (!newPath) operations.push({ kind: 'delete-unified', path: oldPath, chunks })
    else operations.push({
      kind: 'update-unified',
      path: oldPath,
      ...(oldPath !== newPath ? { moveTo: newPath } : {}),
      chunks,
    })
  }
  if (!operations.length) stateFail('PATCH_INVALID', 'unified diff contains no file operation')
  return { schemaVersion: 1, engine: 'unified-diff-v1', operations }
}

function exactOccurrenceSummary(body, needle, {
  countAll,
  checkpoint = null,
  label,
}) {
  if (!needle) return { count: 0, first: -1 }
  let count = 0
  let first = -1
  let cursor = 0
  while (cursor <= body.length) {
    const offset = body.indexOf(needle, cursor)
    if (offset === -1) break
    if (first === -1) first = offset
    count += 1
    if ((count & 4095) === 0) normalizationCheckpoint(checkpoint, `${label}:matches:${count}`)
    if (!countAll && count === 2) break
    cursor = offset + Math.max(needle.length, 1)
  }
  normalizationCheckpoint(checkpoint, `${label}:matches-complete`)
  return { count, first }
}

function applyExactReplacement(content, edit, label, checkpoint = null) {
  const oldString = assertText(edit?.oldString, `${label}.oldString`)
  const newString = assertText(edit?.newString, `${label}.newString`)
  if (!oldString) stateFail('EDIT_INVALID', `${label}.oldString must not be empty`)
  if (edit.replaceAll !== undefined && edit.replaceAll !== false) {
    if (edit.replaceAll !== true) stateFail('EDIT_INVALID', `${label}.replaceAll must be boolean`)
  }
  const matches = exactOccurrenceSummary(content, oldString, {
    countAll: edit.replaceAll === true,
    checkpoint,
    label,
  })
  if (matches.count === 0) stateFail('EDIT_CONTEXT_MISMATCH', `${label}.oldString was not found`)
  if (edit.replaceAll === true) {
    const projectedBytes = BigInt(Buffer.byteLength(content, 'utf8'))
      + (BigInt(matches.count) * (
        BigInt(Buffer.byteLength(newString, 'utf8'))
        - BigInt(Buffer.byteLength(oldString, 'utf8'))
      ))
    if (projectedBytes > BigInt(MAX_PROPOSED_TEXT_BYTES)) {
      stateFail('TEXT_TOO_LARGE', `${label} after-image exceeds ${MAX_PROPOSED_TEXT_BYTES} bytes`)
    }
    return assertText(content.replaceAll(oldString, () => newString), `${label} after-image`)
  }
  if (matches.count !== 1) {
    stateFail('EDIT_CONTEXT_AMBIGUOUS', `${label}.oldString matched more than once without replaceAll`)
  }
  const offset = matches.first
  return assertText(
    `${content.slice(0, offset)}${newString}${content.slice(offset + oldString.length)}`,
    `${label} after-image`,
  )
}

function splitTextState(content, label, checkpoint = null) {
  if (content === '') return { lines: [], trailingNewline: false }
  let newlineCount = 0
  let cursor = 0
  while (cursor < content.length) {
    const newline = content.indexOf('\n', cursor)
    if (newline < 0) break
    newlineCount += 1
    if ((newlineCount & 4095) === 0) normalizationCheckpoint(checkpoint, `${label}:lines:${newlineCount}`)
    cursor = newline + 1
  }
  const lineCount = newlineCount + (content.endsWith('\n') ? 0 : 1)
  if (lineCount > MAX_PROPOSED_TEXT_LINES) {
    stateFail('SOURCE_LINE_COUNT_EXCEEDED', `${label} exceeds ${MAX_PROPOSED_TEXT_LINES} lines`)
  }
  normalizationCheckpoint(checkpoint, `${label}:lines-complete`)
  const trailingNewline = content.endsWith('\n')
  const lines = content.split('\n')
  if (trailingNewline) lines.pop()
  return { lines, trailingNewline }
}

function joinTextState({ lines, trailingNewline }) {
  return `${lines.join('\n')}${trailingNewline ? '\n' : ''}`
}

function sequenceMatches(lines, at, expected) {
  if (at < 0 || at + expected.length > lines.length) return false
  return expected.every((line, index) => lines[at + index] === line)
}

function findExactSequence(lines, expected, start, {
  header = null,
  endOfFile = false,
  checkpoint = null,
} = {}) {
  if (!expected.length) {
    // Codex apply_patch treats every addition-only update chunk as an append,
    // including bare `@@`, `@@ <label>`, and an explicit End of File marker.
    return lines.length
  }
  let searchStart = start
  if (header !== null && header !== '') {
    const headerIndex = lines.findIndex((line, index) =>
      index >= start && (line === header || line.trim() === header.trim()))
    if (headerIndex === -1) stateFail('PATCH_CONTEXT_MISMATCH', `hunk header was not found:${header.slice(0, 80)}`)
    searchStart = headerIndex
  }
  let match = -1
  for (let index = searchStart; index <= lines.length - expected.length; index += 1) {
    if ((index & 1023) === 0) normalizationCheckpoint(checkpoint, `patch-context:line:${index + 1}`)
    if (!sequenceMatches(lines, index, expected)) continue
    if (match === -1) {
      match = index
      if (header !== null && header !== '') return match
      continue
    }
    stateFail('PATCH_CONTEXT_AMBIGUOUS', 'patch hunk context matched more than one location')
  }
  normalizationCheckpoint(checkpoint, 'patch-context:complete')
  if (match === -1) stateFail('PATCH_CONTEXT_MISMATCH', 'patch hunk context was not found')
  return match
}

function applyCodexChunks(content, chunks, checkpoint = null) {
  const state = splitTextState(content, 'Codex patch source', checkpoint)
  let cursor = 0
  for (const chunk of chunks) {
    const oldLines = chunk.changes.filter((change) => change.kind !== '+').map((change) => change.text)
    const newLines = chunk.changes.filter((change) => change.kind !== '-').map((change) => change.text)
    const offset = findExactSequence(state.lines, oldLines, cursor, {
      header: chunk.header,
      endOfFile: chunk.endOfFile,
      checkpoint,
    })
    state.lines.splice(offset, oldLines.length, ...newLines)
    cursor = offset + newLines.length
  }
  // Codex's Update File engine rewrites accepted text as line-joined content
  // with one final LF. It canonicalizes even a pre-existing no-LF source and
  // context-only or move updates; an empty after-image remains zero bytes.
  state.trailingNewline = state.lines.length > 0
  return assertText(joinTextState(state), 'Codex patch after-image')
}

function applyUnifiedChunks(content, chunks, checkpoint = null) {
  const state = splitTextState(content, 'unified diff source', checkpoint)
  let lineDelta = 0
  for (const chunk of chunks) {
    const oldChanges = chunk.changes.filter((change) => change.kind !== '+')
    const newChanges = chunk.changes.filter((change) => change.kind !== '-')
    const oldLines = oldChanges.map((change) => change.text)
    const newLines = newChanges.map((change) => change.text)
    const expectedOffset = chunk.oldStart === 0 ? 0 : chunk.oldStart - 1 + lineDelta
    if (!sequenceMatches(state.lines, expectedOffset, oldLines)) {
      stateFail('PATCH_CONTEXT_MISMATCH', `unified hunk context mismatch at old line ${chunk.oldStart}`)
    }
    const oldTouchesEnd = expectedOffset + oldLines.length === state.lines.length
    const oldNoNewline = oldChanges.at(-1)?.oldNoNewline === true
    if (oldNoNewline && (!oldTouchesEnd || state.trailingNewline)) {
      stateFail('PATCH_CONTEXT_MISMATCH', 'old-side no-newline marker contradicts the source after-image')
    }
    if (
      oldTouchesEnd
      && oldLines.length
      && !oldNoNewline
      && !state.trailingNewline
    ) {
      stateFail('PATCH_CONTEXT_MISMATCH', 'source lacks the unified diff old-side no-newline marker')
    }
    state.lines.splice(expectedOffset, oldLines.length, ...newLines)
    lineDelta += newLines.length - oldLines.length
    const newTouchesEnd = expectedOffset + newLines.length === state.lines.length
    const newNoNewline = newChanges.at(-1)?.newNoNewline === true
    if (newNoNewline && !newTouchesEnd) {
      stateFail('PATCH_CONTEXT_MISMATCH', 'new-side no-newline marker does not describe the final after-image line')
    }
    if (newTouchesEnd) {
      state.trailingNewline = state.lines.length > 0 && !newNoNewline
    }
  }
  return assertText(joinTextState(state), 'unified diff after-image')
}

function sameOpenedIdentity(left, right) {
  return ['dev', 'ino', 'mode'].every((key) => left[key] === right[key])
}

function repositoryChainSnapshot(repoRoot, path) {
  const root = resolve(repoRoot)
  const segments = path.split('/').filter(Boolean)
  const chain = []
  let cursor = root
  for (let index = -1; index < segments.length; index += 1) {
    if (index >= 0) cursor = resolve(cursor, segments[index])
    let info
    try {
      info = lstatSync(cursor, { bigint: true })
    } catch (error) {
      if (error?.code === 'ENOENT') return { missing: true, chain }
      stateFail('SOURCE_UNSAFE', `cannot inspect source component:${path}`, { path })
    }
    if (info.isSymbolicLink()) {
      stateFail('SOURCE_UNSAFE', `source component became a symbolic link:${path}`, { path })
    }
    const isFinal = index === segments.length - 1
    if (!isFinal && !info.isDirectory()) {
      stateFail('SOURCE_UNSAFE', `source parent is not a directory:${path}`, { path })
    }
    chain.push({
      path: index < 0 ? '.' : segments.slice(0, index + 1).join('/'),
      dev: info.dev,
      ino: info.ino,
      mode: info.mode,
      ...(isFinal ? {
        size: info.size,
        mtimeNs: info.mtimeNs,
        ctimeNs: info.ctimeNs,
        nlink: info.nlink,
      } : {}),
    })
  }
  return { missing: false, chain }
}

function sameRepositoryChain(left, right) {
  return left.length === right.length && left.every((entry, index) =>
    entry.path === right[index].path
    && sameOpenedIdentity(entry, right[index])
    && (
      index !== left.length - 1
      || ['size', 'mtimeNs', 'ctimeNs', 'nlink'].every((key) => entry[key] === right[index][key])
    ))
}

function readStableRepositoryText(
  repoRoot,
  path,
  sourceOpenBarrier = null,
  maximumRetainedBytes = MAX_PROPOSED_TEXT_BYTES,
) {
  const inspected = requiredRepositoryPath(repoRoot, path, 'materialized file')
  const absolute = resolve(repoRoot, inspected)
  const preOpen = repositoryChainSnapshot(repoRoot, inspected)
  if (preOpen.missing) return { path: inspected, kind: 'deleted' }
  if (typeof sourceOpenBarrier === 'function') {
    sourceOpenBarrier({ phase: 'after-source-chain-snapshot', path: inspected })
  }
  let handle = null
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
    handle = openSync(absolute, fsConstants.O_RDONLY | noFollow)
  } catch (error) {
    stateFail(
      error?.code === 'ENOENT' ? 'SOURCE_RACED' : 'SOURCE_UNSAFE',
      `cannot open the pre-inspected no-follow source:${inspected}`,
      { path: inspected },
    )
  }
  try {
    const before = fstatSync(handle, { bigint: true })
    const preFinal = preOpen.chain.at(-1)
    if (!preFinal || !sameOpenedIdentity(preFinal, before)) {
      stateFail('SOURCE_RACED', `opened source identity differs from its inspected repository path:${inspected}`, { path: inspected })
    }
    if (!before.isFile() || before.nlink !== 1n) {
      stateFail('SOURCE_UNSAFE', `source must be one regular unaliased file:${inspected}`, { path: inspected })
    }
    if (before.size > BigInt(MAX_PROPOSED_TEXT_BYTES)) {
      stateFail('SOURCE_TOO_LARGE', `source exceeds ${MAX_PROPOSED_TEXT_BYTES} bytes:${inspected}`, { path: inspected })
    }
    if (before.size > BigInt(maximumRetainedBytes)) {
      stateFail(
        'AGGREGATE_TEXT_TOO_LARGE',
        `materialized text states exceed ${maximumRetainedBytes} remaining bytes:${inspected}`,
        { path: inspected },
      )
    }
    const bytes = Buffer.alloc(Number(before.size))
    let offset = 0
    while (offset < bytes.length) {
      const count = readSync(handle, bytes, offset, bytes.length - offset, offset)
      if (count <= 0) stateFail('SOURCE_RACED', `source truncated while reading:${inspected}`, { path: inspected })
      offset += count
    }
    const after = fstatSync(handle, { bigint: true })
    for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink']) {
      if (before[key] !== after[key]) {
        stateFail('SOURCE_RACED', `source changed while reading:${inspected}`, { path: inspected })
      }
    }
    const postOpen = repositoryChainSnapshot(repoRoot, inspected)
    if (postOpen.missing || !sameRepositoryChain(preOpen.chain, postOpen.chain)) {
      stateFail('SOURCE_RACED', `source repository chain changed while reading:${inspected}`, { path: inspected })
    }
    const postFinal = postOpen.chain.at(-1)
    if (!postFinal || !sameOpenedIdentity(postFinal, after)) {
      stateFail('SOURCE_RACED', `source path no longer names the opened file:${inspected}`, { path: inspected })
    }
    let content
    try {
      content = STRICT_UTF8.decode(bytes)
    } catch {
      stateFail('SOURCE_NOT_UTF8', `source is not strict UTF-8:${inspected}`, { path: inspected })
    }
    return { path: inspected, kind: 'text', content }
  } finally {
    if (handle !== null) closeSync(handle)
  }
}

function retainedTextBytes(state) {
  return state?.kind === 'text' ? Buffer.byteLength(state.content, 'utf8') : 0
}

function setBoundedState(states, path, state, budget) {
  const previousBytes = retainedTextBytes(states.get(path))
  const nextBytes = retainedTextBytes(state)
  const projected = budget.bytes - previousBytes + nextBytes
  if (!Number.isSafeInteger(projected) || projected > budget.maximum) {
    stateFail(
      'AGGREGATE_TEXT_TOO_LARGE',
      `materialized text states exceed ${budget.maximum} bytes`,
      { path },
    )
  }
  states.set(path, state)
  budget.bytes = projected
  return state
}

function stateMapEntry(states, repoRoot, path, sourceOpenBarrier, budget) {
  if (!states.has(path)) {
    const remaining = budget.maximum - budget.bytes
    const state = readStableRepositoryText(repoRoot, path, sourceOpenBarrier, remaining)
    setBoundedState(states, path, state, budget)
  }
  return states.get(path)
}

function requireTextState(states, repoRoot, path, label, sourceOpenBarrier, budget) {
  const current = stateMapEntry(states, repoRoot, path, sourceOpenBarrier, budget)
  if (current.kind !== 'text') stateFail('SOURCE_MISSING', `${label} source does not exist:${path}`, { path })
  return current
}

function boundedMaterializationChunks(
  operation,
  label,
  limits,
  checkpoint,
  currentEditCount,
) {
  if (!Array.isArray(operation.chunks) || !operation.chunks.length) {
    stateFail('MUTATION_INVALID', `${label}.chunks must be a non-empty array`)
  }
  enforceCountLimit(
    operation.chunks.length,
    limits.maximumPatchLines,
    'MUTATION_EDIT_COUNT_EXCEEDED',
    `${label}.chunk count`,
  )
  let editCount = currentEditCount
  for (const [chunkIndex, chunk] of operation.chunks.entries()) {
    if (!chunk || typeof chunk !== 'object' || !Array.isArray(chunk.changes)) {
      stateFail('MUTATION_INVALID', `${label}.chunks[${chunkIndex}].changes must be an array`)
    }
    enforceCountLimit(
      editCount + chunk.changes.length,
      limits.maximumMutationEdits,
      'MUTATION_EDIT_COUNT_EXCEEDED',
      'mutation edit count',
    )
    editCount += chunk.changes.length
    if ((chunkIndex & 255) === 0) {
      normalizationCheckpoint(checkpoint, `materialize:chunk:${chunkIndex + 1}`)
    }
  }
  return { chunks: operation.chunks, editCount }
}

/**
 * Materialize an ordered provider-neutral mutation AST entirely in memory,
 * once for every requested path. Replaying one multi-file patch separately per
 * path would be O(paths × patch); this batch API keeps it O(patch + paths).
 * This function never writes either the checkout or a temporary patch target.
 */
export function materializeProviderWriteStates({
  repoRoot = process.cwd(),
  mutation,
  paths,
  sourceOpenBarrier = null,
  limits: limitOptions = {},
  checkpoint = null,
} = {}) {
  const limits = normalizationLimits(limitOptions)
  if (!mutation || mutation.schemaVersion !== 1 || !Array.isArray(mutation.operations)) {
    stateFail('MUTATION_INVALID', 'mutation AST is missing or unsupported')
  }
  if (!Array.isArray(paths) || !paths.length) {
    stateFail('MUTATION_INVALID', 'requested materialized paths must be a non-empty array')
  }
  enforceCountLimit(
    paths.length,
    limits.maximumPathCandidates,
    'PATH_COUNT_EXCEEDED',
    'requested materialized path count',
  )
  enforceCountLimit(
    mutation.operations.length,
    limits.maximumMutationOperations,
    'MUTATION_OPERATION_COUNT_EXCEEDED',
    'mutation operation count',
  )
  normalizationCheckpoint(checkpoint, 'materialize:start')
  const requestedPaths = [...new Set(paths.map((path, index) =>
    requiredRepositoryPath(repoRoot, path, `requested materialized paths[${index}]`)))]
  const states = new Map()
  const retainedBudget = {
    bytes: 0,
    maximum: limits.maximumAggregateTextBytes,
  }
  let editCount = 0
  for (const [operationIndex, operation] of mutation.operations.entries()) {
    normalizationCheckpoint(checkpoint, `materialize:operation:${operationIndex + 1}`)
    const label = `operation[${operationIndex}]`
    const operationPath = requiredRepositoryPath(repoRoot, operation.path, `${label}.path`)
    if (operation.kind === 'write') {
      setBoundedState(states, operationPath, {
        path: operationPath,
        kind: 'text',
        content: assertText(operation.content, `${label}.content`),
      }, retainedBudget)
      continue
    }
    if (operation.kind === 'edit') {
      const current = requireTextState(
        states,
        repoRoot,
        operationPath,
        label,
        sourceOpenBarrier,
        retainedBudget,
      )
      let content = current.content
      if (!Array.isArray(operation.edits) || !operation.edits.length) {
        stateFail('EDIT_INVALID', `${label}.edits must be a non-empty array`, { path: operationPath })
      }
      for (const [editIndex, edit] of operation.edits.entries()) {
        editCount += 1
        enforceCountLimit(
          editCount,
          limits.maximumMutationEdits,
          'MUTATION_EDIT_COUNT_EXCEEDED',
          'mutation edit count',
        )
        content = applyExactReplacement(content, edit, `${label}.edits[${editIndex}]`, checkpoint)
      }
      setBoundedState(
        states,
        operationPath,
        { path: operationPath, kind: 'text', content },
        retainedBudget,
      )
      continue
    }
    if (operation.kind === 'add') {
      const current = stateMapEntry(states, repoRoot, operationPath, sourceOpenBarrier, retainedBudget)
      if (current.kind !== 'deleted') stateFail('ADD_TARGET_EXISTS', `${label} target already exists`, { path: operationPath })
      setBoundedState(states, operationPath, {
        path: operationPath,
        kind: 'text',
        content: assertText(operation.content, `${label}.content`),
      }, retainedBudget)
      continue
    }
    if (operation.kind === 'delete') {
      requireTextState(states, repoRoot, operationPath, label, sourceOpenBarrier, retainedBudget)
      setBoundedState(states, operationPath, { path: operationPath, kind: 'deleted' }, retainedBudget)
      continue
    }
    if (operation.kind === 'update') {
      const bounded = boundedMaterializationChunks(
        operation,
        label,
        limits,
        checkpoint,
        editCount,
      )
      editCount = bounded.editCount
      const current = requireTextState(
        states,
        repoRoot,
        operationPath,
        label,
        sourceOpenBarrier,
        retainedBudget,
      )
      const content = applyCodexChunks(current.content, bounded.chunks, checkpoint)
      if (operation.moveTo) {
        const moveTo = requiredRepositoryPath(repoRoot, operation.moveTo, `${label}.moveTo`)
        if (stateMapEntry(states, repoRoot, moveTo, sourceOpenBarrier, retainedBudget).kind !== 'deleted') {
          stateFail('MOVE_TARGET_EXISTS', `${label} move target already exists`, { path: moveTo })
        }
        setBoundedState(states, operationPath, { path: operationPath, kind: 'deleted' }, retainedBudget)
        setBoundedState(states, moveTo, { path: moveTo, kind: 'text', content }, retainedBudget)
      } else {
        setBoundedState(states, operationPath, { path: operationPath, kind: 'text', content }, retainedBudget)
      }
      continue
    }
    if (['add-unified', 'delete-unified', 'update-unified'].includes(operation.kind)) {
      const bounded = boundedMaterializationChunks(
        operation,
        label,
        limits,
        checkpoint,
        editCount,
      )
      editCount = bounded.editCount
      const isAdd = operation.kind === 'add-unified'
      const current = isAdd
        ? stateMapEntry(states, repoRoot, operationPath, sourceOpenBarrier, retainedBudget)
        : requireTextState(
          states,
          repoRoot,
          operationPath,
          label,
          sourceOpenBarrier,
          retainedBudget,
        )
      if (isAdd && current.kind !== 'deleted') {
        stateFail('ADD_TARGET_EXISTS', `${label} target already exists`, { path: operationPath })
      }
      const source = current.kind === 'text' ? current.content : ''
      const content = applyUnifiedChunks(source, bounded.chunks, checkpoint)
      if (operation.kind === 'delete-unified') {
        setBoundedState(states, operationPath, { path: operationPath, kind: 'deleted' }, retainedBudget)
      } else if (operation.moveTo) {
        const moveTo = requiredRepositoryPath(repoRoot, operation.moveTo, `${label}.moveTo`)
        if (stateMapEntry(states, repoRoot, moveTo, sourceOpenBarrier, retainedBudget).kind !== 'deleted') {
          stateFail('MOVE_TARGET_EXISTS', `${label} move target already exists`, { path: moveTo })
        }
        setBoundedState(states, operationPath, { path: operationPath, kind: 'deleted' }, retainedBudget)
        setBoundedState(states, moveTo, { path: moveTo, kind: 'text', content }, retainedBudget)
      } else {
        setBoundedState(states, operationPath, { path: operationPath, kind: 'text', content }, retainedBudget)
      }
      continue
    }
    stateFail('MUTATION_INVALID', `${label} has unsupported kind:${operation.kind || '<missing>'}`)
  }
  normalizationCheckpoint(checkpoint, 'materialize:complete')
  return requestedPaths.map((requestedPath) => {
    const result = stateMapEntry(
      states,
      repoRoot,
      requestedPath,
      sourceOpenBarrier,
      retainedBudget,
    )
    return {
      schemaVersion: 1,
      path: requestedPath,
      kind: result.kind,
      ...(result.kind === 'text' ? { content: result.content } : {}),
    }
  })
}

export function materializeProviderWriteState({
  repoRoot = process.cwd(),
  mutation,
  path,
  sourceOpenBarrier = null,
  limits = {},
  checkpoint = null,
} = {}) {
  return materializeProviderWriteStates({
    repoRoot,
    mutation,
    paths: [path],
    sourceOpenBarrier,
    limits,
    checkpoint,
  })[0]
}

function transportField(input, field, label) {
  const value = getAtPath(input, field)
  if (value === undefined) stateFail('MUTATION_INVALID', `${label} field is missing:${field}`)
  return value
}

function mutationPath(repoRoot, value, label) {
  return requiredRepositoryPath(repoRoot, value, label)
}

function matchingWriteTransports(provider, input) {
  const normalization = provider?.normalization || {}
  const rawTool = firstString(input || {}, normalization.toolFields || [])
  if (!rawTool) return { rawTool: '', matches: [] }
  const transports = Array.isArray(normalization.writeTransports)
    ? normalization.writeTransports
    : []
  return {
    rawTool,
    matches: transports.filter((transport) =>
      Array.isArray(transport.rawTools)
      && transport.rawTools.some((candidate) => aliasKey(candidate) === aliasKey(rawTool))),
  }
}

function postEventCarriesDeclaredTransport(input, transport, { limits, checkpoint }) {
  const requiredFieldIndexes = {
    'full-file-v1': [0, 1],
    'exact-replace-v1': [0, 1, 2],
    'exact-replace-list-v1': [1],
    'codex-apply-patch-v1': [0],
    'unified-diff-v1': [0],
  }[transport?.engine]
  if (!requiredFieldIndexes) return true
  const rootFieldsPresent = requiredFieldIndexes.every((index) =>
    typeof transport.payloadFields?.[index] === 'string'
      && getAtPath(input, transport.payloadFields[index]) !== undefined)
  if (!rootFieldsPresent || transport.engine !== 'exact-replace-list-v1') {
    return rootFieldsPresent
  }
  const edits = getAtPath(input, transport.payloadFields[1])
  const outerPath = getAtPath(input, transport.payloadFields[0])
  if (!Array.isArray(edits) || edits.length === 0) return false
  // An oversized PostToolUse MultiEdit must reach the bounded parser without first
  // walking the entire provider array merely to decide whether it carries a transport.
  if (edits.length > limits.maximumMutationEdits
    || edits.length > limits.maximumMutationOperations) return true
  for (const [index, edit] of edits.entries()) {
    if ((index & 255) === 0) normalizationCheckpoint(checkpoint, `post-write-transport:edit:${index + 1}`)
    if (!edit
      || typeof edit !== 'object'
      || Array.isArray(edit)
      || typeof (edit.file_path ?? edit.path ?? outerPath) !== 'string'
      || getAtPath(edit, transport.payloadFields[2]) === undefined
      || getAtPath(edit, transport.payloadFields[3]) === undefined) return false
  }
  return true
}

/**
 * Parse a provider-native write payload according to registry data. Selection
 * uses the raw tool name before aliases so `apply_patch` cannot collapse into
 * the unrelated legacy `MultiEdit` transport.
 */
export function parseProviderWriteMutation({
  provider,
  input,
  repoRoot = process.cwd(),
  limits: limitOptions = {},
  checkpoint = null,
} = {}) {
  const limits = normalizationLimits(limitOptions)
  normalizationCheckpoint(checkpoint, 'write-transport:start')
  const { rawTool, matches } = matchingWriteTransports(provider, input)
  if (!rawTool) return null
  if (!matches.length) return null
  if (matches.length !== 1) stateFail('MUTATION_INVALID', `raw tool matches multiple write transports:${rawTool}`)
  const transport = matches[0]
  const fields = transport.payloadFields
  if (!Array.isArray(fields)) stateFail('MUTATION_INVALID', `${transport.id}.payloadFields must be an array`)

  if (transport.engine === 'full-file-v1') {
    const path = mutationPath(repoRoot, transportField(input, fields[0], transport.id), `${transport.id}.path`)
    const content = assertText(transportField(input, fields[1], transport.id), `${transport.id}.content`)
    return {
      schemaVersion: 1,
      provider: provider?.id || null,
      rawTool,
      transportId: transport.id,
      engine: transport.engine,
      operations: [{ kind: 'write', path, content }],
    }
  }

  if (transport.engine === 'exact-replace-v1') {
    const path = mutationPath(repoRoot, transportField(input, fields[0], transport.id), `${transport.id}.path`)
    const oldString = assertText(transportField(input, fields[1], transport.id), `${transport.id}.oldString`)
    const newString = assertText(transportField(input, fields[2], transport.id), `${transport.id}.newString`)
    const replaceAll = getAtPath(input, fields[3])
    if (replaceAll !== undefined && typeof replaceAll !== 'boolean') {
      stateFail('EDIT_INVALID', `${transport.id}.replaceAll must be boolean`)
    }
    return {
      schemaVersion: 1,
      provider: provider?.id || null,
      rawTool,
      transportId: transport.id,
      engine: transport.engine,
      operations: [{
        kind: 'edit',
        path,
        edits: [{ oldString, newString, ...(replaceAll !== undefined ? { replaceAll } : {}) }],
      }],
    }
  }

  if (transport.engine === 'exact-replace-list-v1') {
    const outerPathValue = getAtPath(input, fields[0])
    const edits = transportField(input, fields[1], transport.id)
    if (!Array.isArray(edits) || !edits.length) stateFail('EDIT_INVALID', `${transport.id}.edits must be a non-empty array`)
    enforceCountLimit(
      edits.length,
      limits.maximumMutationEdits,
      'MUTATION_EDIT_COUNT_EXCEEDED',
      `${transport.id}.edits`,
    )
    enforceCountLimit(
      edits.length,
      limits.maximumMutationOperations,
      'MUTATION_OPERATION_COUNT_EXCEEDED',
      `${transport.id}.operations`,
    )
    const operations = edits.map((edit, index) => {
      if ((index & 255) === 0) normalizationCheckpoint(checkpoint, `${transport.id}:edit:${index + 1}`)
      if (!edit || typeof edit !== 'object' || Array.isArray(edit)) {
        stateFail('EDIT_INVALID', `${transport.id}.edits[${index}] must be an object`)
      }
      const editPath = edit.file_path ?? edit.path ?? outerPathValue
      const path = mutationPath(repoRoot, editPath, `${transport.id}.edits[${index}].path`)
      const oldString = assertText(getAtPath(edit, fields[2]), `${transport.id}.edits[${index}].oldString`)
      const newString = assertText(getAtPath(edit, fields[3]), `${transport.id}.edits[${index}].newString`)
      const replaceAll = getAtPath(edit, fields[4])
      if (replaceAll !== undefined && typeof replaceAll !== 'boolean') {
        stateFail('EDIT_INVALID', `${transport.id}.edits[${index}].replaceAll must be boolean`)
      }
      return {
        kind: 'edit',
        path,
        edits: [{ oldString, newString, ...(replaceAll !== undefined ? { replaceAll } : {}) }],
      }
    })
    return {
      schemaVersion: 1,
      provider: provider?.id || null,
      rawTool,
      transportId: transport.id,
      engine: transport.engine,
      operations,
    }
  }

  if (transport.engine === 'codex-apply-patch-v1') {
    return {
      ...parseCodexApplyPatch({
        command: transportField(input, fields[0], transport.id),
        repoRoot,
        limits,
        checkpoint,
      }),
      provider: provider?.id || null,
      rawTool,
      transportId: transport.id,
    }
  }

  if (transport.engine === 'unified-diff-v1') {
    return {
      ...parseUnifiedDiff({
        diff: transportField(input, fields[0], transport.id),
        repoRoot,
        limits,
        checkpoint,
      }),
      provider: provider?.id || null,
      rawTool,
      transportId: transport.id,
    }
  }

  stateFail('MUTATION_INVALID', `unsupported write transport engine:${transport.engine || '<missing>'}`)
}

function entryContent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  return [value.content, value.new_string, value.text]
    .filter((item) => typeof item === 'string' && item)
    .join('\n')
}

function operationChangedText(operation) {
  if (!operation || typeof operation !== 'object') return ''
  if (operation.kind === 'write' || operation.kind === 'add') {
    return typeof operation.content === 'string' ? operation.content : ''
  }
  if (operation.kind === 'edit') {
    return (operation.edits || [])
      .map((edit) => typeof edit?.newString === 'string' ? edit.newString : '')
      .filter(Boolean)
      .join('\n')
  }
  if (['update', 'add-unified', 'update-unified'].includes(operation.kind)) {
    return (operation.chunks || [])
      .flatMap((chunk) => chunk.changes || [])
      .filter((change) => change.kind === '+')
      .map((change) => change.text)
      .join('\n')
  }
  return ''
}

function uniqueSortedIssues(values) {
  const byEvidence = new Map()
  for (const value of values) {
    const key = `${value.reasonCode}:${value.evidence.path}`
    if (!byEvidence.has(key)) byEvidence.set(key, value)
  }
  return [...byEvidence.values()].sort((left, right) =>
    compareUtf8Bytes(left.reasonCode, right.reasonCode)
      || compareUtf8Bytes(left.evidence.path, right.evidence.path))
}

function normalizeOperation({ input, rawEvent, tool, normalization }) {
  const aliases = normalization.toolAliases || {}
  const writeTools = new Set((normalization.writeTools || []).map((value) =>
    aliasValue(value, aliases).toLowerCase()))
  const lowerTool = tool.toLowerCase()
  if (WRITE_TOOLS.has(lowerTool) || writeTools.has(lowerTool)) return 'write'
  if (EXECUTE_TOOLS.has(lowerTool)) return 'execute'

  const explicit = typeof input.operation === 'string'
    ? aliasValue(input.operation, aliases).toLowerCase()
    : ''
  if (WRITE_TOOLS.has(explicit) || writeTools.has(explicit) || explicit === 'write') return 'write'
  if (EXECUTE_TOOLS.has(explicit)) return 'execute'
  if (WRITE_EVENT_KEYS.has(compactAliasKey(rawEvent))) return 'write'
  return 'read'
}

function patchValues(input, toolInput) {
  const values = [toolInput.patch, input.patch, toolInput.diff, input.diff]
    .filter((value) => typeof value === 'string' && value)
  return [...new Set(values)]
}

/**
 * Normalize a provider payload into one provider-neutral semantic record.
 *
 * `normalized.paths` are always sorted repository-relative POSIX paths. `records` retains the
 * per-file content needed by the shell-hook runner, while `issues` is the fail-closed path verdict
 * consumed by both the package API and the repository runner.
 */
export function normalizeProviderHookInput({
  provider,
  input,
  repoRoot = process.cwd(),
  limits: limitOptions = {},
  checkpoint = null,
} = {}) {
  const limits = normalizationLimits(limitOptions)
  normalizationCheckpoint(checkpoint, 'normalize:start')
  const normalization = provider?.normalization || {}
  const rawEvent = firstString(input || {}, normalization.eventFields || [])
  const rawTool = firstString(input || {}, normalization.toolFields || [])
  const event = aliasValue(rawEvent, normalization.eventAliases, { compact: true })
  const tool = aliasValue(rawTool, normalization.toolAliases)
  const operation = normalizeOperation({ input: input || {}, rawEvent, tool, normalization })
  const toolInput = input?.tool_input && typeof input.tool_input === 'object' && !Array.isArray(input.tool_input)
    ? input.tool_input
    : {}
  // Provider payloads may describe many paths while carrying one shared content body. Keep that
  // body exactly once; callers materialize it only for the single file currently being dispatched.
  const sharedContent = [...new Set([entryContent(toolInput), entryContent(input)]
    .filter((value) => typeof value === 'string' && value))]
    .join('\n')
  const candidates = []
  const issues = []
  let mutation = null
  let fatalMutationLimit = false

  const selectedWriteTransports = matchingWriteTransports(provider, input)
  const shouldParseMutation = selectedWriteTransports.matches.length > 0
    && (
      selectedWriteTransports.matches.length !== 1
      || postEventCarriesDeclaredTransport(input, selectedWriteTransports.matches[0], {
        limits,
        checkpoint,
      })
    )
  if (shouldParseMutation) {
    try {
      mutation = parseProviderWriteMutation({
        provider,
        input,
        repoRoot,
        limits,
        checkpoint,
      })
    } catch (error) {
      if (!(error instanceof ProviderWriteStateError)) throw error
      fatalMutationLimit = [
        'PATH_COUNT_EXCEEDED',
        'MUTATION_OPERATION_COUNT_EXCEEDED',
        'MUTATION_EDIT_COUNT_EXCEEDED',
      ].includes(error.code)
      if (error.pathIssue) {
        issues.push(error.pathIssue)
      } else {
        issues.push(mutationIssue(
          error.code || 'MUTATION_INVALID',
          error.path === '<unknown>' ? '<write-mutation>' : error.path,
        ))
      }
    }
  }

  if (fatalMutationLimit) {
    const canonicalIssues = uniqueSortedIssues(issues)
    normalizationCheckpoint(checkpoint, 'normalize:bounded-rejection')
    return {
      normalized: {
        provider: provider?.id || null,
        event,
        tool,
        operation,
        paths: [],
        blocked: true,
        evidence: canonicalIssues.map((value) => value.evidence),
      },
      records: [],
      sharedContent,
      issues: canonicalIssues,
      mutation: null,
    }
  }

  let pathCandidateCount = 0
  let pathCandidateLimitReached = false
  const addCandidate = (path, source = null, pathLocal = false) => {
    pathCandidateCount += 1
    if (pathCandidateCount > limits.maximumPathCandidates) {
      if (!pathCandidateLimitReached) {
        issues.push(mutationIssue('PATH_COUNT_EXCEEDED', '<changed-path-candidates>'))
      }
      pathCandidateLimitReached = true
      return false
    }
    if ((pathCandidateCount & 255) === 0) {
      normalizationCheckpoint(checkpoint, `normalize:path-candidate:${pathCandidateCount}`)
    }
    const inspected = inspectPath(repoRoot, path)
    if (inspected.issue) {
      issues.push(inspected.issue)
      return false
    }
    candidates.push({
      path: inspected.path,
      content: pathLocal ? entryContent(source) : '',
      source: pathLocal && source && typeof source === 'object' && !Array.isArray(source)
        ? { ...source }
        : {},
    })
    return true
  }
  const addPatchCandidate = (path, source = null, pathLocal = false) => {
    if (typeof path === 'string' && /^["']/.test(path.trim())) {
      issues.push(issue('QUOTED_PATCH_PATH', '<quoted-patch-path>'))
      return false
    }
    return addCandidate(path, source, pathLocal)
  }

  for (const [operationIndex, operation] of (mutation?.operations || []).entries()) {
    normalizationCheckpoint(checkpoint, `normalize:mutation-operation:${operationIndex + 1}`)
    if (operation.kind === 'write') {
      addCandidate(operation.path, { content: operation.content }, true)
    } else if (operation.kind === 'edit') {
      for (const edit of operation.edits || []) {
        addCandidate(operation.path, {
          old_string: edit.oldString,
          new_string: edit.newString,
          ...(edit.replaceAll !== undefined ? { replace_all: edit.replaceAll } : {}),
        }, true)
      }
    } else {
      const changedText = operationChangedText(operation)
      addCandidate(
        operation.path,
        changedText ? { new_string: changedText } : null,
        Boolean(changedText),
      )
    }
    if (operation.moveTo) {
      const changedText = operationChangedText(operation)
      addCandidate(
        operation.moveTo,
        changedText ? { new_string: changedText } : null,
        Boolean(changedText),
      )
    }
    if (pathCandidateLimitReached) break
  }

  const mutationTransport = mutation
    ? (normalization.writeTransports || []).find((transport) => transport.id === mutation.transportId)
    : null
  const mutationEditCollectionField = mutation?.engine === 'exact-replace-list-v1'
    ? mutationTransport?.payloadFields?.[1]
    : null

  for (const field of normalization.pathFields || []) {
    if (pathCandidateLimitReached) break
    const value = getAtPath(input || {}, field)
    if (value === undefined) continue
    // A path field points into the provider's overall envelope. Its content is shared rather than
    // path-local so repeated path aliases cannot duplicate one large body into every record.
    addCandidate(value)
  }
  for (const field of normalization.pathArrayFields || []) {
    if (pathCandidateLimitReached) break
    if (field === mutationEditCollectionField) continue
    const value = getAtPath(input || {}, field)
    if (value === undefined) continue
    if (typeof value !== 'string' && !Array.isArray(value)) {
      issues.push(issue('PATH_ARRAY_INVALID'))
      continue
    }
    const entries = typeof value === 'string' ? [value] : value
    if (pathCandidateCount + entries.length > limits.maximumPathCandidates) {
      issues.push(mutationIssue('PATH_COUNT_EXCEEDED', field))
      pathCandidateLimitReached = true
      break
    }
    for (const entry of entries) {
      if (typeof entry === 'string') {
        addCandidate(entry)
        continue
      }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        issues.push(issue('PATH_ENTRY_INVALID'))
        continue
      }
      const supplied = ['file_path', 'path'].filter((key) => entry[key] !== undefined)
      if (!supplied.length) {
        issues.push(issue('PATH_ENTRY_INVALID'))
        continue
      }
      for (const key of supplied) addCandidate(entry[key], entry, true)
      if (pathCandidateLimitReached) break
    }
  }

  // Apply-patch and unified-diff transports carry paths outside the ordinary provider fields.
  // Parse every declared old/new path so one valid header cannot conceal a later escaping path.
  for (const patch of mutation?.engine === 'unified-diff-v1' || mutation?.engine === 'codex-apply-patch-v1'
    ? []
    : patchValues(input || {}, toolInput)) {
    if (pathCandidateLimitReached) break
    if (Buffer.byteLength(patch, 'utf8') > MAX_PROPOSED_TEXT_BYTES) {
      issues.push(mutationIssue('PATCH_TOO_LARGE', '<write-patch>'))
      continue
    }
    let patchRecord = null
    const flushPatchRecord = () => {
      if (!patchRecord) return
      addPatchCandidate(patchRecord.path, { new_string: patchRecord.added.join('\n') }, true)
      patchRecord = null
    }
    let lines
    try {
      lines = boundedPatchLines(patch.replaceAll('\r\n', '\n'), {
        limits,
        checkpoint,
        label: 'fallback-patch',
      })
    } catch (error) {
      if (!(error instanceof ProviderWriteStateError)) throw error
      issues.push(mutationIssue(error.code || 'MUTATION_EDIT_COUNT_EXCEEDED', '<write-patch>'))
      continue
    }
    for (const [index, line] of lines.entries()) {
      if ((index & 255) === 0) normalizationCheckpoint(checkpoint, `fallback-patch:line:${index + 1}`)
      const applyHeader = line.match(/^\*\*\* (?:Add|Update|Delete) File: ?(.*)$/)
      const moveHeader = line.match(/^\*\*\* Move to: ?(.*)$/)
      const oldHeader = lines[index + 1]?.startsWith('+++') ? line.match(/^--- ?(.*)$/) : null
      const newHeader = lines[index - 1]?.startsWith('---') ? line.match(/^\+\+\+ ?(.*)$/) : null
      if (applyHeader || moveHeader) {
        flushPatchRecord()
        patchRecord = { path: (applyHeader || moveHeader)[1], added: [] }
      } else if (oldHeader) {
        flushPatchRecord()
        const path = oldHeader[1].split('\t', 1)[0].replace(/^a\//, '')
        if (path !== '/dev/null') addPatchCandidate(path)
      } else if (newHeader) {
        flushPatchRecord()
        const path = newHeader[1].split('\t', 1)[0].replace(/^b\//, '')
        if (path !== '/dev/null') patchRecord = { path, added: [] }
      } else if (patchRecord && line.startsWith('+') && !line.startsWith('+++')) {
        patchRecord.added.push(line.slice(1))
      }
      if (pathCandidateLimitReached) break
    }
    flushPatchRecord()
  }

  const recordsByPath = new Map()
  for (const candidate of candidates) {
    const record = recordsByPath.get(candidate.path) || {
      path: candidate.path,
      specificContent: [],
      sources: [],
    }
    if (candidate.content) record.specificContent.push(candidate.content)
    if (Object.keys(candidate.source).length) record.sources.push(candidate.source)
    recordsByPath.set(candidate.path, record)
  }
  const records = [...recordsByPath.values()]
    .sort((left, right) => compareUtf8Bytes(left.path, right.path))
    .map((record) => ({
      path: record.path,
      content: [...new Set(record.specificContent)].join('\n'),
      source: record.sources.find((item) => entryContent(item)) || record.sources[0] || {},
    }))
  const canonicalIssues = uniqueSortedIssues(issues)
  normalizationCheckpoint(checkpoint, 'normalize:complete')
  return {
    normalized: {
      provider: provider?.id || null,
      event,
      tool,
      operation,
      paths: records.map((record) => record.path),
      blocked: canonicalIssues.length > 0,
      evidence: canonicalIssues.map((value) => value.evidence),
    },
    records,
    sharedContent,
    issues: canonicalIssues,
    mutation,
  }
}

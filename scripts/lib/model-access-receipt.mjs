import { createHash } from 'node:crypto'
import { isAbsolute, relative, resolve, sep } from 'node:path'

function fail(message) {
  throw new Error(`model access receipt blocked:${message}`)
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
}

function canonical(value) {
  return JSON.stringify(stable(value))
}

function parseJsonLines(stdout, label) {
  const rows = []
  for (const [index, line] of String(stdout).split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch (error) { fail(`${label} line ${index + 1} is invalid JSON:${error.message}`) }
  }
  return rows
}

function normalizeSelector(selector, snapshotRoot) {
  if (typeof selector !== 'string' || !selector.trim()) return '[implicit-root]'
  const value = selector.trim()
  if (isAbsolute(value)) {
    const rel = relative(resolve(snapshotRoot), resolve(value))
    if (rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) return rel.split(sep).join('/')
    return `[external:${digest(value)}]`
  }
  if (value.includes('\\') || value.split('/').some((part) => part === '..')) return `[escape:${digest(value)}]`
  const normalized = value.replace(/^\.\//, '').replace(/\/$/, '')
  return normalized || '.'
}

function collectClaudeToolUses(value, output, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  if (!Array.isArray(value) && value.type === 'tool_use' && typeof value.name === 'string') output.push(value)
  if (Array.isArray(value)) for (const item of value) collectClaudeToolUses(item, output, seen)
  else for (const item of Object.values(value)) collectClaudeToolUses(item, output, seen)
}

function claudeTrace(stdout, snapshotRoot, coverage) {
  const events = parseJsonLines(stdout, 'Claude stream-json')
  const uses = []
  for (const event of events) collectClaudeToolUses(event, uses)
  const content = new Set()
  const outside = new Set()
  const forbidden = new Set()
  let nonContentToolUseCount = 0
  for (const use of uses) {
    if (use.name === 'Read' || use.name === 'Grep') {
      const selector = normalizeSelector(use.name === 'Read' ? use.input?.file_path : use.input?.path, snapshotRoot)
      if (coverage.has(selector)) content.add(selector)
      else outside.add(selector)
    } else if (use.name === 'Glob') nonContentToolUseCount += 1
    else forbidden.add(use.name)
  }
  return {
    traceFormat: 'claude-stream-json',
    contentAccessPaths: [...content].sort(),
    outsideCoveragePaths: [...outside].sort(),
    forbiddenToolUses: [...forbidden].sort(),
    nonContentToolUseCount,
  }
}

function codexTrace(stdout) {
  const events = parseJsonLines(stdout, 'Codex JSONL')
  const forbidden = new Set()
  for (const event of events) {
    const type = event?.item?.type ?? event?.type ?? ''
    if (/file[_-]?change|web[_-]?search|mcp[_-]?tool/i.test(type)) forbidden.add(type)
  }
  return {
    traceFormat: 'codex-jsonl-unverifiable',
    contentAccessPaths: [],
    outsideCoveragePaths: [],
    forbiddenToolUses: [...forbidden].sort(),
    nonContentToolUseCount: events.length,
  }
}

export function buildModelAccessReceipt({ providerId, stdout, snapshotRoot, coveragePaths, coverageInventoryDigest } = {}) {
  if (!Array.isArray(coveragePaths) || coveragePaths.length === 0
    || new Set(coveragePaths).size !== coveragePaths.length) fail('coverage paths must be a non-empty unique array')
  if (typeof stdout !== 'string' || typeof snapshotRoot !== 'string' || !snapshotRoot) fail('trace bytes/snapshot root are unavailable')
  const coverage = new Set(coveragePaths)
  const trace = providerId === 'claude'
    ? claudeTrace(stdout, snapshotRoot, coverage)
    : providerId === 'codex' ? codexTrace(stdout) : {
        traceFormat: 'unavailable',
        contentAccessPaths: [],
        outsideCoveragePaths: [],
        forbiddenToolUses: [],
        nonContentToolUseCount: 0,
      }
  const missingPaths = coveragePaths.filter((path) => !trace.contentAccessPaths.includes(path)).sort()
  const verified = trace.traceFormat === 'claude-stream-json'
    && missingPaths.length === 0
    && trace.outsideCoveragePaths.length === 0
    && trace.forbiddenToolUses.length === 0
  return {
    schemaVersion: 1,
    status: verified ? 'verified' : 'coverage-unverified',
    traceFormat: trace.traceFormat,
    traceSha256: digest(stdout),
    traceBytes: Buffer.byteLength(stdout),
    coverageInventoryDigest,
    contentAccessPaths: trace.contentAccessPaths,
    missingPaths,
    outsideCoveragePaths: trace.outsideCoveragePaths,
    forbiddenToolUses: trace.forbiddenToolUses,
    nonContentToolUseCount: trace.nonContentToolUseCount,
  }
}

export function validateModelAccessReceipt(receipt, options = {}) {
  const expected = buildModelAccessReceipt(options)
  if (canonical(receipt) !== canonical(expected)) fail('access receipt differs from the provider trace and exact frozen coverage')
  if (receipt.outsideCoveragePaths.length) fail(`provider accessed content outside exact coverage:${receipt.outsideCoveragePaths.join(',')}`)
  if (receipt.forbiddenToolUses.length) fail(`provider invoked forbidden tools:${receipt.forbiddenToolUses.join(',')}`)
  return true
}

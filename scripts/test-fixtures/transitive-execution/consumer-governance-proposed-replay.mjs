#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

let raw = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) raw += chunk

try {
  const payload = JSON.parse(raw)
  const state = payload.governance_write_state
  const nested = payload.tool_input && payload.tool_input.governance_write_state
  const absolute = payload.tool_input && payload.tool_input.file_path
  const relative = path.relative(process.env.GOVERNANCE_PROJECT_DIR, absolute).split(path.sep).join('/')
  const expected = fs.readFileSync(absolute, 'utf8')
  if (
    process.env.GOVERNANCE_WRITE_STATE_TRUST !== 'runner-v1'
    || process.env.GOVERNANCE_TRANSCRIPT_TRUST !== 'unavailable'
    || !state
    || JSON.stringify(state) !== JSON.stringify(nested)
    || state.schemaVersion !== 1
    || state.path !== relative
    || state.kind !== 'text'
    || state.content !== expected
  ) throw new Error('trusted proposed state mismatch')
} catch (error) {
  process.stderr.write(`GOVERNANCE_INTEGRITY:proposed replay probe:${error.message}\n`)
  process.exitCode = 70
}

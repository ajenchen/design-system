import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

process.env.GOVERNANCE_TOOL_INPUT = 'n'.repeat(4 * 1024 * 1024)
process.env.CODEX_TOOL_INPUT = 'c'.repeat(4 * 1024 * 1024)
process.env.UNREGISTERED_TOOL_INPUT = 'u'.repeat(4 * 1024 * 1024)
await import(pathToFileURL(resolve('managed-hook-dispatcher.mjs')).href)

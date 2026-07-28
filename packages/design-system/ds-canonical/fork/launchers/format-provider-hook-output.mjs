#!/usr/bin/env node

import {
  formatProviderHookContext,
  formatProviderStopDecision,
} from './provider-hook-output-transport.mjs'

const argument = (name) => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : ''
}

const kind = argument('--kind')
const transport = argument('--transport')
const event = argument('--event')
let message = ''
for await (const chunk of process.stdin) message += chunk

let output
if (kind === 'context') output = formatProviderHookContext({ transport, event, message })
else if (kind === 'stop') output = formatProviderStopDecision({ transport, reason: message })
else throw new Error(`provider hook output kind is unsupported:${kind || '<missing>'}`)

if (output === null) throw new Error(`provider hook output transport requires a non-JSON channel:${transport}`)
process.stdout.write(`${JSON.stringify(output)}\n`)

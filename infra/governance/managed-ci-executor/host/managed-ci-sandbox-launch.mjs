#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createConnection } from 'node:net'
import { readFileSync } from 'node:fs'

// This is deliberately a capability-free client. Only the independently
// administered runner sandbox daemon may create namespaces, mounts, proxies,
// containers, or receipts. Candidate bytes and subject images never receive
// the daemon socket.

function fail(message) { throw new Error(`managed CI host launcher blocked:${message}`) }

function parse(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || !value || value.startsWith('--') || key in values) fail('arguments must be unique --name value pairs')
    values[key] = value
  }
  return values
}

function digestFile(path) { return createHash('sha256').update(readFileSync(path)).digest('hex') }

async function main() {
  const args = parse(process.argv.slice(2))
  const required = ['--class', '--image', '--policy', '--policy-sha256', '--repository-root', '--input-root', '--output-root', '--receipt-root', '--observation-receipt', '--request']
  for (const key of required) if (!args[key]) fail(`missing ${key}`)
  if (digestFile(args['--policy']) !== args['--policy-sha256']) fail('host sandbox policy digest differs')
  const request = JSON.parse(readFileSync(args['--request'], 'utf8'))
  const envelope = JSON.stringify({ schemaVersion: 1, kind: 'managed-ci-host-sandbox-request', arguments: args, request })
  const socketPath = process.env.MANAGED_CI_SANDBOXD_SOCKET
  if (socketPath !== '/run/user/65532/qijenchen-managed-ci-sandboxd.sock') fail('canonical sandbox daemon socket is unavailable')
  await new Promise((resolve, reject) => {
    const socket = createConnection(socketPath)
    let response = ''
    socket.setEncoding('utf8')
    socket.on('connect', () => socket.end(`${envelope}\n`))
    socket.on('data', chunk => { response += chunk })
    socket.on('error', reject)
    socket.on('end', () => {
      try {
        const result = JSON.parse(response)
        if (result?.status !== 'complete' || result?.independentObservation !== true) fail('sandbox daemon did not return independently observed completion')
        process.stdout.write(`${JSON.stringify(result)}\n`)
        resolve()
      } catch (error) { reject(error) }
    })
  })
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })

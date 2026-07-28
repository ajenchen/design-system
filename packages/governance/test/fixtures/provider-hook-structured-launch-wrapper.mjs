import { spawnSync } from 'node:child_process'

let requestText = ''
for await (const chunk of process.stdin) requestText += chunk
const request = JSON.parse(requestText)
if (
  request?.command !== '/usr/bin/env'
  || !Array.isArray(request.args)
  || !request.args.every((value) => typeof value === 'string')
  || typeof request.cwd !== 'string'
  || !request.env
  || typeof request.env !== 'object'
  || typeof request.input !== 'string'
) {
  console.error('invalid structured launch fixture request')
  process.exit(70)
}

const result = spawnSync('/usr/bin/env', request.args, {
  cwd: request.cwd,
  env: request.env,
  input: request.input,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
})
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
if (result.error) {
  console.error(result.error.message)
  process.exit(70)
}
process.exit(Number.isInteger(result.status) ? result.status : 70)

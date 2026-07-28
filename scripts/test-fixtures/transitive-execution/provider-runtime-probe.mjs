#!/usr/bin/env node
import os from 'node:os'

const mode = process.argv[2]
if (
  process.argv.length !== 3
  || !['environment', 'home', 'hang', 'ignore-sigterm', 'overflow'].includes(mode)
) {
  process.stderr.write('provider runtime probe requires one closed mode\n')
  process.exit(64)
}

if (mode === 'environment') {
  process.stdout.write(JSON.stringify(process.env))
} else if (mode === 'home') {
  process.stdout.write(JSON.stringify({
    envHome: process.env.HOME,
    osHome: os.homedir(),
  }))
} else if (mode === 'overflow') {
  process.stdout.write('x'.repeat(4096))
} else {
  if (mode === 'ignore-sigterm') process.on('SIGTERM', () => {})
  setInterval(() => {}, 1000)
}

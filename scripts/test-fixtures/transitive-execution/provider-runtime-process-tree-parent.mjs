#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

if (process.argv.length !== 2) {
  process.stderr.write('provider runtime process-tree parent accepts no arguments\n')
  process.exit(64)
}

const child = fileURLToPath(new URL('./provider-runtime-probe.mjs', import.meta.url))
spawn(process.execPath, ['--', child, 'ignore-sigterm'], {
  stdio: ['ignore', 'inherit', 'inherit'],
})
process.on('SIGTERM', () => {})
setInterval(() => {}, 1000)

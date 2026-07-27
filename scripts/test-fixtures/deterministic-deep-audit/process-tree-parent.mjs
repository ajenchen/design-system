#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2]
const marker = process.argv[3]
if (
  process.argv.length !== 4
  || !['--mode=timeout', '--mode=success'].includes(mode)
  || marker !== resolve(marker)
) {
  process.stderr.write('process-tree parent requires a closed mode and one absolute marker path\n')
  process.exit(64)
}

const grandchild = fileURLToPath(new URL('./process-tree-grandchild.mjs', import.meta.url))
const child = spawn(process.execPath, ['--', grandchild, marker], { stdio: 'ignore' })
if (mode === '--mode=success') {
  child.unref()
  setTimeout(() => {}, 50)
} else {
  process.on('SIGTERM', () => {})
  setInterval(() => {}, 1000)
}

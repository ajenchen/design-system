#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

if (process.argv.length !== 3 || process.argv[2] !== resolve(process.argv[2])) {
  process.stderr.write('process-tree grandchild requires one absolute marker path\n')
  process.exit(64)
}

const marker = process.argv[2]
process.on('SIGTERM', () => {})
setTimeout(() => writeFileSync(marker, 'orphan\n'), 1600)
setInterval(() => {}, 1000)

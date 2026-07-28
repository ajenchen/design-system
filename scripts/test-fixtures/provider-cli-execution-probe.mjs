#!/usr/bin/env node
import { lstatSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

function fail(message) {
  process.stderr.write(`provider CLI execution probe: ${message}\n`)
  process.exit(64)
}

const delimiter = process.argv.indexOf('--', 2)
if (process.argv[2] !== '--target' || delimiter !== 4 || process.argv.length < 5) {
  fail('usage: --target <absolute fixture executable> -- [args...]')
}

const target = process.argv[3]
if (typeof target !== 'string' || target !== resolve(target)) fail('target must be absolute')

const temporaryRoot = realpathSync(tmpdir())
const targetRealpath = realpathSync(target)
const targetRelative = relative(temporaryRoot, targetRealpath)
if (
  targetRelative === ''
  || targetRelative === '..'
  || targetRelative.startsWith(`..${sep}`)
  || targetRelative.includes(`${sep}..${sep}`)
) fail('target must remain inside the real temporary root')
if (!targetRelative.split(sep).some(part => part.startsWith('provider-cli-toolchain-test-'))) {
  fail('target is not inside a provider CLI toolchain fixture')
}

const info = lstatSync(target)
if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || targetRealpath !== target) {
  fail('target must be one real single-link regular file')
}
if (!['claude', 'codex', 'future-model', 'codex.js'].includes(basename(target))) {
  fail('target basename is outside the closed fixture executable set')
}

const childArguments = process.argv.slice(delimiter + 1)
process.argv.splice(1, process.argv.length - 1, target, ...childArguments)
await import(pathToFileURL(targetRealpath).href)

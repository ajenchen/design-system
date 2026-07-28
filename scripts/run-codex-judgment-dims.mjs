#!/usr/bin/env node
import { printRetiredModelResult, runRetiredModelEntrypoint } from './lib/retired-model-entrypoint.mjs'

runRetiredModelEntrypoint('scripts/run-codex-judgment-dims.mjs').then(printRetiredModelResult).catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 2
})

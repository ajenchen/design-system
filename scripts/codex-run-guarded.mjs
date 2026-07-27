#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { printRetiredModelResult, runRetiredModelEntrypoint } from './lib/retired-model-entrypoint.mjs'

export function classify(status, signal, out, lastMsg) {
  const text = out || ''
  const hasMsg = (lastMsg || '').trim().length > 0
  if (status === 0 && hasMsg) return { outcome: 'SUCCESS', action: '', code: 0 }
  const errLine = (text.match(/ERROR:\s*\{[^\n]*\}/i) || [''])[0]
  const errCtx = `${errLine}\n${status !== 0 ? text : ''}`
  const quota = /"status"\s*:\s*429|\b429 too many|too many requests|usage limit|rate[ -]?limit|quota exceeded|insufficient_quota|out of (usage )?credit|billing.{0,20}limit|you've (hit|reached|exceeded)[^.\n]{0,40}(limit|quota|credit)/i
  const auth = /"status"\s*:\s*40[13]|\bunauthorized\b|\bforbidden\b|please login|not logged in|invalid api key|authentication (failed|error)/i
  if (quota.test(errCtx)) return { outcome: 'QUOTA', action: 'Notify the user and stop; never treat quota failure as clean evidence.', code: 4 }
  if (auth.test(errCtx)) return { outcome: 'AUTH', action: 'Notify the user and stop; runtime authentication must be restored.', code: 5 }
  if (status === 0 && !hasMsg) return { outcome: 'EMPTY', action: 'No verdict was produced; never treat empty output as clean evidence.', code: 6 }
  return { outcome: 'ERROR', action: `Runtime failed${signal ? ` with ${signal}` : ''}; no evidence may be published.`, code: 7 }
}

function value(argv, name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : null
}

async function main(argv) {
  if (argv.includes('--classify')) {
    const status = Number.parseInt(value(argv, '--status') ?? '0', 10)
    const logPath = value(argv, '--log-file')
    const log = logPath ? readFileSync(logPath, 'utf8') : (value(argv, '--log-text') || '')
    const result = classify(status, null, log, value(argv, '--last-text') ?? '')
    process.stdout.write(`CODEX-OUTCOME: ${result.outcome}\n`)
    return result.code
  }
  const result = await runRetiredModelEntrypoint('scripts/codex-run-guarded.mjs', argv)
  printRetiredModelResult(result)
  return 0
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code }).catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 2
  })
}

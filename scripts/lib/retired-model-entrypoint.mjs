import { runModelDeepAudit } from '../run-model-deep-audit.mjs'

export async function runRetiredModelEntrypoint(name, argv = process.argv.slice(2), options = {}) {
  process.stderr.write(`${name} is retired; routing through scripts/run-model-deep-audit.mjs with the same fail-closed authorization contract.\n`)
  return runModelDeepAudit(argv, options)
}

export function printRetiredModelResult(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

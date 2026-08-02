#!/usr/bin/env node
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { stableStringify } from './lib/deep-audit-evidence-contract.mjs'
import { importWaivedSelfReviewBundle } from './lib/waived-self-review.mjs'

function usage() {
  return 'usage: import-waived-self-review.mjs --input <absolute-or-repository-contained-path> [--repo-root <path>] [--evidence-root <path>] [--json]'
}

function parseArgs(argv) {
  const result = { json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--json') { result.json = true; continue }
    if (!['--input', '--repo-root', '--evidence-root'].includes(token)) throw new Error(`${usage()}; unknown option:${token}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`)
    result[token.slice(2)] = value
    index += 1
  }
  if (!result.input) throw new Error(`--input is required; ${usage()}`)
  return result
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const imported = importWaivedSelfReviewBundle({
    repoRoot: args['repo-root'] ?? process.cwd(),
    explicitRoot: args['evidence-root'] ?? process.env.GOVERNANCE_EVIDENCE_ROOT ?? null,
    inputPath: args.input,
  })
  const output = {
    status: 'imported-self-attested-review',
    runId: imported.runId,
    manifestSha256: imported.manifestSha256,
    assurance: 'self-attested',
    independent: false,
    secondOpinionPerformed: false,
    relativePath: imported.relativePath,
    path: imported.path,
    sha256: imported.sha256,
    bytes: imported.bytes,
  }
  process.stdout.write(args.json
    ? `${stableStringify(output, 2)}\n`
    : `waived self-review imported:${output.runId}\npath:${output.path}\nassurance:self-attested; independent:false; second-opinion:false\n`)
  return output
}

const IS_MAIN = (() => {
  if (!process.argv[1]) return false
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
})()

if (IS_MAIN) {
  try { main() } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2 }
}

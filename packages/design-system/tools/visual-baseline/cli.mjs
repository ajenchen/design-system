#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyReviewedVisualBaseline,
  checkVisualBaseline,
  planVisualBaseline,
} from './index.mjs'
import { canonicalJson, writeAtomicFile } from '../shared/safe-filesystem.mjs'

function fail(message) {
  throw new Error(`visual baseline review CLI blocked:${message}`)
}

function parse(argv) {
  const [command, ...tokens] = argv
  if (!['plan', 'check', 'apply-reviewed'].includes(command)) fail('command must be plan, check, or apply-reviewed')
  const options = { command, root: '.', author: null, candidate: null, baseline: null, statements: null, output: null, proposal: null, review: null, expectedDigest: null }
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const next = () => {
      const value = tokens[++index]
      if (!value || value.startsWith('--')) fail(`${token} requires a value`)
      return value
    }
    if (token === '--root') options.root = next()
    else if (token === '--author') options.author = next()
    else if (token === '--candidate') options.candidate = next()
    else if (token === '--baseline') options.baseline = next()
    else if (token === '--statements') options.statements = next()
    else if (token === '--output') options.output = next()
    else if (token === '--proposal') options.proposal = next()
    else if (token === '--review') options.review = next()
    else if (token === '--expected-proposal-digest') options.expectedDigest = next()
    else fail(`unknown option:${token}`)
  }
  return options
}

function readJson(root, value, label, { required = true } = {}) {
  if (!value) {
    if (required) fail(`${label} path is required`)
    return null
  }
  try { return JSON.parse(readFileSync(resolve(root, value), 'utf8')) } catch (error) { fail(`${label} is unavailable or invalid JSON:${error.message}`) }
}

function outputPath(root, value) {
  const absoluteRoot = resolve(root)
  const path = relative(absoluteRoot, resolve(absoluteRoot, value))
  if (!path || path === '..' || path.startsWith(`..${sep}`)) fail('output must be a file below --root')
  return path.split(sep).join('/')
}

export function runVisualBaselineCli(argv = process.argv.slice(2)) {
  const options = parse(argv)
  if (options.command === 'plan') {
    if (!options.author || !options.candidate || !options.baseline || !options.statements) fail('plan requires --author, --candidate, --baseline, and --statements')
    if (options.proposal || options.review || options.expectedDigest) fail('plan does not accept review/apply evidence options')
    const statements = readJson(options.root, options.statements, 'visual diff statements')
    const proposal = planVisualBaseline({ repoRoot: options.root, authorIdentity: options.author, candidateRoot: options.candidate, baselineRoot: options.baseline, statements })
    const body = Buffer.from(canonicalJson(proposal))
    if (options.output) {
      writeAtomicFile(resolve(options.root), outputPath(options.root, options.output), body, 'visual baseline proposal', fail)
      process.stdout.write(canonicalJson({ proposalDigest: proposal.proposalDigest, changedImages: proposal.images.filter((row) => row.action !== 'unchanged').length, output: options.output }))
    } else process.stdout.write(body)
    return 0
  }
  if (options.author || options.candidate || options.baseline || options.statements || options.output) fail(`${options.command} does not accept planning inputs`)
  const proposal = readJson(options.root, options.proposal, 'visual baseline proposal')
  const review = readJson(options.root, options.review, 'visual baseline review', { required: options.command === 'apply-reviewed' })
  const result = options.command === 'check'
    ? checkVisualBaseline({ repoRoot: options.root, proposal, review })
    : applyReviewedVisualBaseline({ repoRoot: options.root, proposal, review, expectedProposalDigest: options.expectedDigest })
  if (options.command === 'check' && result.state === 'pending' && !review) {
    fail('pending visual changes require --review; status inspection without review is not a successful gate')
  }
  process.stdout.write(canonicalJson(result))
  return 0
}

function isMainModule(argvPath = process.argv[1]) {
  if (!argvPath) return false
  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return resolve(argvPath) === resolve(fileURLToPath(import.meta.url))
  }
}

if (isMainModule()) {
  try { process.exitCode = runVisualBaselineCli() } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

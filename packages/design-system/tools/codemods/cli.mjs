#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BETA_84_MIGRATION_ID,
  applyCodemodProposal,
  checkCodemodProposal,
  planCodemod,
} from './index.mjs'
import { canonicalJson, writeAtomicFile } from '../shared/safe-filesystem.mjs'

function fail(message) {
  throw new Error(`design-system codemod CLI blocked:${message}`)
}

function parse(argv) {
  const [migrationId, command, ...tokens] = argv
  if (migrationId !== BETA_84_MIGRATION_ID) fail(`first argument must be ${BETA_84_MIGRATION_ID}`)
  if (!['plan', 'check', 'apply'].includes(command)) fail('command must be plan, check, or apply')
  const options = { migrationId, command, root: '.', sources: [], output: null, proposal: null, expectedDigest: null }
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const next = () => {
      const value = tokens[++index]
      if (!value || value.startsWith('--')) fail(`${token} requires a value`)
      return value
    }
    if (token === '--root') options.root = next()
    else if (token === '--source') options.sources.push(next())
    else if (token === '--output') options.output = next()
    else if (token === '--proposal') options.proposal = next()
    else if (token === '--expected-proposal-digest') options.expectedDigest = next()
    else fail(`unknown option:${token}`)
  }
  return options
}

function relativeOutput(root, value) {
  const absoluteRoot = resolve(root)
  const absolute = resolve(absoluteRoot, value)
  const path = relative(absoluteRoot, absolute)
  if (!path || path === '..' || path.startsWith(`..${sep}`)) fail('output must be a file below --root')
  return path.split(sep).join('/')
}

function readProposal(root, value) {
  if (!value) fail('--proposal is required')
  const absolute = resolve(root, value)
  let proposal
  try { proposal = JSON.parse(readFileSync(absolute, 'utf8')) } catch (error) { fail(`proposal is unavailable or invalid JSON:${error.message}`) }
  return proposal
}

export function runCodemodCli(argv = process.argv.slice(2)) {
  const options = parse(argv)
  if (options.command === 'plan') {
    if (options.proposal || options.expectedDigest) fail('plan does not accept apply/check evidence options')
    const proposal = planCodemod({ repoRoot: options.root, sourceRoots: options.sources.length ? options.sources : ['.'] })
    const body = Buffer.from(canonicalJson(proposal))
    if (options.output) writeAtomicFile(resolve(options.root), relativeOutput(options.root, options.output), body, 'codemod proposal', fail)
    else process.stdout.write(body)
    if (proposal.blockers.length) {
      process.stderr.write(`codemod blocked: ${proposal.blockers.length} manual blocker(s); proposal ${proposal.proposalDigest}\n`)
      return 2
    }
    if (options.output) process.stdout.write(`${canonicalJson({ proposalDigest: proposal.proposalDigest, files: proposal.files.length, output: options.output })}`)
    return 0
  }
  if (options.sources.length || options.output) fail(`${options.command} does not accept --source or --output`)
  const proposal = readProposal(options.root, options.proposal)
  const result = options.command === 'check'
    ? checkCodemodProposal({ repoRoot: options.root, proposal })
    : applyCodemodProposal({ repoRoot: options.root, proposal, expectedProposalDigest: options.expectedDigest })
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
  try { process.exitCode = runCodemodCli() } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

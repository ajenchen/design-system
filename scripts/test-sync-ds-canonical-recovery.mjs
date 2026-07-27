#!/usr/bin/env node
// Destructive recovery/idempotence meta-test, isolated in a disposable repository fixture.
// packages/design-system/ds-canonical is authoritative; only generated provider views are
// corrupted. The real repository and its dirty worktree are fingerprinted, never rewritten.

import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadGovernanceBuildGraph, stageSourceMatches } from './governance-build-graph.mjs'
import {
  CLAUDE_PERMISSION_POLICY_SCHEMA,
  CLAUDE_PERMISSION_POLICY_SOURCE,
} from './lib/claude-permission-policy.mjs'

const REAL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROVIDER_ADAPTER_STAGE = loadGovernanceBuildGraph().stages.find((stage) => stage.id === 'provider-adapters')
if (!PROVIDER_ADAPTER_STAGE) throw new Error('governance build graph is missing the provider-adapters stage')
const FIXTURE_ROOT = mkdtempSync(join(tmpdir(), 'ds-canonical-recovery-'))
const TRANSACTION_PROBE_DIRECTORY = join(FIXTURE_ROOT, '.recovery-probes')
const TRANSACTION_PROBE_PATH = join(TRANSACTION_PROBE_DIRECTORY, 'transaction-probe.mjs')
const TRANSACTION_PROBE_OPERATIONS = new Set([
  'caught-after-target',
  'crash-after-target',
  'pause-after-journal',
  'recover',
  'recover-required',
])
const transactionModuleUrl = () => pathToFileURL(join(FIXTURE_ROOT, 'scripts/lib/canonical-sync-transaction.mjs')).href

mkdirSync(TRANSACTION_PROBE_DIRECTORY, { recursive: true, mode: 0o700 })
writeFileSync(TRANSACTION_PROBE_PATH, `
import {
  recoverInterruptedCanonicalSync,
  synchronizeCanonicalViews,
} from ${JSON.stringify(transactionModuleUrl())}

const operation = process.argv[2]
if (operation === 'caught-after-target') {
  synchronizeCanonicalViews({ failureInjector(event) {
    if (event.phase === 'after-target' && event.entry.path === '.claude/rules') {
      throw new Error('injected caught commit failure')
    }
  } })
} else if (operation === 'crash-after-target') {
  synchronizeCanonicalViews({ failureInjector(event) {
    if (event.phase === 'after-target' && event.entry.path === '.claude/rules') process.exit(86)
  } })
} else if (operation === 'pause-after-journal') {
  synchronizeCanonicalViews({ failureInjector(event) {
    if (event.phase === 'after-journal') {
      process.stdout.write('JOURNAL_READY\\n')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000)
    }
  } })
} else if (operation === 'recover') {
  recoverInterruptedCanonicalSync()
} else if (operation === 'recover-required') {
  const result = recoverInterruptedCanonicalSync()
  if (!result.recovered) process.exit(87)
} else {
  throw new Error('unsupported transaction probe operation')
}
`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })

function copy(relativePath) {
  const normalized = relativePath.replace(/\/$/, '')
  const source = join(REAL_ROOT, normalized)
  const destination = join(FIXTURE_ROOT, normalized)
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(source, destination, { recursive: true, preserveTimestamps: false })
}

function copyProviderAdapterStageSources() {
  // This fixture used to maintain a handwritten subset of sync dependencies. That
  // silently diverged when the Claude permission-policy schema became a real
  // provider-adapters input. Materialize the resolved build-stage corpus instead:
  // source resolvers, global inputs, schemas, helpers, and future declared inputs
  // now enter the recovery fixture through the same ownership graph as production.
  const declarations = PROVIDER_ADAPTER_STAGE.sources.filter((source) => !PROVIDER_ADAPTER_STAGE.sources.some((parent) => (
    parent !== source && parent.endsWith('/') && source.startsWith(parent)
  )))
  for (const declaration of declarations) copy(declaration)
  for (const exclusion of PROVIDER_ADAPTER_STAGE.sourceExcludes) {
    rmSync(join(FIXTURE_ROOT, exclusion.replace(/\/$/, '')), { recursive: true, force: true })
  }
  return declarations
}

function treeFingerprint(root) {
  const records = []
  const visit = (absolute, rel = '') => {
    const stat = lstatSync(absolute)
    if (stat.isSymbolicLink()) {
      records.push(`${rel}:symlink`)
      return
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) visit(join(absolute, name), rel ? `${rel}/${name}` : name)
      return
    }
    records.push(`${rel}:${stat.mode & 0o777}:${createHash('sha256').update(readFileSync(absolute)).digest('hex')}`)
  }
  visit(root)
  return createHash('sha256').update(records.join('\n')).digest('hex')
}

function generatedFingerprint() {
  const records = []
  for (const relativePath of [
    '.agents', '.claude', '.codex', 'hooks',
    'generated/governance/provider-runtime-validator.mjs',
    'generated/governance/provider-hook-coverage.json',
    'packages/design-system/AGENTS.md', 'packages/design-system/CLAUDE.md',
  ]) {
    const absolute = join(FIXTURE_ROOT, relativePath)
    records.push(`${relativePath}:${existsSync(absolute) ? treeFingerprint(absolute) : 'missing'}`)
  }
  return createHash('sha256').update(records.join('\n')).digest('hex')
}

function runTransactionProbe(operation) {
  if (!TRANSACTION_PROBE_OPERATIONS.has(operation) || operation === 'pause-after-journal') {
    throw new Error(`unsupported synchronous transaction probe operation:${operation}`)
  }
  try {
    const out = execFileSync(process.execPath, ['--', '.recovery-probes/transaction-probe.mjs', operation], {
      cwd: FIXTURE_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

function spawnPausedTransaction() {
  const child = spawn(process.execPath, ['--', '.recovery-probes/transaction-probe.mjs', 'pause-after-journal'], {
    cwd: FIXTURE_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return new Promise((resolveReady, reject) => {
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`paused transaction did not become ready:${stdout}\n${stderr}`))
    }, 15000)
    child.stdout.on('data', chunk => {
      stdout += chunk
      if (stdout.includes('JOURNAL_READY')) {
        clearTimeout(timer)
        resolveReady(child)
      }
    })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', code => {
      if (!stdout.includes('JOURNAL_READY')) {
        clearTimeout(timer)
        reject(new Error(`paused transaction exited early(${code}):${stdout}\n${stderr}`))
      }
    })
  })
}

function waitForExit(child) {
  return new Promise(resolveExit => child.once('exit', (code, signal) => resolveExit({ code, signal })))
}

function run(args = []) {
  const check = args.length === 1 && args[0] === '--check'
  if (args.length && !check) throw new Error(`unsupported provider-adapters fixture arguments:${args.join(' ')}`)
  const command = check ? PROVIDER_ADAPTER_STAGE.check : PROVIDER_ADAPTER_STAGE.generate
  const expectedCommand = check
    ? ['node', 'scripts/sync-ds-canonical.mjs', '--check']
    : ['node', 'scripts/sync-ds-canonical.mjs']
  if (JSON.stringify(command) !== JSON.stringify(expectedCommand)) {
    throw new Error(`provider-adapters fixture command drifted:${command.join(' ')}`)
  }
  try {
    const out = check
      ? execFileSync(process.execPath, ['--', 'scripts/sync-ds-canonical.mjs', '--check'], {
        cwd: FIXTURE_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      : execFileSync(process.execPath, ['--', 'scripts/sync-ds-canonical.mjs'], {
        cwd: FIXTURE_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    return { code: 0, out }
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

const failures = []
function assert(condition, message) {
  if (condition) console.log(`  ✓ ${message}`)
  else {
    console.error(`  ✗ ${message}`)
    failures.push(message)
  }
}

const realCanonical = join(REAL_ROOT, 'packages/design-system/ds-canonical')
const realCanonicalBefore = treeFingerprint(realCanonical)

try {
  console.log('0. Materialize the resolved provider-adapters build-stage inputs')
  const fixtureDeclarations = copyProviderAdapterStageSources()
  assert(fixtureDeclarations.length > 0, 'fixture dependency corpus is derived from the non-empty provider-adapters stage')
  for (const dependency of [CLAUDE_PERMISSION_POLICY_SOURCE, CLAUDE_PERMISSION_POLICY_SCHEMA]) {
    assert(stageSourceMatches(PROVIDER_ADAPTER_STAGE, dependency), `${dependency} is owned by the provider-adapters input graph`)
    assert(existsSync(join(FIXTURE_ROOT, dependency)), `${dependency} is materialized in the isolated fixture`)
  }
  // The copied generator has a declared root Ajv dependency. Reuse the already-installed,
  // read-only dependency tree without copying or mutating it.
  symlinkSync(join(REAL_ROOT, 'node_modules'), join(FIXTURE_ROOT, 'node_modules'), 'dir')

  console.log('1. Seed disposable generated views, then require a clean baseline')
  let result = run()
  assert(result.code === 0, `fixture generation exits 0 (got ${result.code})`)
  if (result.code !== 0) throw new Error(`fixture generation failed before destructive assertions:\n${result.out}`)
  result = run(['--check'])
  assert(result.code === 0, `baseline --check exits 0 (got ${result.code})`)

  const generatedRules = join(FIXTURE_ROOT, '.claude/rules')
  const candidate = readdirSync(generatedRules).find((name) => name.endsWith('.md'))
  if (!candidate) throw new Error('fixture has no generated .claude/rules/*.md target')
  const target = join(generatedRules, candidate)
  const original = readFileSync(target)

  console.log('2. Corrupt a generated provider view; drift must be detected')
  writeFileSync(target, Buffer.concat([original, Buffer.from('\n<!-- simulated generated-view corruption -->\n')]))
  result = run(['--check'])
  assert(result.code === 1, `corrupted view --check exits 1 (got ${result.code})`)
  assert(/drift/i.test(result.out) && result.out.includes(candidate), `drift report names ${candidate}`)

  console.log('3. Write-mode regeneration must restore the view byte-for-byte')
  result = run()
  assert(result.code === 0, `recovery generation exits 0 (got ${result.code})`)
  assert(readFileSync(target).equals(original), 'corrupted provider view is restored from ds-canonical')
  assert(run(['--check']).code === 0, 'post-recovery --check exits 0')

  console.log('4. A second generation must be idempotent')
  const beforeSecondWrite = generatedFingerprint()
  result = run()
  assert(result.code === 0, `second generation exits 0 (got ${result.code})`)
  assert(generatedFingerprint() === beforeSecondWrite, 'second generation leaves every managed byte and mode unchanged')

  console.log('5. Deleting a generated view must be detected and restored')
  unlinkSync(target)
  assert(run(['--check']).code === 1, 'deleted view --check exits 1')
  assert(run().code === 0, 'generation after deletion exits 0')
  assert(existsSync(target) && readFileSync(target).equals(original), 'deleted view is recreated byte-for-byte')
  assert(run(['--check']).code === 0, 'final fixture --check exits 0')

  console.log('6. A caught mid-commit failure must roll back the exact pre-transaction state')
  writeFileSync(target, Buffer.concat([original, Buffer.from('\n<!-- preserve this dirty pre-transaction state -->\n')]))
  const dirtyBeforeFailure = generatedFingerprint()
  result = runTransactionProbe('caught-after-target')
  assert(result.code !== 0, `caught failure probe exits non-zero (got ${result.code})`)
  assert(generatedFingerprint() === dirtyBeforeFailure, 'caught failure restores every pre-transaction byte and mode')
  assert(!existsSync(join(FIXTURE_ROOT, '.governance-sync-journal.json')), 'caught failure removes the recovery journal after verified rollback')

  console.log('7. A concurrent checker cannot roll back a live owner; unknown post-journal content is preserved')
  const dirtyTargetBody = readFileSync(target)
  const paused = await spawnPausedTransaction()
  const liveJournalPath = join(FIXTURE_ROOT, '.governance-sync-journal.json')
  assert(existsSync(liveJournalPath), 'live owner published its complete durable journal')
  result = run(['--check'])
  assert(result.code === 1 && /--check is read-only.*--recover/.test(result.out), 'concurrent --check blocks instead of rolling back the live owner')
  assert(generatedFingerprint() === dirtyBeforeFailure, 'concurrent --check leaves the live transaction and repository untouched')
  const liveJournal = JSON.parse(readFileSync(liveJournalPath, 'utf8'))
  const pausedExit = waitForExit(paused)
  paused.kill('SIGKILL')
  await pausedExit
  const displacedTransactionRoot = `${liveJournal.transactionRoot}.displaced`
  renameSync(liveJournal.transactionRoot, displacedTransactionRoot)
  const displacedFingerprint = treeFingerprint(displacedTransactionRoot)
  symlinkSync(displacedTransactionRoot, liveJournal.transactionRoot, 'dir')
  result = runTransactionProbe('recover')
  assert(result.code !== 0 && /real sibling directory|symbolic/i.test(result.out), 'recovery rejects a symlinked capability-bound transaction root')
  assert(treeFingerprint(displacedTransactionRoot) === displacedFingerprint, 'transaction-root symlink rejection does not touch the external target')
  rmSync(liveJournal.transactionRoot, { force: true })
  renameSync(displacedTransactionRoot, liveJournal.transactionRoot)
  writeFileSync(target, Buffer.concat([dirtyTargetBody, Buffer.from('\n<!-- unknown post-journal edit -->\n')]))
  const unknownFingerprint = generatedFingerprint()
  result = runTransactionProbe('recover')
  assert(result.code !== 0 && /unknown post-journal content/.test(result.out), 'recovery blocks on content matching neither before-image nor staged after-image')
  assert(generatedFingerprint() === unknownFingerprint, 'blocked recovery makes zero partial restore mutations')
  assert(existsSync(liveJournalPath) && existsSync(liveJournal.transactionRoot), 'blocked recovery retains journal and backups')
  writeFileSync(target, dirtyTargetBody)
  result = runTransactionProbe('recover-required')
  assert(result.code === 0 && generatedFingerprint() === dirtyBeforeFailure, 'recovery succeeds after unknown content is explicitly reconciled')

  console.log('8. An uncatchable interruption must leave a durable journal and recover exactly next run')
  result = runTransactionProbe('crash-after-target')
  assert(result.code === 86, `uncatchable interruption probe exits 86 (got ${result.code})`)
  const journalPath = join(FIXTURE_ROOT, '.governance-sync-journal.json')
  assert(existsSync(journalPath), 'uncatchable interruption leaves a durable recovery journal')
  const interruptedFingerprint = generatedFingerprint()
  assert(interruptedFingerprint !== dirtyBeforeFailure, 'interruption occurred after at least one managed target changed')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  assert(existsSync(journal.transactionRoot), 'journal capability-bound sibling backup survives interruption')
  const journalBeforeCheck = readFileSync(journalPath)
  result = run(['--check'])
  assert(result.code === 1 && /--check is read-only.*--recover/.test(result.out), 'pure --check reports the interrupted transaction without recovering it')
  assert(generatedFingerprint() === interruptedFingerprint, 'pure --check leaves interrupted generated targets byte-for-byte untouched')
  assert(readFileSync(journalPath).equals(journalBeforeCheck) && existsSync(journal.transactionRoot), 'pure --check leaves the journal and recovery capability untouched')
  result = runTransactionProbe('recover-required')
  assert(result.code === 0, `next-run recovery exits 0 (got ${result.code})`)
  assert(generatedFingerprint() === dirtyBeforeFailure, 'crash recovery restores the exact dirty pre-transaction snapshot')
  assert(!existsSync(journalPath) && !existsSync(journal.transactionRoot), 'verified recovery removes journal and transaction backup')

  console.log('9. A normal transaction repairs drift after recovery and remains idempotent')
  assert(run().code === 0, 'normal transaction after crash recovery exits 0')
  assert(readFileSync(target).equals(original), 'normal transaction repairs the intentionally preserved dirty view')
  assert(run(['--check']).code === 0, 'post-transaction --check exits 0')

  console.log('10. A symlinked journal is rejected without following or modifying its target')
  const externalJournal = join(FIXTURE_ROOT, 'external-journal-sentinel.json')
  writeFileSync(externalJournal, '{"sentinel":true}\n')
  const externalBefore = readFileSync(externalJournal)
  symlinkSync(externalJournal, join(FIXTURE_ROOT, '.governance-sync-journal.json'))
  result = runTransactionProbe('recover')
  assert(result.code !== 0 && /symlink/i.test(result.out), 'symlinked recovery journal is rejected')
  assert(readFileSync(externalJournal).equals(externalBefore), 'symlinked journal target remains byte-for-byte untouched')
  rmSync(join(FIXTURE_ROOT, '.governance-sync-journal.json'), { force: true })
} finally {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true })
}

assert(treeFingerprint(realCanonical) === realCanonicalBefore, 'real ds-canonical SSOT remained byte-for-byte untouched')

if (failures.length) {
  console.error(`\n❌ isolated sync recovery/idempotence test failed (${failures.length})`)
  process.exit(1)
}
console.log('\n✅ isolated sync recovery/idempotence test PASS')

#!/usr/bin/env node
// Isolated governance-tamper adversarial tests. Live repository bytes/index are
// fingerprinted before and after; all intentional mutations stay in system temp.
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import {
  assertGitVisibleWorktreeUnchanged,
  captureGitVisibleWorktree,
} from './lib/worktree-fingerprint.mjs'

const REPO = process.cwd()
const CHECKER = resolve(REPO, 'scripts/check-governance-tamper.mjs')
const CONCURRENT_WRITER = resolve(
  REPO,
  'scripts/test-fixtures/transitive-execution/governance-tamper-concurrent-writer.mjs',
)
const ENVIRONMENT_ROOT = mkdtempSync(join(tmpdir(), 'governance-tamper-environment-'))
const ENVIRONMENT_HOME = join(ENVIRONMENT_ROOT, 'home')
const ENVIRONMENT_TMP = join(ENVIRONMENT_ROOT, 'tmp')
const ENVIRONMENT_XDG = join(ENVIRONMENT_ROOT, 'xdg')
mkdirSync(ENVIRONMENT_HOME)
mkdirSync(ENVIRONMENT_TMP)
mkdirSync(ENVIRONMENT_XDG)
let environmentCleaned = false
function cleanupEnvironment() {
  if (environmentCleaned) return
  environmentCleaned = true
  rmSync(ENVIRONMENT_ROOT, { recursive: true, force: true })
}
process.once('exit', cleanupEnvironment)
const CLOSED_ENVIRONMENT = Object.freeze({
  HOME: ENVIRONMENT_HOME,
  LANG: 'C',
  LC_ALL: 'C',
  NO_COLOR: '1',
  PATH: '',
  TMPDIR: ENVIRONMENT_TMP,
  TZ: 'UTC',
  XDG_CONFIG_HOME: ENVIRONMENT_XDG,
})
const TIMEOUT_MS = 60_000
const MAX_BUFFER = 8 * 1024 * 1024
const TRANSITION_NOTE = 'Transition markers are immutable audit metadata only; they do not authenticate a reviewer or grant approval. When external trust is activated, authorization is enforced separately by the protected-base privileged-change verifier against a valid commit-bound privileged-change authorization. Every behavior change requires one header marker @preflight-transition(from-revision:<old revision> from:<old behavior digest> to:<new behavior digest> audit-ref:<change reference> reason:<why>).'
const liveFingerprint = captureGitVisibleWorktree(REPO)

function run(root, arguments_ = ['--check']) {
  return spawnSync(process.execPath, ['--', CHECKER, ...arguments_, '--root', root], {
    cwd: REPO,
    env: CLOSED_ENVIRONMENT,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  })
}

function detail(result) {
  if (result.error?.code === 'ETIMEDOUT') return `timed out after ${TIMEOUT_MS}ms`
  if (result.error?.code === 'ENOBUFS') return `output exceeded ${MAX_BUFFER} bytes`
  return `${result.stderr || result.stdout || result.error?.message || result.signal || ''}`.trim()
}

function transitionMarker(result, {
  auditRef = 'fixture-change-1',
  reason = 'fixture-reviewed-transition',
} = {}) {
  const match = /from-revision:([1-9]\d*) from:([0-9a-f]{64}) to:([0-9a-f]{64})/.exec(detail(result))
  if (!match) throw new Error(`required transition marker was not reported:\n${detail(result)}`)
  return `// @preflight-transition(from-revision:${match[1]} from:${match[2]} to:${match[3]} audit-ref:${auditRef} reason:${reason})`
}

let ok = true
let assertions = 0
function expectResult(result, { pass, label, pattern, status }) {
  assertions += 1
  const passed = result.status === 0
  const statusMatches = status === undefined || result.status === status
  if (passed !== pass || !statusMatches || (pattern && !pattern.test(detail(result)))) {
    console.error(`✗ ${label}`)
    const diagnostic = detail(result)
    if (diagnostic) console.error(diagnostic)
    ok = false
    return
  }
  console.log(`✓ ${label}`)
}

function expect(condition, label, detailText = '') {
  assertions += 1
  if (!condition) {
    console.error(`✗ ${label}`)
    if (detailText) console.error(detailText)
    ok = false
    return
  }
  console.log(`✓ ${label}`)
}

function writePreflight(root, {
  functionBody = 'return [label, command]',
  gates = [{ label: 'fixture gate', command: 'node fixture.mjs' }],
  prefix = '',
  afterRunner = '',
  wrapper = null,
} = {}) {
  const calls = gates.map(gate => `run(${JSON.stringify(gate.label)}, ${JSON.stringify(gate.command)})`)
  const body = wrapper === 'dead'
    ? calls.map(call => `if (false) { ${call} }`).join('\n')
    : calls.join('\n')
  writeFileSync(
    join(root, 'scripts/release-preflight.mjs'),
    `${prefix}function run(label, command) { ${functionBody} }\n${afterRunner}${body}\n`,
  )
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let value = 0; value < 256; value += 1) {
    let crc = value
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    table[value] = crc >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, checksum])
}

function validPng({
  ancillaryChunks = [],
  bitDepth = 8,
  colorType = 6,
  height = 1,
  idatData = null,
  interlace = 0,
  raw = Buffer.from([0, 0, 0, 0, 255]),
  width = 1,
} = {}) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = bitDepth
  ihdr[9] = colorType
  ihdr[12] = interlace
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    ...ancillaryChunks,
    pngChunk('IDAT', idatData ?? deflateSync(raw)),
    pngChunk('IEND'),
  ])
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function seedFixtureBaseline(root) {
  const preflight = readFileSync(join(root, 'scripts/release-preflight.mjs'), 'utf8')
  const gateSource = 'run("fixture gate", "node fixture.mjs")'
  const gateStart = preflight.indexOf(gateSource)
  if (gateStart < 0 || preflight.indexOf(gateSource, gateStart + 1) !== -1) {
    throw new Error('fixture bootstrap requires one exact initial gate source')
  }
  const gates = [{
    label: 'fixture gate',
    semanticSha256: sha256(Buffer.from(gateSource, 'utf8')),
  }]
  const gateDigest = sha256(Buffer.from(JSON.stringify(gates), 'utf8'))
  const scaffold = [
    preflight.slice(0, gateStart),
    '\u0000RELEASE-PREFLIGHT-GATE\u0000',
    preflight.slice(gateStart + gateSource.length),
  ].join('')
  const scaffoldSha256 = sha256(Buffer.from(scaffold, 'utf8'))
  const behavior = sha256(Buffer.from(JSON.stringify({ gateDigest, scaffoldSha256 }), 'utf8'))
  const document = {
    schemaVersion: 4,
    kind: 'release-preflight-gate-ratchet',
    revision: 1,
    gateCount: gates.length,
    gateDigest,
    scaffoldSha256,
    behaviorDigest: behavior,
    gates,
    transition: null,
    updated: '2026-07-24',
    note: TRANSITION_NOTE,
  }
  writeFileSync(
    join(root, 'packages/design-system/ds-canonical/references/preflight-gate-baseline.json'),
    `${JSON.stringify(document, null, 2)}\n`,
  )
}

function restoreFile(path, bytes) {
  rmSync(path, { force: true })
  writeFileSync(path, bytes)
}

const callerBaseline = run(REPO)
expectResult(callerBaseline, {
  pass: true,
  label: 'live caller baseline PASS in explicit closed environment',
  pattern: /64 exact-source gates/,
})
const checkerSource = readFileSync(CHECKER, 'utf8')
expect(
  checkerSource.includes('fs.opendirSync(absolute)')
    && !checkerSource.includes('fs.readdirSync(absolute)'),
  'entry cap is enforced while streaming directory names before sorting',
)
expect(
  checkerSource.includes('packedPaletteByteIsValid')
    && !checkerSource.includes('pixel < pass.width'),
  'indexed-color validation work is bounded by decoded bytes rather than pixel count',
)

const fixture = mkdtempSync(join(ENVIRONMENT_TMP, 'governance-tamper-meta-'))
try {
  mkdirSync(join(fixture, 'scripts'), { recursive: true })
  mkdirSync(join(fixture, 'packages/design-system/ds-canonical/references'), { recursive: true })
  writePreflight(fixture)
  const baseline = join(fixture, 'packages/design-system/ds-canonical/references/preflight-gate-baseline.json')

  expectResult(run(fixture, ['--update-baseline']), {
    pass: false,
    label: 'runtime baseline initialization is forbidden even in update mode',
    pattern: /runtime initialization is forbidden/,
  })
  seedFixtureBaseline(fixture)
  const initialPreflight = readFileSync(join(fixture, 'scripts/release-preflight.mjs'))
  const initialBaseline = readFileSync(baseline)
  const initialLedger = JSON.parse(initialBaseline)
  expect(
    initialLedger.schemaVersion === 4
      && initialLedger.kind === 'release-preflight-gate-ratchet'
      && initialLedger.revision === 1
      && initialLedger.gateCount === 1
      && initialLedger.gates.length === 1
      && initialLedger.transition === null
      && /^[0-9a-f]{64}$/.test(initialLedger.behaviorDigest),
    'baseline v4 has an exact-source identity and explicit null initial lineage',
  )
  expectResult(run(fixture), {
    pass: true,
    label: 'seeded canonical fixture baseline passes exact-source check',
    pattern: /1 exact-source gates/,
  })
  rmSync(baseline)
  expectResult(run(fixture, ['--update-baseline']), {
    pass: false,
    label: 'deleted baseline cannot be silently reinitialized',
    pattern: /runtime initialization is forbidden/,
  })
  restoreFile(baseline, initialBaseline)
  const noOpBaseline = readFileSync(baseline)
  expectResult(run(fixture, ['--update-baseline']), {
    pass: false,
    label: 'no-op baseline update cannot replay or advance a review revision',
    pattern: /baseline already matches release-preflight behavior/,
  })
  expect(readFileSync(baseline).equals(noOpBaseline), 'no-op update leaves baseline bytes unchanged')

  writeFileSync(baseline, Buffer.concat([initialBaseline, Buffer.from('\n')]))
  expectResult(run(fixture), {
    pass: false,
    label: 'non-canonical baseline JSON bytes fail closed',
    pattern: /baseline JSON bytes are not canonical/,
  })
  restoreFile(baseline, initialBaseline)
  writeFileSync(
    baseline,
    initialBaseline.toString('utf8').replace(
      '  "revision": 1,\n',
      '  "revision": 1,\n  "revision": 1,\n',
    ),
  )
  expectResult(run(fixture), {
    pass: false,
    label: 'duplicate baseline JSON keys fail before last-wins parsing',
    pattern: /duplicate JSON key:revision/,
  })
  restoreFile(baseline, initialBaseline)
  const reorderedLedger = {
    kind: initialLedger.kind,
    schemaVersion: initialLedger.schemaVersion,
    revision: initialLedger.revision,
    gateCount: initialLedger.gateCount,
    gateDigest: initialLedger.gateDigest,
    scaffoldSha256: initialLedger.scaffoldSha256,
    behaviorDigest: initialLedger.behaviorDigest,
    gates: initialLedger.gates,
    transition: initialLedger.transition,
    updated: initialLedger.updated,
    note: initialLedger.note,
  }
  writeFileSync(baseline, `${JSON.stringify(reorderedLedger, null, 2)}\n`)
  expectResult(run(fixture), {
    pass: false,
    label: 'reordered baseline keys violate the single canonical byte form',
    pattern: /invalid closed schema\/key order/,
  })
  restoreFile(baseline, initialBaseline)
  const unsafeRevisionLedger = { ...initialLedger, revision: 9007199254740992 }
  writeFileSync(baseline, `${JSON.stringify(unsafeRevisionLedger, null, 2)}\n`)
  expectResult(run(fixture), {
    pass: false,
    label: 'unsafe-integer baseline revision fails closed',
    pattern: /baseline revision is invalid/,
  })
  restoreFile(baseline, initialBaseline)

  writePreflight(fixture, { functionBody: 'return\n[label, command]' })
  expectResult(run(fixture), {
    pass: false,
    label: 'ASI return-newline semantic mutation changes the exact scaffold identity',
    pattern: /non-gate scaffold changed/,
  })
  writePreflight(fixture, { functionBody: 'return /*\n*/ [label, command]' })
  expectResult(run(fixture), {
    pass: false,
    label: 'line terminator hidden inside a comment changes the exact scaffold identity',
    pattern: /non-gate scaffold changed/,
  })
  writeFileSync(
    join(fixture, 'scripts/release-preflight.mjs'),
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), initialPreflight]),
  )
  expectResult(run(fixture), {
    pass: false,
    label: 'UTF-8 BOM before a shebang-capable preflight cannot disappear from exact identity',
    pattern: /release-preflight read\/parse failed:text source must be UTF-8 BOM-free/,
  })
  restoreFile(join(fixture, 'scripts/release-preflight.mjs'), initialPreflight)

  mkdirSync(join(fixture, '.claude/references'), { recursive: true })
  writeFileSync(join(fixture, '.claude/references/preflight-gate-baseline.json'), JSON.stringify({ gateCount: 999 }) + '\n')

  expectResult(run(fixture), {
    pass: true,
    label: 'closed PATH (without rg) isolated fixture PASS',
    pattern: /1 exact-source gates/,
  })

  const poisonedEnvironment = {
    NODE_OPTIONS: process.env.NODE_OPTIONS,
    NODE_PATH: process.env.NODE_PATH,
    BASH_ENV: process.env.BASH_ENV,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  }
  process.env.NODE_OPTIONS = '--require=/definitely/not/present/governance-poison.cjs'
  process.env.NODE_PATH = '/definitely/not/present'
  process.env.BASH_ENV = '/definitely/not/present'
  process.env.GITHUB_TOKEN = 'must-not-propagate'
  expectResult(run(fixture), {
    pass: true,
    label: 'ambient Node/loader/shell/credential variables are not inherited',
  })
  for (const [name, value] of Object.entries(poisonedEnvironment)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }

  const bytesBeforeMixedMode = readFileSync(baseline)
  expectResult(run(fixture, ['--check', '--update-baseline']), {
    pass: false,
    status: 2,
    label: '--check and --update-baseline are mutually exclusive',
    pattern: /choose exactly one/,
  })
  expect(readFileSync(baseline).equals(bytesBeforeMixedMode), 'mixed mode leaves baseline bytes unchanged')
  expectResult(run(fixture, ['--unknown']), {
    pass: false,
    status: 2,
    label: 'unknown flags fail closed with usage status',
    pattern: /unknown argument/,
  })

  writePreflight(fixture, { gates: [{ label: 'replacement gate', command: 'node replacement.mjs' }] })
  expectResult(run(fixture), {
    pass: false,
    label: 'same-count gate substitution cannot satisfy semantic ratchet',
    pattern: /ordered gate ledger changed/,
  })

  writePreflight(fixture, {
    gates: [{ label: 'fixture gate', command: 'node fixture.mjs' }],
    prefix: '// run(\"fixture gate\", \"node fixture.mjs\")\n',
    wrapper: 'dead',
  })
  expectResult(run(fixture), {
    pass: false,
    label: 'comment and dead-branch run() padding cannot satisfy executable gate identity',
    pattern: /run identifier may only/,
  })

  restoreFile(join(fixture, 'scripts/release-preflight.mjs'), initialPreflight)
  writeFileSync(
    join(fixture, 'scripts/release-preflight.mjs'),
    `${initialPreflight.toString('utf8')}run('unreviewed early exit', (process.exit(0), 'true'))\n`,
  )
  expectResult(run(fixture), {
    pass: false,
    label: 'side-effect expression cannot enter the closed gate AST grammar',
    pattern: /gate command is outside the closed AST grammar:unreviewed early exit/,
  })

  for (const [label, unsafeLabel] of [
    ['empty', ''],
    ['bidi-format', 'fixture\u202egate'],
    ['line-control', 'fixture\ngate'],
    ['unicode-line-separator', 'fixture\u2028gate'],
    ['unicode-paragraph-separator', 'fixture\u2029gate'],
  ]) {
    const baselineBeforeUnsafeLabel = readFileSync(baseline)
    writePreflight(fixture, {
      gates: [{ label: unsafeLabel, command: 'node unsafe-label.mjs' }],
    })
    expectResult(run(fixture, ['--update-baseline']), {
      pass: false,
      label: `${label} gate label is rejected before baseline publication`,
      pattern: /gate labels must be non-empty, bounded, and control-free/,
    })
    expect(
      readFileSync(baseline).equals(baselineBeforeUnsafeLabel),
      `${label} gate label leaves baseline bytes unchanged`,
    )
  }

  restoreFile(join(fixture, 'scripts/release-preflight.mjs'), initialPreflight)
  writePreflight(fixture, {
    gates: [
      { label: 'fixture gate', command: 'node fixture.mjs' },
      { label: 'new additive gate', command: 'node additive.mjs' },
    ],
  })
  expectResult(run(fixture), {
    pass: false,
    label: 'unreviewed additive gate fails exact ordered-ledger check',
    pattern: /ordered gate ledger changed/,
  })
  const baselineBeforeUnapprovedAddition = readFileSync(baseline)
  const unapprovedAddition = run(fixture, ['--update-baseline'])
  expectResult(unapprovedAddition, {
    pass: false,
    label: 'additive gate requires a revision-bound behavior transition',
    pattern: /requires exactly one transition-bound header comment/,
  })
  expect(
    readFileSync(baseline).equals(baselineBeforeUnapprovedAddition),
    'rejected additive gate leaves baseline unchanged',
  )
  const additionMarker = transitionMarker(unapprovedAddition)
  writePreflight(fixture, {
    gates: [
      { label: 'fixture gate', command: 'node fixture.mjs' },
      { label: 'new additive gate', command: 'node additive.mjs' },
    ],
    prefix: `${additionMarker}\n`,
  })
  expectResult(run(fixture, ['--update-baseline']), {
    pass: true,
    label: 'reviewed additive transition advances the semantic ledger',
    pattern: /2 exact-source gate identities/,
  })
  const approvedAdditionPreflight = readFileSync(join(fixture, 'scripts/release-preflight.mjs'))
  const approvedAdditionBaseline = readFileSync(baseline)
  expectResult(run(fixture), {
    pass: true,
    label: 'persisted additive transition lineage passes ordinary check mode',
  })
  writeFileSync(
    join(fixture, 'scripts/release-preflight.mjs'),
    approvedAdditionPreflight.toString('utf8').replace(
      'reason:fixture-reviewed-transition)',
      'reason:mutated-transition)',
    ),
  )
  expectResult(run(fixture), {
    pass: false,
    label: 'post-update transition reason mutation fails persisted-lineage check',
    pattern: /transition marker does not match persisted baseline lineage/,
  })
  restoreFile(join(fixture, 'scripts/release-preflight.mjs'), approvedAdditionPreflight)
  writeFileSync(
    join(fixture, 'scripts/release-preflight.mjs'),
    approvedAdditionPreflight.toString('utf8').replace(/^\/\/ @preflight-transition\([^\r\n]+\)\r?\n/, ''),
  )
  expectResult(run(fixture), {
    pass: false,
    label: 'post-update transition marker deletion fails persisted-lineage check',
    pattern: /transition marker does not match persisted baseline lineage/,
  })
  restoreFile(join(fixture, 'scripts/release-preflight.mjs'), approvedAdditionPreflight)
  const tamperedAdditionLedger = JSON.parse(approvedAdditionBaseline)
  tamperedAdditionLedger.transition.auditRef = 'candidate-self-asserted-other-ref'
  writeFileSync(baseline, `${JSON.stringify(tamperedAdditionLedger, null, 2)}\n`)
  expectResult(run(fixture), {
    pass: false,
    label: 'self-consistent canonical baseline cannot silently rewrite persisted audit metadata',
    pattern: /transition marker does not match persisted baseline lineage/,
  })
  restoreFile(baseline, approvedAdditionBaseline)
  writePreflight(fixture, {
    gates: [
      { label: 'new additive gate', command: 'node additive.mjs' },
      { label: 'fixture gate', command: 'node fixture.mjs' },
    ],
  })
  expectResult(run(fixture), {
    pass: false,
    label: 'approved gate reorder fails even when identities and count are unchanged',
    pattern: /ordered gate ledger changed/,
  })
  expectResult(run(fixture, ['--update-baseline']), {
    pass: false,
    label: 'gate reorder also requires a new revision-bound transition',
    pattern: /requires exactly one transition-bound header comment/,
  })
  writePreflight(fixture, {
    gates: [
      { label: 'fixture gate', command: 'node fixture.mjs' },
      { label: 'fixture gate', command: 'node other.mjs' },
    ],
  })
  expectResult(run(fixture), {
    pass: false,
    label: 'duplicate executable gate labels fail closed',
    pattern: /gate labels must be unique/,
  })

  restoreFile(join(fixture, 'scripts/release-preflight.mjs'), initialPreflight)
  restoreFile(baseline, initialBaseline)
  writePreflight(fixture, { functionBody: 'return null' })
  expectResult(run(fixture), {
    pass: false,
    label: 'non-gate preflight runner/scaffold mutation fails',
    pattern: /non-gate scaffold changed/,
  })
  const ledgerBeforeUnapprovedScaffold = readFileSync(baseline)
  const unapprovedScaffold = run(fixture, ['--update-baseline'])
  expectResult(unapprovedScaffold, {
    pass: false,
    label: 'scaffold update without behavior-transition approval fails',
    pattern: /requires exactly one transition-bound header comment/,
  })
  expect(readFileSync(baseline).equals(ledgerBeforeUnapprovedScaffold), 'rejected scaffold update leaves baseline unchanged')
  const scaffoldMarker = transitionMarker(unapprovedScaffold)
  writePreflight(fixture, {
    functionBody: 'return null',
    afterRunner: `${scaffoldMarker}\n`,
  })
  expectResult(run(fixture, ['--update-baseline']), {
    pass: false,
    label: 'exact marker outside header comment trivia cannot authorize a transition',
    pattern: /requires exactly one transition-bound header comment/,
  })
  writePreflight(fixture, {
    functionBody: 'return null',
    prefix: `${scaffoldMarker}\n${scaffoldMarker}\n`,
  })
  expectResult(run(fixture, ['--update-baseline']), {
    pass: false,
    label: 'duplicate exact transition comments fail closed',
    pattern: /requires exactly one transition-bound header comment/,
  })
  writePreflight(fixture, {
    functionBody: 'return null',
    prefix: `${scaffoldMarker.replace(
      'reason:fixture-reviewed-transition)',
      'reason:fixture-\u202ereviewed-transition)',
    )}\n`,
  })
  expectResult(run(fixture, ['--update-baseline']), {
    pass: false,
    label: 'bidi format control in transition metadata fails closed',
    pattern: /revision\/reason must be safe.*control-free/,
  })
  writePreflight(fixture, {
    functionBody: 'return null',
    prefix: `${scaffoldMarker}\n`,
  })
  expectResult(run(fixture, ['--update-baseline']), {
    pass: true,
    label: 'scaffold update accepts one exact transition-bound header comment',
    pattern: /baseline updated atomically/,
  })
  writePreflight(fixture, {
    functionBody: 'return 42',
    prefix: `${scaffoldMarker}\n`,
  })
  expectResult(run(fixture, ['--update-baseline']), {
    pass: false,
    label: 'a consumed marker cannot replay against the next baseline revision',
    pattern: /requires exactly one transition-bound header comment/,
  })

  restoreFile(join(fixture, 'scripts/release-preflight.mjs'), initialPreflight)
  restoreFile(baseline, initialBaseline)
  writePreflight(fixture, { gates: [{ label: 'replacement gate', command: 'node replacement.mjs' }] })
  const ledgerBeforeUnapprovedRetire = readFileSync(baseline)
  const unapprovedSubstitution = run(fixture, ['--update-baseline'])
  expectResult(unapprovedSubstitution, {
    pass: false,
    label: 'gate substitution without exact behavior-transition marker fails',
    pattern: /requires exactly one transition-bound header comment/,
  })
  expect(readFileSync(baseline).equals(ledgerBeforeUnapprovedRetire), 'rejected gate substitution leaves baseline unchanged')
  const substitutionMarker = transitionMarker(unapprovedSubstitution)
  writePreflight(fixture, {
    gates: [{ label: 'replacement gate', command: 'node replacement.mjs' }],
    prefix: `${substitutionMarker}\n`,
  })
  expectResult(run(fixture, ['--update-baseline']), {
    pass: true,
    label: 'gate substitution accepts exact old-revision behavior transition',
    pattern: /baseline updated atomically/,
  })

  restoreFile(join(fixture, 'scripts/release-preflight.mjs'), initialPreflight)
  restoreFile(baseline, initialBaseline)
  const waiverTarget = join(fixture, 'scripts/waiver-target.ts')
  writeFileSync(waiverTarget, '// @waiver(owner:governance expiry:2099-12-31 reason:temporary compatibility)\n')
  expectResult(run(fixture), {
    pass: true,
    label: 'valid unexpired waiver PASS',
    pattern: /time-boxed waivers 1 all valid/,
  })

  writeFileSync(waiverTarget, [
    '// @waiver(owner:a expiry:2099-12-31 reason:first) ',
    '@waiver(owner:b expiry:2099-12-31 reason:second)\n',
  ].join(''))
  expectResult(run(fixture), {
    pass: true,
    label: 'multiple same-line waivers are all scanned',
    pattern: /time-boxed waivers 2 all valid/,
  })

  writeFileSync(waiverTarget, '// @waiver(owner:governance expiry:2099-12-31)\n')
  expectResult(run(fixture), {
    pass: false,
    label: 'missing waiver field FAIL',
    pattern: /waiver format invalid.*scripts\/waiver-target\.ts:1/,
  })

  for (const [label, body] of [
    ['empty reason', 'owner:governance expiry:2099-12-31 reason:'],
    ['wrong field order', 'expiry:2099-12-31 owner:governance reason:wrong-order'],
    ['expiry hidden in reason', 'owner:governance reason:expiry:2099-12-31'],
    ['invalid month', 'owner:governance expiry:2099-99-01 reason:invalid-month'],
    ['nonexistent date', 'owner:governance expiry:2099-02-29 reason:invalid-day'],
    ['date suffix', 'owner:governance expiry:2099-12-319 reason:date-suffix'],
    ['duplicate field', 'owner:governance expiry:2099-12-31 expiry:2099-12-31 reason:duplicate'],
  ]) {
    writeFileSync(waiverTarget, `// @waiver(${body})\n`)
    expectResult(run(fixture), {
      pass: false,
      label: `${label} waiver schema FAIL`,
      pattern: /waiver format invalid.*scripts\/waiver-target\.ts:1/,
    })
  }

  const waiverPrefix = 'owner:a expiry:2099-12-31 reason:'
  writeFileSync(waiverTarget, `// @waiver(${waiverPrefix}${'x'.repeat(4096 - waiverPrefix.length)})\n`)
  expectResult(run(fixture), {
    pass: true,
    label: 'waiver body exactly 4096 characters PASS',
  })
  writeFileSync(waiverTarget, `// @waiver(${waiverPrefix}${'x'.repeat(4097 - waiverPrefix.length)})\n`)
  expectResult(run(fixture), {
    pass: false,
    label: 'waiver body beyond 4096 characters fails closed',
    pattern: /waiver exceeds 4096 character limit/,
  })

  writeFileSync(waiverTarget, '// @waiver(owner:governance expiry:2000-01-01 reason:expired)\n')
  expectResult(run(fixture), {
    pass: false,
    label: 'expired waiver FAIL',
    pattern: /waiver expired\(2000-01-01\).*scripts\/waiver-target\.ts:1/,
  })

  for (const [label, terminator] of [
    ['LF', '\n'],
    ['CR', '\r'],
    ['Unicode LS', '\u2028'],
    ['Unicode PS', '\u2029'],
  ]) {
    writeFileSync(waiverTarget, `// @waiver(owner:governance${terminator}expiry:2099-12-31 reason:multiline)\n`)
    expectResult(run(fixture), {
      pass: false,
      label: `${label} multiline waiver cannot bypass single-line grammar`,
      pattern: /waiver format invalid.*scripts\/waiver-target\.ts:1/,
    })
  }

  const beforeChunkBoundaryCr = '@waiver(owner:a'
  writeFileSync(waiverTarget, [
    'x'.repeat((64 * 1024) - Buffer.byteLength(beforeChunkBoundaryCr) - 1),
    beforeChunkBoundaryCr,
    '\r\n',
    '@waiver(owner:b expiry:2000-01-01 reason:expired-after-crlf)\n',
  ].join(''))
  expectResult(run(fixture), {
    pass: false,
    label: 'CRLF crossing 64 KiB counts once and later waiver remains visible',
    pattern: /waiver expired\(2000-01-01\).*scripts\/waiver-target\.ts:2/,
  })

  writeFileSync(waiverTarget, '// @waiver(owner:governance expiry:2099-12-31 reason:no-close\n')
  expectResult(run(fixture), {
    pass: false,
    label: 'unclosed waiver FAIL',
    pattern: /waiver format invalid.*scripts\/waiver-target\.ts:1/,
  })

  writeFileSync(waiverTarget, Buffer.concat([
    Buffer.alloc(70 * 1024, 0x61),
    Buffer.from('@waiver(owner:a expiry:2000-01-01 reason:binary)'),
    Buffer.from([0]),
  ]))
  expectResult(run(fixture), {
    pass: false,
    label: 'late NUL in text source fails closed',
    pattern: /text source must be NUL-free UTF-8:scripts\/waiver-target\.ts/,
  })

  writeFileSync(waiverTarget, Buffer.concat([
    Buffer.from('@waiver(owner:a expiry:2000-01-01 reason:binary)'),
    Buffer.from([0xff]),
  ]))
  expectResult(run(fixture), {
    pass: false,
    label: 'invalid UTF-8 in text source fails closed',
    pattern: /text source must be NUL-free UTF-8:scripts\/waiver-target\.ts/,
  })

  writeFileSync(waiverTarget, [
    'x'.repeat((64 * 1024) - 4),
    '@waiver(owner:governance expiry:2099-12-31 reason:chunk-boundary)\n',
  ].join(''))
  expectResult(run(fixture), {
    pass: true,
    label: 'waiver marker crossing 64 KiB remains visible',
    pattern: /time-boxed waivers 1 all valid/,
  })

  truncateSync(waiverTarget, (64 * 1024 * 1024) + 1)
  expectResult(run(fixture), {
    pass: false,
    label: 'oversized sparse source fails by bounded policy instead of allocation or timeout',
    pattern: /source exceeds 67108864 byte per-file scan limit:scripts\/waiver-target\.ts/,
  })

  rmSync(waiverTarget)
  const approvedPngDirectory = join(fixture, 'infra/governance/baseline/visual/meta-test')
  mkdirSync(approvedPngDirectory, { recursive: true })
  const pngTarget = join(approvedPngDirectory, 'evidence.png')
  const outsidePngTarget = join(fixture, 'scripts/evidence.png')
  const goodPng = validPng()
  writeFileSync(pngTarget, goodPng)
  expectResult(run(fixture), {
    pass: true,
    label: 'complete CRC-valid PNG is accepted only in the approved visual baseline root',
  })
  writeFileSync(outsidePngTarget, goodPng)
  expectResult(run(fixture), {
    pass: false,
    label: 'the same valid PNG is rejected outside the approved visual baseline root',
    pattern: /opaque PNG source is forbidden outside .*:scripts\/evidence\.png/,
  })
  writeFileSync(
    outsidePngTarget,
    validPng({
      ancillaryChunks: [
        pngChunk('tEXt', Buffer.from('@waiver(owner:a expiry:2099-12-31 reason:opaque-payload)')),
      ],
    }),
  )
  expectResult(run(fixture), {
    pass: false,
    label: 'waiver-like ancillary PNG text cannot create an opaque source exemption',
    pattern: /opaque PNG source is forbidden outside .*:scripts\/evidence\.png/,
  })
  rmSync(outsidePngTarget)

  writeFileSync(pngTarget, goodPng.subarray(0, 8))
  expectResult(run(fixture), {
    pass: false,
    label: 'signature-only fake PNG fails closed',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  const badCrc = Buffer.from(goodPng)
  badCrc[badCrc.length - 1] ^= 0xff
  writeFileSync(pngTarget, badCrc)
  expectResult(run(fixture), {
    pass: false,
    label: 'bad PNG CRC fails closed',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  writeFileSync(pngTarget, goodPng.subarray(0, goodPng.length - 12))
  expectResult(run(fixture), {
    pass: false,
    label: 'PNG missing IEND fails closed',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  writeFileSync(pngTarget, Buffer.concat([goodPng, Buffer.from('trailing')]))
  expectResult(run(fixture), {
    pass: false,
    label: 'PNG trailing bytes fail closed',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  const duplicateIhdr = Buffer.concat([goodPng.subarray(0, 33), goodPng.subarray(8, 33), goodPng.subarray(33)])
  writeFileSync(pngTarget, duplicateIhdr)
  expectResult(run(fixture), {
    pass: false,
    label: 'duplicate PNG IHDR fails closed',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  writeFileSync(pngTarget, validPng({ idatData: Buffer.from('not-a-zlib-stream') }))
  expectResult(run(fixture), {
    pass: false,
    label: 'CRC-valid PNG with invalid IDAT zlib stream fails closed',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  writeFileSync(pngTarget, validPng({ raw: Buffer.from([5, 0, 0, 0, 255]) }))
  expectResult(run(fixture), {
    pass: false,
    label: 'PNG scanline filter byte outside 0-4 fails closed',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  writeFileSync(pngTarget, validPng({ raw: Buffer.from([0, 0, 0, 0]) }))
  expectResult(run(fixture), {
    pass: false,
    label: 'PNG decoded payload shorter than IHDR geometry fails closed',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  writeFileSync(pngTarget, validPng({ raw: Buffer.from([0, 0, 0, 0, 255, 0]) }))
  expectResult(run(fixture), {
    pass: false,
    label: 'PNG decoded payload longer than IHDR geometry fails closed',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  const validCompressedScanline = deflateSync(Buffer.from([0, 0, 0, 0, 255]))
  writeFileSync(
    pngTarget,
    validPng({
      idatData: Buffer.concat([validCompressedScanline, Buffer.from([0xde, 0xad])]),
    }),
  )
  expectResult(run(fixture), {
    pass: false,
    label: 'PNG zlib stream with trailing compressed bytes fails closed',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  writeFileSync(
    pngTarget,
    validPng({
      idatData: Buffer.concat([validCompressedScanline, validCompressedScanline]),
    }),
  )
  expectResult(run(fixture), {
    pass: false,
    label: 'PNG concatenated second zlib stream fails closed',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  writeFileSync(pngTarget, validPng({ interlace: 1 }))
  expectResult(run(fixture), {
    pass: true,
    label: '1x1 RGBA8 Adam7 decoded layout is accepted',
  })
  writeFileSync(
    pngTarget,
    validPng({
      ancillaryChunks: [pngChunk('PLTE', Buffer.alloc(9))],
      bitDepth: 1,
      colorType: 3,
      raw: Buffer.from([0, 0]),
    }),
  )
  expectResult(run(fixture), {
    pass: false,
    label: 'indexed PNG palette cannot exceed bit-depth capacity',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  writeFileSync(
    pngTarget,
    validPng({
      ancillaryChunks: [pngChunk('PLTE', Buffer.alloc(3))],
      bitDepth: 8,
      colorType: 3,
      raw: Buffer.from([0, 255]),
    }),
  )
  expectResult(run(fixture), {
    pass: false,
    label: 'indexed PNG pixel cannot reference a missing palette entry',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  writeFileSync(
    pngTarget,
    validPng({
      ancillaryChunks: [pngChunk('PLTE', Buffer.alloc(3))],
      bitDepth: 1,
      colorType: 3,
      raw: Buffer.from([0, 0x80]),
    }),
  )
  expectResult(run(fixture), {
    pass: false,
    label: 'packed 1-bit indexed PNG validates real high-bit samples without pixel-count work',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  writeFileSync(
    pngTarget,
    validPng({
      ancillaryChunks: [pngChunk('PLTE', Buffer.alloc(3))],
      bitDepth: 8,
      colorType: 3,
      raw: Buffer.from([0, 0]),
    }),
  )
  expectResult(run(fixture), {
    pass: true,
    label: 'indexed PNG with an in-range unfiltered palette index is accepted',
  })
  writeFileSync(pngTarget, validPng({ idatData: Buffer.alloc(0) }))
  expectResult(run(fixture), {
    pass: false,
    label: 'PNG with only an empty IDAT payload fails closed',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  writeFileSync(pngTarget, validPng({ width: 0x80000000 }))
  expectResult(run(fixture), {
    pass: false,
    label: 'PNG width above the specification limit fails before inflate',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  writeFileSync(pngTarget, validPng({ width: 0x7fffffff }))
  expectResult(run(fixture), {
    pass: false,
    label: 'PNG decoded geometry above the bounded policy fails before inflate',
    pattern: /malformed PNG source:infra\/governance\/baseline\/visual\/meta-test\/evidence\.png/,
  })
  rmSync(pngTarget)
  const aggregateWidth = 4096
  const aggregateHeight = 10240
  let aggregateRaw = Buffer.alloc((aggregateWidth + 1) * aggregateHeight)
  const aggregatePng = validPng({
    bitDepth: 8,
    colorType: 0,
    height: aggregateHeight,
    raw: aggregateRaw,
    width: aggregateWidth,
  })
  aggregateRaw = null
  const aggregateTargets = Array.from(
    { length: 16 },
    (_, index) => join(approvedPngDirectory, `aggregate-${String(index).padStart(2, '0')}.png`),
  )
  for (const target of aggregateTargets) writeFileSync(target, aggregatePng)
  expectResult(run(fixture), {
    pass: false,
    label: 'multiple individually valid compressed PNGs cannot exceed the repository decoded budget',
    pattern: /repository PNG decoded data exceeds 671088640 byte aggregate limit/,
  })
  for (const target of aggregateTargets) rmSync(target)
  writeFileSync(outsidePngTarget, '// @waiver(owner:a expiry:2000-01-01 reason:fake-png)\n')
  expectResult(run(fixture), {
    pass: false,
    label: '.png suffix without PNG signature is scanned as text',
    pattern: /waiver expired\(2000-01-01\).*scripts\/evidence\.png:1/,
  })
  rmSync(outsidePngTarget)
  rmSync(join(fixture, 'infra'), { recursive: true })

  const workflowDirectory = join(fixture, '.github/workflows')
  mkdirSync(workflowDirectory, { recursive: true })
  writeFileSync(join(workflowDirectory, 'waiver.yml'), '# @waiver(owner:a expiry:2000-01-01 reason:workflow-scope)\n')
  expectResult(run(fixture), {
    pass: false,
    label: 'repository-wide scope includes .github workflows',
    pattern: /waiver expired\(2000-01-01\).*\.github\/workflows\/waiver\.yml:1/,
  })
  rmSync(join(fixture, '.github'), { recursive: true })

  const newPackageTestDirectory = join(fixture, 'packages/new-provider/tests')
  mkdirSync(newPackageTestDirectory, { recursive: true })
  writeFileSync(
    join(newPackageTestDirectory, 'check-governance-tamper.mjs'),
    '// @waiver(owner:a expiry:2000-01-01 reason:new-package-scope)\n',
  )
  expectResult(run(fixture), {
    pass: false,
    label: 'new package/test/checker-named source cannot escape scanning',
    pattern: /waiver expired\(2000-01-01\).*packages\/new-provider\/tests\/check-governance-tamper\.mjs:1/,
  })
  rmSync(join(fixture, 'packages/new-provider'), { recursive: true })

  const dependencyDirectory = join(fixture, 'packages/new-provider/node_modules/dependency')
  mkdirSync(dependencyDirectory, { recursive: true })
  writeFileSync(
    join(dependencyDirectory, 'index.js'),
    '// @waiver(owner:a expiry:2000-01-01 reason:non-authoritative-dependency)\n',
  )
  expectResult(run(fixture), {
    pass: true,
    label: 'node_modules remains delegated to lock/runtime authority',
    pattern: /time-boxed waivers 0 all valid/,
  })
  rmSync(join(fixture, 'packages/new-provider'), { recursive: true })

  writeFileSync(
    join(fixture, '.claude/generated-waiver.md'),
    '<!-- @waiver(owner:a expiry:2000-01-01 reason:generated-provider-view) -->\n',
  )
  expectResult(run(fixture), {
    pass: true,
    label: 'exact provider projection root remains delegated to drift authority',
    pattern: /time-boxed waivers 0 all valid/,
  })
  rmSync(join(fixture, '.claude/generated-waiver.md'))

  const canonicalScriptsAlias = join(fixture, 'packages/design-system/scripts')
  symlinkSync('../../scripts', canonicalScriptsAlias)
  expectResult(run(fixture), {
    pass: false,
    label: 'retired DS scripts alias fails closed',
    pattern: /symbolic link is forbidden.*packages\/design-system\/scripts/,
  })
  rmSync(canonicalScriptsAlias)

  mkdirSync(canonicalScriptsAlias)
  writeFileSync(
    join(canonicalScriptsAlias, 'retired-alias-waiver.mjs'),
    '// @waiver(owner:a expiry:2000-01-01 reason:retired-alias-must-remain-governed)\n',
  )
  expectResult(run(fixture), {
    pass: false,
    label: 'retired DS scripts path remains in ordinary source scanning',
    pattern: /waiver expired\(2000-01-01\).*packages\/design-system\/scripts\/retired-alias-waiver\.mjs:1/,
  })
  rmSync(canonicalScriptsAlias, { recursive: true })

  const linkTarget = join(fixture, '.claude/opaque-target.ts')
  writeFileSync(linkTarget, '// no waiver\n')
  symlinkSync('../.claude/opaque-target.ts', waiverTarget)
  expectResult(run(fixture), {
    pass: false,
    label: 'symlink in scanned source fails closed',
    pattern: /symbolic link is forbidden.*scripts\/waiver-target\.ts/,
  })
  rmSync(waiverTarget)

  linkSync(linkTarget, waiverTarget)
  expectResult(run(fixture), {
    pass: false,
    label: 'hard link in scanned source fails closed',
    pattern: /source must be a unique regular file.*scripts\/waiver-target\.ts/,
  })
  rmSync(waiverTarget)

  const hiddenDirectory = join(fixture, 'scripts/.hidden-governance')
  mkdirSync(hiddenDirectory)
  writeFileSync(join(hiddenDirectory, 'waiver.ts'), '// @waiver(owner:a expiry:2000-01-01 reason:hidden)\n')
  expectResult(run(fixture), {
    pass: false,
    label: 'hidden source directory is governed',
    pattern: /waiver expired\(2000-01-01\).*scripts\/\.hidden-governance\/waiver\.ts:1/,
  })
  rmSync(hiddenDirectory, { recursive: true })

  const unicodeDirectory = join(fixture, 'scripts/治理-é')
  mkdirSync(unicodeDirectory)
  writeFileSync(join(unicodeDirectory, '有效.ts'), '// @waiver(owner:治理 expiry:2099-12-31 reason:portable-unicode)\n')
  expectResult(run(fixture), {
    pass: true,
    label: 'Unicode source paths and content are portable',
    pattern: /time-boxed waivers 1 all valid/,
  })
  rmSync(unicodeDirectory, { recursive: true })

  const originalPreflightPath = join(fixture, 'scripts/release-preflight.mjs')
  const preflightExternal = join(fixture, '.claude/release-preflight-target.mjs')
  renameSync(originalPreflightPath, preflightExternal)
  symlinkSync('../.claude/release-preflight-target.mjs', originalPreflightPath)
  expectResult(run(fixture), {
    pass: false,
    label: 'release-preflight symlink fails stable R1 read',
    pattern: /release-preflight read\/parse failed.*unique regular file/,
  })
  rmSync(originalPreflightPath)
  renameSync(preflightExternal, originalPreflightPath)
  const preflightHardlinkPeer = join(fixture, '.claude/preflight-hardlink-peer.mjs')
  linkSync(originalPreflightPath, preflightHardlinkPeer)
  expectResult(run(fixture), {
    pass: false,
    label: 'canonical R1 preflight path itself rejects a hardlink alias',
    pattern: /R1: release-preflight read\/parse failed:source must be a unique regular file:scripts\/release-preflight\.mjs/,
  })
  rmSync(preflightHardlinkPeer)

  const baselineExternal = join(fixture, '.claude/preflight-gate-baseline-target.json')
  renameSync(baseline, baselineExternal)
  symlinkSync('../../../../.claude/preflight-gate-baseline-target.json', baseline)
  expectResult(run(fixture), {
    pass: false,
    label: 'baseline symlink fails stable R1 read',
    pattern: /baseline read\/parse failed.*unique regular file/,
  })
  rmSync(baseline)
  renameSync(baselineExternal, baseline)
  const baselineHardlinkPeer = join(fixture, '.claude/baseline-hardlink-peer.json')
  linkSync(baseline, baselineHardlinkPeer)
  expectResult(run(fixture), {
    pass: false,
    label: 'canonical R1 baseline path itself rejects a hardlink alias',
    pattern: /R1: baseline read\/parse failed:source must be a unique regular file:packages\/design-system\/ds-canonical\/references\/preflight-gate-baseline\.json/,
  })
  rmSync(baselineHardlinkPeer)

  const references = dirname(baseline)
  const referencesReal = join(fixture, '.claude/references-real')
  renameSync(references, referencesReal)
  symlinkSync('../../../.claude/references-real', references)
  expectResult(run(fixture), {
    pass: false,
    label: 'baseline ancestor symlink fails closed',
    pattern: /baseline read\/parse failed.*crosses a symbolic link/,
  })
  rmSync(references)
  renameSync(referencesReal, references)

  const baselineBeforeExpiredUpdate = readFileSync(baseline)
  writeFileSync(waiverTarget, '// @waiver(owner:a expiry:2000-01-01 reason:block-update)\n')
  expectResult(run(fixture, ['--update-baseline']), {
    pass: false,
    label: 'expired waiver blocks baseline mutation',
    pattern: /waiver expired/,
  })
  expect(readFileSync(baseline).equals(baselineBeforeExpiredUpdate), 'failed R2 update leaves baseline unchanged')
  rmSync(waiverTarget)

  writePreflight(fixture, { gates: [{ label: 'lock candidate', command: 'node lock-candidate.mjs' }] })
  const unapprovedLockCandidate = run(fixture, ['--update-baseline'])
  const lockCandidateMarker = transitionMarker(unapprovedLockCandidate)
  writePreflight(fixture, {
    gates: [{ label: 'lock candidate', command: 'node lock-candidate.mjs' }],
    prefix: `${lockCandidateMarker}\n`,
  })
  const foreignLock = `${baseline}.lock`
  writeFileSync(foreignLock, 'foreign-lock-must-survive\n')
  const foreignLockBefore = lstatSync(foreignLock, { bigint: true })
  const baselineBeforeForeignLock = readFileSync(baseline)
  expectResult(run(fixture, ['--update-baseline']), {
    pass: false,
    label: 'preexisting foreign baseline lock blocks update without being replaced',
    pattern: /EEXIST.*preflight-gate-baseline\.json\.lock/,
  })
  const foreignLockAfter = lstatSync(foreignLock, { bigint: true })
  expect(
    foreignLockBefore.dev === foreignLockAfter.dev
      && foreignLockBefore.ino === foreignLockAfter.ino
      && readFileSync(foreignLock, 'utf8') === 'foreign-lock-must-survive\n',
    'foreign preexisting lock identity and bytes are preserved',
  )
  expect(
    readFileSync(baseline).equals(baselineBeforeForeignLock),
    'foreign preexisting lock prevents baseline mutation',
  )
  rmSync(foreignLock)
  restoreFile(join(fixture, 'scripts/release-preflight.mjs'), initialPreflight)

  const concurrentTarget = join(fixture, 'scripts/a-concurrent.ts')
  const writerReady = join(fixture, '.claude/concurrent-writer-ready')
  writeFileSync(concurrentTarget, '// first-version\n')
  const concurrentInfo = lstatSync(concurrentTarget)
  const writer = spawn(
    process.execPath,
    [
      '--',
      CONCURRENT_WRITER,
      fixture,
      'scripts/a-concurrent.ts',
      '.claude/concurrent-writer-ready',
      String(concurrentInfo.atimeMs),
      String(concurrentInfo.mtimeMs),
      '5000',
    ],
    { env: CLOSED_ENVIRONMENT, stdio: 'ignore' },
  )
  await new Promise((resolveReady, rejectReady) => {
    const deadline = Date.now() + 5_000
    const poll = () => {
      if (existsSync(writerReady)) {
        resolveReady()
      } else if (writer.exitCode !== null || Date.now() >= deadline) {
        rejectReady(new Error('concurrent writer did not become ready'))
      } else {
        setTimeout(poll, 10)
      }
    }
    poll()
  })
  const concurrentResult = run(fixture)
  await new Promise((resolveWriter) => {
    if (writer.exitCode !== null) {
      resolveWriter()
      return
    }
    const timeout = setTimeout(() => {
      writer.kill('SIGTERM')
      resolveWriter()
    }, 5_000)
    writer.once('exit', () => {
      clearTimeout(timeout)
      resolveWriter()
    })
  })
  expectResult(concurrentResult, {
    pass: false,
    label: 'same-size concurrent rewrites with restored mtime cannot pass stable scan',
    pattern: /source changed/,
  })
  rmSync(concurrentTarget)
  rmSync(writerReady, { force: true })

  expectResult(run(fixture), {
    pass: true,
    label: 'isolated fixture returns to clean PASS after every poison case',
  })
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

const callerAfter = run(REPO)
expectResult(callerAfter, {
  pass: true,
  label: 'live caller remains valid after isolated mutations',
})
try {
  assertGitVisibleWorktreeUnchanged(REPO, liveFingerprint, {
    label: 'governance-tamper meta-test',
  })
  expect(true, 'Git-visible caller worktree and index stayed byte-identical')
} catch (error) {
  expect(false, 'Git-visible caller worktree and index stayed byte-identical', error.message)
}

console.log(ok
  ? `✅ meta-test PASS(${assertions} assertions; fixture-only mutations; Git-visible caller zero-drift)`
  : `❌ meta-test FAIL(${assertions} assertions)`)
cleanupEnvironment()
process.exit(ok ? 0 : 1)

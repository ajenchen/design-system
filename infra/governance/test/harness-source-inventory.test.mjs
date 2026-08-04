import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  HARNESS_EXECUTION_BOUNDARY,
  HARNESS_STATIC_EXECUTION_FIXTURE_ROOT,
  discoverHarnessSources,
  readHarnessSourceInventory,
  validateHarnessSourceInventory,
} from '../lib/harness-source-inventory.mjs'
import { readHarnessRegistry } from '../lib/harness-registry.mjs'
import { compareUtf8Bytes } from '../lib/common.mjs'
import { runHarnessSuite } from '../bin/run-harness-suite.mjs'

const ROOT = resolve(import.meta.dirname, '../../..')
const ROOTS = [
  'infra/governance/test/**/*.test.mjs',
  'packages/governance/test/**/*.test.mjs',
  'scripts/**/test-*.mjs',
  'packages/design-system/ds-canonical/hooks/tests/**/test_*.sh{,.broken}',
]
const CANONICAL_HOOK_RUNTIME_ROOT = 'packages/design-system/ds-canonical/hooks'
const CANONICAL_HOOK_ROOT = `${CANONICAL_HOOK_RUNTIME_ROOT}/tests`
const GENERATED_HOOK_ROOT = '.claude/hooks/tests'

function write(root, path, source = 'export const ok = true\n') {
  const absolute = join(root, path)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, source)
  return absolute
}

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function hookTreeDigest(root, treeRoot = CANONICAL_HOOK_ROOT) {
  const records = []
  function visit(absoluteDirectory, relativeDirectory = '') {
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true }).sort((left, right) => compareUtf8Bytes(left.name, right.name))) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      const absolute = join(absoluteDirectory, entry.name)
      if (entry.isDirectory()) visit(absolute, relativePath)
      else if (
        relativePath === 'run-all.sh'
        || entry.name.endsWith('.mjs')
        || (entry.name.startsWith('test_') && (entry.name.endsWith('.sh') || entry.name.endsWith('.sh.broken')))
      ) {
        records.push({ path: relativePath, sha256: digest(absolute) })
      }
    }
  }
  visit(join(root, treeRoot))
  records.sort((left, right) => compareUtf8Bytes(left.path, right.path))
  return createHash('sha256').update(Buffer.from(JSON.stringify(records))).digest('hex')
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'harness-source-inventory-'))
  for (const directory of ['infra/governance/test', 'infra/governance/providers', 'packages/governance/test', 'scripts', HARNESS_STATIC_EXECUTION_FIXTURE_ROOT, CANONICAL_HOOK_ROOT, GENERATED_HOOK_ROOT]) {
    mkdirSync(join(root, directory), { recursive: true })
  }
  const staticFixturePath = `${HARNESS_STATIC_EXECUTION_FIXTURE_ROOT}/fixture-probe.mjs`
  const staticShellFixturePath = `${HARNESS_STATIC_EXECUTION_FIXTURE_ROOT}/fixture-shell.sh`
  write(
    root,
    'infra/governance/test/hidden_case.test.mjs',
    `export const fixturePaths = ${JSON.stringify([staticFixturePath, staticShellFixturePath])}\n`,
  )
  write(root, 'packages/governance/test/suite.test.mjs')
  const staticFixture = write(root, staticFixturePath, '#!/usr/bin/env node\nprocess.stdout.write("fixture")\n')
  const staticShellFixture = write(
    root,
    staticShellFixturePath,
    '#!/usr/bin/env bash\nset -euo pipefail\nSCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"\nexec node -- "$SCRIPT_DIR/fixture-probe.mjs"\n',
  )
  write(root, 'scripts/sample-gate.mjs')
  write(root, 'scripts/test-sample-gate.mjs')
  write(root, 'scripts/excluded-gate.mjs')
  write(root, 'scripts/test-excluded-gate.mjs')
  write(root, 'scripts/external-gate.mjs')
  write(root, 'scripts/test-external-gate.mjs')
  write(root, 'scripts/test-ui-only.mjs')
  write(root, 'scripts/release-preflight.mjs', "const evidence = 'external probe evidence'\n")
  const canonicalHookTestHelperSource = 'process.stdout.write("hook-test-helper")\n'
  for (const hookRoot of [CANONICAL_HOOK_ROOT, GENERATED_HOOK_ROOT]) {
    write(root, `${hookRoot}/run-all.sh`, '#!/usr/bin/env bash\nset -euo pipefail\n')
    write(
      root,
      `${hookRoot}/test_fixture.sh`,
      '#!/usr/bin/env bash\nset -euo pipefail\nSCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"\nnode -- "$SCRIPT_DIR/fixture-helper.mjs"\n',
    )
    write(root, `${hookRoot}/test_retired.sh.broken`, '#!/usr/bin/env bash\nfalse\n')
    write(root, `${hookRoot}/fixture-helper.mjs`, canonicalHookTestHelperSource)
  }
  const canonicalHookRuntimeHelperPath = `${CANONICAL_HOOK_RUNTIME_ROOT}/lib/static-helper.mjs`
  const canonicalHookRuntimeConsumerPath = `${CANONICAL_HOOK_RUNTIME_ROOT}/fixture.sh`
  const canonicalHookTestHelperPath = `${CANONICAL_HOOK_ROOT}/fixture-helper.mjs`
  const canonicalHookTestConsumerPath = `${CANONICAL_HOOK_ROOT}/test_fixture.sh`
  const canonicalHookRuntimeHelper = write(
    root,
    canonicalHookRuntimeHelperPath,
    'process.stdout.write("hook-runtime-helper")\n',
  )
  write(
    root,
    canonicalHookRuntimeConsumerPath,
    '#!/usr/bin/env bash\nset -euo pipefail\nHOOK_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"\nnode -- "$HOOK_DIR/lib/static-helper.mjs"\n',
  )
  const authorityContractPath = write(
    root,
    'infra/governance/providers/harness-authority-contracts.json',
    '{}\n',
  )
  const authorityContractSchemaPath = write(
    root,
    'infra/governance/schemas/harness-authority-contracts.schema.json',
    '{}\n',
  )

  const registry = {
    authorityContract: {
      path: 'infra/governance/providers/harness-authority-contracts.json',
      schemaPath: 'infra/governance/schemas/harness-authority-contracts.schema.json',
      sha256: digest(authorityContractPath),
      schemaSha256: digest(authorityContractSchemaPath),
    },
    entries: [{ commands: [
      ['node', 'infra/governance/bin/run-harness-suite.mjs', '--suite', 'canonical-hook-behavioral'],
      ['node', 'infra/governance/bin/run-harness-suite.mjs', '--suite', 'fixture-remainder'],
      ['node', 'scripts/run-gate-meta-tests.mjs'],
      ['node', 'scripts/test-excluded-gate.mjs'],
      ['node', 'scripts/test-sample-gate.mjs'],
    ] }],
  }
  write(root, 'infra/governance/providers/harness-registry.json', `${JSON.stringify(registry, null, 2)}\n`)
  const gateExclusions = {
    schemaVersion: 2,
    entries: [
      {
        stem: 'excluded-gate',
        executionClass: 'deterministic-isolated',
        portabilityPolicy: 'required',
        harness: 'scripts/test-excluded-gate.mjs',
        fallback: null,
        executionOwner: {
          kind: 'harness-registry',
          path: 'infra/governance/providers/harness-registry.json',
          command: ['node', 'scripts/test-excluded-gate.mjs'],
        },
        reason: 'Deterministic isolated fixture has an exact canonical runner owner.',
      },
      {
        stem: 'external-gate',
        executionClass: 'environmental-observation',
        portabilityPolicy: 'excluded',
        harness: 'scripts/test-external-gate.mjs',
        fallback: 'scripts/release-preflight.mjs:external probe evidence',
        executionOwner: {
          kind: 'source-reference',
          path: 'scripts/release-preflight.mjs',
          evidence: 'external probe evidence',
        },
        reason: 'External fixture requires authenticated provider state and cannot be locally certified.',
      },
    ],
  }
  const gatePath = write(root, 'scripts/gate-meta-test-exclusions.json', `${JSON.stringify(gateExclusions, null, 2)}\n`)
  const nonGovernance = {
    $schema: '../schemas/harness-non-governance-exclusions.schema.json',
    schemaVersion: 1,
    kind: 'reviewed-non-governance-harness-source-exclusions',
    entries: [{
      path: 'scripts/test-ui-only.mjs',
      category: 'interactive-product-visual-exploration',
      reason: 'Interactive product screenshot exploration needs a separately running visual target and cannot establish a provider-governance result.',
    }],
  }
  const nonGovernancePath = write(root, 'infra/governance/providers/harness-non-governance-exclusions.json', `${JSON.stringify(nonGovernance, null, 2)}\n`)
  const inventory = {
    $schema: '../schemas/harness-source-inventory.schema.json',
    schemaVersion: 2,
    kind: 'provider-neutral-governance-harness-source-inventory',
    roots: ROOTS,
    executionBoundary: HARNESS_EXECUTION_BOUNDARY,
    authorityContract: {
      path: 'infra/governance/providers/harness-authority-contracts.json',
      schemaPath: 'infra/governance/schemas/harness-authority-contracts.schema.json',
      closurePolicy: 'claim-contract-and-schema-are-static-all-harness-receipt-inputs',
    },
    gateMetaExclusions: { path: 'scripts/gate-meta-test-exclusions.json', sha256: digest(gatePath) },
    generatedMirrors: [],
    canonicalHookStaticHelpers: {
      root: CANONICAL_HOOK_RUNTIME_ROOT,
      policy: 'all-active-mjs-exact-digest-and-consumer-bound;shell-dynamic-node-code-forbidden',
      entries: [
        {
          path: canonicalHookRuntimeHelperPath,
          sha256: digest(canonicalHookRuntimeHelper),
          consumers: [canonicalHookRuntimeConsumerPath],
        },
        {
          path: canonicalHookTestHelperPath,
          sha256: digest(join(root, canonicalHookTestHelperPath)),
          consumers: [canonicalHookTestConsumerPath],
        },
      ],
    },
    reviewedDisabled: [{
      path: `${CANONICAL_HOOK_ROOT}/test_retired.sh.broken`,
      sha256: digest(join(root, CANONICAL_HOOK_ROOT, 'test_retired.sh.broken')),
      owner: 'fixture-governance',
      reason: 'The retired fixture deliberately represents reviewed disabled behavioral-test debt.',
      expiresOn: '2099-12-31',
      remediation: 'Restore this fixture as test_retired.sh after updating it to the active hook contract.',
    }],
    staticExecutionFixtures: {
      root: HARNESS_STATIC_EXECUTION_FIXTURE_ROOT,
      policy: 'all-files-exact-digest-and-consumer-bound;node-ast-reviewed;shell-dynamic-node-code-forbidden',
      entries: [
        {
          path: staticFixturePath,
          sha256: digest(staticFixture),
          kind: 'node',
          consumers: ['infra/governance/test/hidden_case.test.mjs'],
        },
        {
          path: staticShellFixturePath,
          sha256: digest(staticShellFixture),
          kind: 'bash',
          consumers: ['infra/governance/test/hidden_case.test.mjs'],
        },
      ],
    },
    suites: [
      {
        id: 'canonical-hook-behavioral',
        memberTimeoutMs: 5_000,
        totalTimeoutMs: 5_000,
        execution: {
          kind: 'aggregate',
          command: ['bash', `${CANONICAL_HOOK_ROOT}/run-all.sh`],
        },
        members: [`${CANONICAL_HOOK_ROOT}/test_fixture.sh`],
      },
      {
        id: 'fixture-remainder',
        memberTimeoutMs: 5_000,
        totalTimeoutMs: 5_000,
        execution: { kind: 'members' },
        members: [
          'infra/governance/test/hidden_case.test.mjs',
          'packages/governance/test/suite.test.mjs',
        ],
      },
    ],
    pairedMeta: { command: ['node', 'scripts/run-gate-meta-tests.mjs'], members: ['scripts/test-sample-gate.mjs'] },
    direct: ['scripts/test-excluded-gate.mjs', 'scripts/test-sample-gate.mjs'],
    externalExclusions: ['scripts/test-external-gate.mjs'],
    nonGovernance: {
      path: 'infra/governance/providers/harness-non-governance-exclusions.json',
      sha256: digest(nonGovernancePath),
    },
  }
  return { root, inventory, registry }
}

test('actual inventory schemas compile and the canonical registry is dynamically source-closed', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  for (const path of [
    'infra/governance/schemas/harness-source-inventory.schema.json',
    'infra/governance/schemas/harness-non-governance-exclusions.schema.json',
  ]) {
    const schema = JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'))
    const validate = ajv.compile(schema)
    const documentPath = path.includes('non-governance')
      ? 'infra/governance/providers/harness-non-governance-exclusions.json'
      : 'infra/governance/providers/harness-source-inventory.json'
    const document = JSON.parse(readFileSync(resolve(ROOT, documentPath), 'utf8'))
    assert.equal(validate(document), true, ajv.errorsText(validate.errors))
  }
  const inventory = readHarnessSourceInventory()
  const registry = readHarnessRegistry()
  assert.equal(validateHarnessSourceInventory(inventory, { repoRoot: ROOT, registry }), true)
  const classified = [...new Set([
    ...inventory.suites.flatMap(suite => suite.members),
    ...inventory.pairedMeta.members,
    ...inventory.direct,
    ...inventory.externalExclusions,
    ...inventory.reviewedDisabled.map(entry => entry.path),
    ...JSON.parse(readFileSync(resolve(ROOT, inventory.nonGovernance.path), 'utf8')).entries.map(entry => entry.path),
  ])].sort(compareUtf8Bytes)
  assert.deepEqual(classified, discoverHarnessSources(ROOT))
})

test('Harness discovery uses canonical UTF-8 byte order for multilingual source paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'harness-source-unicode-order-'))
  try {
    for (const directory of [
      'infra/governance/test',
      'packages/governance/test',
      'scripts',
      'packages/design-system/ds-canonical/hooks/tests',
      '.claude/hooks/tests',
    ]) mkdirSync(join(root, directory), { recursive: true })
    const paths = ['scripts/test-😀.mjs', 'scripts/test-中.mjs', 'scripts/test-あ.mjs', 'scripts/test-ب.mjs', 'scripts/test-Z.mjs']
    for (const path of paths) write(root, path)
    const expected = [...paths].sort((left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')))
    assert.deepEqual(discoverHarnessSources(root), expected)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('declared globs include underscores and direct plus paired-meta is the only allowed role overlap', () => {
  const { root, inventory, registry } = fixture()
  try {
    assert.ok(discoverHarnessSources(root).includes('infra/governance/test/hidden_case.test.mjs'))
    assert.equal(validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), true)
    assert.ok(inventory.direct.includes('scripts/test-sample-gate.mjs'))
    assert.ok(inventory.pairedMeta.members.includes('scripts/test-sample-gate.mjs'))

    const duplicateOwner = structuredClone(inventory)
    const fixtureSuite = duplicateOwner.suites.find(suite => suite.id === 'fixture-remainder')
    fixtureSuite.members.push('scripts/test-sample-gate.mjs')
    fixtureSuite.members.sort(compareUtf8Bytes)
    assert.throws(() => validateHarnessSourceInventory(duplicateOwner, { repoRoot: root, registry }), /incompatible execution roles/)

    write(root, 'packages/governance/test/nested/new_case.test.mjs')
    assert.throws(() => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), /not source-closed/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recursive hook ownership runs only the canonical aggregate and rejects reintroduced mirrors', () => {
  const { root, inventory, registry } = fixture()
  try {
    assert.equal(validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), true)
    const hookSuite = inventory.suites.find(suite => suite.id === 'canonical-hook-behavioral')
    assert.deepEqual(hookSuite.execution.command, ['bash', `${CANONICAL_HOOK_ROOT}/run-all.sh`])
    assert.deepEqual(hookSuite.members, [`${CANONICAL_HOOK_ROOT}/test_fixture.sh`])

    // The generated mirror retired 2026-08-04: declaring one again must fail closed.
    const reintroducedMirror = structuredClone(inventory)
    reintroducedMirror.generatedMirrors = [{
      id: 'claude-hook-behavioral-tests',
      canonicalRoot: CANONICAL_HOOK_ROOT,
      mirrorRoot: '.claude/hooks/tests',
      include: ['run-all.sh', '**/*.mjs', '**/test_*.sh', '**/test_*.sh.broken'],
      treeSha256: hookTreeDigest(root),
    }]
    assert.throws(() => validateHarnessSourceInventory(reintroducedMirror, { repoRoot: root, registry }), /retired and must stay empty/)

    write(root, `${CANONICAL_HOOK_ROOT}/nested/test_new.sh`, '#!/usr/bin/env bash\ntrue\n')
    assert.throws(() => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), /recursive hook-test tree/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('disabled .broken hook tests are discovered, digest-bound, owner-assigned and expiring', () => {
  const { root, inventory, registry } = fixture()
  try {
    const brokenPath = `${CANONICAL_HOOK_ROOT}/test_retired.sh.broken`
    assert.ok(discoverHarnessSources(root).includes(brokenPath))
    // The retired mirror tree is invisible to discovery even when stale leftovers exist on disk.
    assert.ok(!discoverHarnessSources(root).some(path => path.startsWith('.claude/hooks/')))
    assert.equal(validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), true)

    const undeclared = structuredClone(inventory)
    undeclared.reviewedDisabled = []
    assert.throws(() => validateHarnessSourceInventory(undeclared, { repoRoot: root, registry }), /reviewed disabled debt differs/)

    const digestDrift = structuredClone(inventory)
    digestDrift.reviewedDisabled[0].sha256 = '0'.repeat(64)
    assert.throws(() => validateHarnessSourceInventory(digestDrift, { repoRoot: root, registry }), /digest drifted/)

    const expired = structuredClone(inventory)
    expired.reviewedDisabled[0].expiresOn = '2000-01-01'
    assert.throws(() => validateHarnessSourceInventory(expired, { repoRoot: root, registry }), /debt expired/)

    const ownerless = structuredClone(inventory)
    ownerless.reviewedDisabled[0].owner = 'Not Portable'
    assert.throws(() => validateHarnessSourceInventory(ownerless, { repoRoot: root, registry }), /owner is invalid/)

    const vagueRemediation = structuredClone(inventory)
    vagueRemediation.reviewedDisabled[0].remediation = 'fix later'
    assert.throws(() => validateHarnessSourceInventory(vagueRemediation, { repoRoot: root, registry }), /remediation is not substantive/)

    write(root, `${CANONICAL_HOOK_ROOT}/test_silent_escape.sh.broken`, '#!/usr/bin/env bash\nfalse\n')
    assert.throws(() => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), /reviewed disabled debt differs/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('every canonical active hook requires a behavioral test', () => {
  const { root, inventory, registry } = fixture()
  try {
    write(root, 'packages/design-system/ds-canonical/hooks/untested_active.sh', '#!/usr/bin/env bash\ntrue\n')
    assert.throws(
      () => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }),
      /canonical active hooks lack behavioral tests:untested_active/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an empty declared source closure fails closed', () => {
  const { root, inventory, registry } = fixture()
  try {
    for (const path of discoverHarnessSources(root)) rmSync(resolve(root, path))
    const gatePath = resolve(root, inventory.gateMetaExclusions.path)
    writeFileSync(gatePath, `${JSON.stringify({ schemaVersion: 2, entries: [] }, null, 2)}\n`)
    inventory.gateMetaExclusions.sha256 = digest(gatePath)
    assert.throws(
      () => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }),
      /source discovery must not be empty/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('AST safety blocks aliased shell/dynamic execution without flagging RegExp.exec', () => {
  const { root, inventory, registry } = fixture()
  const target = join(root, 'packages/governance/test/suite.test.mjs')
  try {
    writeFileSync(target, "import { fork, spawnSync as launch } from 'node:child_process'\nimport { resolve } from 'node:path'\nconst match = /safe/.exec('safe')\nconst inherited = { shell: true }\nconst runtimeArgs = process.argv.slice(2)\nconst diagnosticText = 'node -e is forbidden here, but ordinary negative test data is not executable'\nconst inspected = match.constructor\nconst reflected = Reflect.get(match, 'constructor')\nconst constructorName = inspected.name\nconst constructorType = typeof inspected\nconst reflectedName = reflected.name\nconst isRegExp = inspected === RegExp\nconst localScriptRoot = () => import.meta.dirname\nconst nestedScriptRoot = () => { const unused = () => process.argv[2]; return import.meta.dirname }\nconst defaultScript = (file = resolve(import.meta.dirname, 'worker.mjs')) => file\nconst object = { fn() {} }\nobject.fn = { safe() {} }\nconst localKey = process.argv[2]\nobject.fn[localKey]()\n{ const globalThis = { process: { execPath: 'fixture-node' } }; globalThis.process.execPath = 'other-fixture-node' }\nmatch.constructor\nlaunch('node', ['--version'], { ...inherited, shell: false })\nlaunch('node', ['-h'], { shell: false })\nlaunch('node.exe', ['--', '-e'], { shell: false })\nlaunch(process.execPath, ['--enable-source-maps', '--', 'worker.mjs', ...runtimeArgs], { shell: false })\nlaunch(process.execPath, ['--', resolve(localScriptRoot(), 'worker.mjs')], { shell: false })\nlaunch(process.execPath, ['--', resolve(nestedScriptRoot(), 'worker.mjs')], { shell: false })\nlaunch(process.execPath, ['--', defaultScript()], { shell: false })\nlaunch('bash', ['--', process.argv[2]], { shell: false })\nfork('./worker.mjs', { execArgv: [] })\nfork(resolve(import.meta.dirname, 'worker.mjs'), { execArgv: [] })\nfork('./worker.mjs', { execPath: 'node.exe', execArgv: ['--'] })\nfork('./worker.mjs', ['fixture'], { execPath: process.execPath, execArgv: ['--enable-source-maps'] })\nexport { constructorName, constructorType, diagnosticText, isRegExp, match, reflectedName }\n")
    assert.equal(validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), true)

    const attacks = [
      ["import { execSync as run } from 'node:child_process'\nrun('printf unsafe')\n", /forbidden execSync|execSync string-shell/],
      ["import { execSync as run } from 'node:child_process'\nReflect.apply(run, null, ['printf unsafe'])\n", /forbidden execSync/],
      ["eval('2 + 2')\n", /forbidden eval/],
      ["const Build = Function\nBuild('return 1')()\n", /forbidden Function/],
      ["const Build = (() => {}).constructor\nBuild('return 1')()\n", /forbidden constructor/],
      ["const Build = (() => {}).constructor\nnew Build('return 1')\n", /forbidden constructor/],
      ["const Build = (() => {}).constructor\nBuild.bind(null)\n", /forbidden constructor/],
      ["const Build = (() => {}).constructor\nBuild.call(null, 'return 1')\n", /forbidden constructor/],
      ["const Build = (() => {}).constructor\nBuild.apply(null, ['return 1'])\n", /forbidden constructor/],
      ["const Build = (() => {}).constructor\nconsume(Build)\n", /forbidden constructor/],
      ["export const Build = (() => {}).constructor\n", /forbidden constructor/],
      ["const Build = (() => {}).constructor\nexport { Build }\n", /forbidden constructor/],
      ["const Build = (() => {}).constructor\nexport { Build as PublicBuild }\n", /forbidden constructor/],
      ["const { constructor: Build } = (() => {})\nBuild('return 1')\n", /forbidden constructor/],
      ["let Build\n({ constructor: Build } = (() => {}))\nBuild('return 1')\n", /forbidden constructor/],
      ["const match = /safe/.exec('safe')\nReflect.get(match, 'constructor')('return 1')\n", /forbidden constructor/],
      ["const fn = () => {}\nconst key = process.argv[2]\nfn[key]('return 1')\n", /forbidden constructor/],
      ["const fn = () => {}\nconst key = process.argv[2]\nconst Build = fn[key]\nBuild('return 1')\n", /forbidden constructor/],
      ["const fn = () => {}\nconst key = process.argv[2]\nReflect.get(fn, key)('return 1')\n", /forbidden constructor/],
      ["const fn = () => {}\nconst key = process.argv[2]\nReflect.apply(Reflect.get, null, [fn, key])('return 1')\n", /forbidden constructor/],
      ["function invoke(fn, key) { fn[key]('return 1') }\ninvoke(() => {}, process.argv[2])\n", /forbidden constructor/],
      ["function invoke(fn = () => {}, key = process.argv[2]) { fn[key]('return 1') }\ninvoke()\n", /forbidden constructor/],
      ["const object = { fn() {} }\nconst key = process.argv[2]\nobject.fn[key]('return 1')\n", /forbidden constructor/],
      ["Reflect.construct(globalThis.Function, ['return 1'])\n", /forbidden Function/],
      ["Reflect.get(globalThis, 'ev' + 'al')('2 + 2')\n", /forbidden eval/],
      ["const run = Reflect.get(globalThis, `Function`)\nrun('return 1')()\n", /forbidden Function/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', [], { shell: true })\n", /forbidden shell option/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', [], { ['shell']: true })\n", /forbidden shell option/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', [], { ['she' + 'll']: true })\n", /forbidden shell option/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', [], { __proto__: { shell: true } })\n", /forbidden shell option/],
      ["import { spawnSync as launch } from 'node:child_process'\nconst key = process.argv[2]\nlaunch('node', [], { [key]: true })\n", /unreviewable shell option/],
      ["import { spawnSync as launch } from 'node:child_process'\nconst options = getOptions()\nlaunch('node', [], options)\n", /unreviewable process options/],
      ["const { execFileSync: launch } = require('node:child_process')\nlaunch('sh', ['-c', 'printf unsafe'])\n", /shell command evaluation/],
      ["import { spawnSync as launch } from 'node:child_process'\nconst exe = 's' + 'h'\nconst flag = '-c'\nlaunch(exe, [flag, 'printf unsafe'])\n", /shell command evaluation/],
      ["import { spawnSync as launch } from 'node:child_process'\nconst exe = process.argv[2]\nconst args = JSON.parse(process.argv[3])\nlaunch(exe, args)\n", /ambiguous process argv\/options|dynamic executable and argv/],
      ["import { spawnSync as launch } from 'node:child_process'\nconst exe = process.argv[2]\nlaunch(exe, ['--', process.argv[3]], { shell: false })\n", /outside the reviewed allowlist|dynamic executable and argv/],
      ["import { spawnSync as launch } from 'node:child_process'\nlet exe = 'node'\nexe = 'sh'\nconst args = []\nargs.push('-c', 'printf unsafe')\nlaunch(exe, args, { shell: false })\n", /outside the reviewed allowlist|dynamic executable and argv|ambiguous process argv\/options/],
      ["import { spawnSync as launch } from 'node:child_process'\nconst options = { shell: false }\noptions.shell = true\nlaunch('node', [], options)\n", /unreviewable process options/],
      ["import { spawnSync as launch } from 'node:child_process'\nconst args = []\nmutate(args)\nlaunch(process.argv[2], args, { shell: false })\n", /outside the reviewed allowlist|dynamic executable and argv|ambiguous process argv\/options/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('bash', ['-xc', 'printf unsafe'], { shell: false })\n", /shell command evaluation/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('sh', ['-lc', 'printf unsafe'], { shell: false })\n", /shell command evaluation/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('bash.exe', ['-c', 'printf unsafe'], { shell: false })\n", /shell command evaluation/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('pwsh', ['--', '-enc', 'unsafe'], { shell: false })\n", /non-POSIX shell executable/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('/usr/bin/env', ['bash', '-c', 'printf unsafe'], { shell: false })\n", /outside the reviewed allowlist/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('busybox', ['sh', '-c', 'printf unsafe'], { shell: false })\n", /outside the reviewed allowlist/],
      ["import { spawnSync as launch } from 'node:child_process'\nprocess.execPath = '/bin/sh'\nlaunch(process.execPath, ['-c', 'printf unsafe'], { shell: false })\n", /outside the reviewed allowlist|shell command evaluation/],
      [Buffer.from('Y29uc3QgZ2VuZXJhdGVkSG9vayA9ICcjIS91c3IvYmluL2VudiBiYXNoXG5ub2RlIC1lICJwcm9jZXNzLmV4aXQoMCkiXG4nCndyaXRlRml4dHVyZShnZW5lcmF0ZWRIb29rKQo=', 'base64').toString('utf8'), /runtime-generated Node dynamic code/],
      ["function run(options) { return options }\nrun({ command: process.execPath, args: ['-e', '2 + 2'] })\n", /structured executor/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', ['-e', '2 + 2'], { shell: false })\n", /Node dynamic-code flags/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', ['-e=2 + 2'], { shell: false })\n", /Node dynamic-code flags/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', ['-p', '2 + 2'], { shell: false })\n", /Node dynamic-code flags/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', ['-p2 + 2'], { shell: false })\n", /Node dynamic-code flags/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node.exe', ['--eval=2 + 2'], { shell: false })\n", /Node dynamic-code flags/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node.exe', ['--print', '2 + 2'], { shell: false })\n", /Node dynamic-code flags/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch(process.execPath, ['--print=2 + 2'], { shell: false })\n", /Node dynamic-code flags/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('/usr/bin/node', ['-pe', '2 + 2'], { shell: false })\n", /Node dynamic-code flags/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', ['--require', './preload.mjs', '--eval', '2 + 2'], { shell: false })\n", /Node dynamic-code flags/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', ['--require', '/tmp/preload.cjs', '--', 'worker.mjs'], { shell: false })\n", /Node dynamic-code flags/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', ['--import=/tmp/preload.mjs', '--', 'worker.mjs'], { shell: false })\n", /Node dynamic-code flags/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', ['--run=test'], { shell: false })\n", /Node dynamic-code flags/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', ['--test', process.argv[2]], { shell: false })\n", /Node pre-script argv/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node')\n", /without a reviewed script operand or terminal flag/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', [])\n", /without a reviewed script operand or terminal flag/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', { shell: false })\n", /without a reviewed script operand or terminal flag/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', ['--enable-source-maps'])\n", /without a reviewed script operand or terminal flag/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', ['--enable-source-maps', 'worker.mjs'])\n", /without a reviewed script operand or terminal flag/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', ['--require', './preload.mjs', '--version'])\n", /Node dynamic-code flags/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch('node', ['--'])\n", /without a reviewed script operand or terminal flag/],
      ["import { spawnSync as launch } from 'node:child_process'\nlaunch(process.execPath, ['--', process.argv[2]], { shell: false })\n", /unreviewable Node script operand/],
      ["import { spawnSync as launch } from 'node:child_process'\nconst root = process.argv[2]\nlaunch(process.execPath, ['--', new URL('./worker.mjs', root).pathname], { shell: false })\n", /unreviewable Node script operand/],
      ["import { spawnSync as launch } from 'node:child_process'\nimport { resolve } from 'node:path'\nconst args = process.argv\nlaunch(process.execPath, ['--', resolve(args[2], 'worker.mjs')], { shell: false })\n", /unreviewable Node script operand/],
      ["import { spawnSync as launch } from 'node:child_process'\nimport { resolve } from 'node:path'\nconst { argv } = process\nlaunch(process.execPath, ['--', resolve(argv[2], 'worker.mjs')], { shell: false })\n", /unreviewable Node script operand/],
      ["import { spawnSync as launch } from 'node:child_process'\nfunction scriptPath() { return process.argv[2] }\nlaunch(process.execPath, ['--', scriptPath()], { shell: false })\n", /unreviewable Node script operand/],
      ["import { readFileSync } from 'node:fs'\nimport { spawnSync as launch } from 'node:child_process'\nfunction scriptPath() { return readFileSync('/tmp/reviewed-script-path', 'utf8') }\nlaunch(process.execPath, ['--', scriptPath()], { shell: false })\n", /unreviewable Node script operand/],
      ["import { spawnSync as launch } from 'node:child_process'\nfunction scriptPath(file = process.argv[2]) { return file }\nlaunch(process.execPath, ['--', scriptPath()], { shell: false })\n", /unreviewable Node script operand/],
      ["import { readFileSync } from 'node:fs'\nimport { spawnSync as launch } from 'node:child_process'\nfunction scriptPath(file = readFileSync('/tmp/reviewed-script-path', 'utf8')) { return file }\nlaunch(process.execPath, ['--', scriptPath()], { shell: false })\n", /unreviewable Node script operand/],
      ["import { spawnSync as launch } from 'node:child_process'\nfunction scriptPath() { return scriptPath() }\nlaunch(process.execPath, ['--', scriptPath()], { shell: false })\n", /unreviewable Node script operand/],
      ["import { spawnSync as launch } from 'node:child_process'\nlet scriptPath = './worker.mjs'\nlaunch(process.execPath, ['--', scriptPath], { shell: false })\n", /unreviewable Node script operand/],
      ["import { resolve } from 'node:path'\nimport { spawnSync as launch } from 'node:child_process'\nprocess.cwd = () => process.argv[2]\nlaunch('node', ['--', resolve(process.cwd(), 'worker.mjs')], { shell: false })\n", /unreviewable Node script operand/],
      ["import { fork } from 'node:child_process'\nfork(process.argv[2])\n", /fork module path/],
      ["import { fork } from 'node:child_process'\nconst modulePath = () => '--require=./payload.cjs'\nfork(modulePath(), ['ignored'], { execArgv: [] })\n", /fork module path/],
      ["import { fork } from 'node:child_process'\nfork('./worker.mjs')\n", /close inherited fork execArgv/],
      ["import { fork } from 'node:child_process'\nfork('./worker.mjs', { execPath: process.execPath })\n", /close inherited fork execArgv/],
      ["import { fork } from 'node:child_process'\nprocess.execPath = '/bin/sh'\nfork('./worker.mjs', { execArgv: [] })\n", /inherits a mutated fork execPath/],
      ["import { fork } from 'node:child_process'\nglobalThis.process.execPath = '/bin/sh'\nfork('./worker.mjs', { execArgv: [] })\n", /inherits a mutated fork execPath/],
      ["import { fork } from 'node:child_process'\nfork('-e', ['2 + 2'])\n", /fork module path/],
      ["import { fork } from 'node:child_process'\nfork('./worker.mjs', { execPath: 'sh' })\n", /forbidden fork execPath/],
      ["import { fork } from 'node:child_process'\nfork('./worker.mjs', { execPath: process.argv[2] })\n", /forbidden fork execPath/],
      ["import { fork } from 'node:child_process'\nfork('./worker.mjs', { execArgv: ['--eval=2 + 2'] })\n", /dynamic-code flags in fork execArgv/],
      ["import { fork } from 'node:child_process'\nfork('./worker.mjs', { execArgv: [process.argv[2]] })\n", /unreviewable fork execArgv/],
      ["import { fork } from 'node:child_process'\nfork('./worker.mjs', { execArgv: ['other-script.mjs'] })\n", /replace the reviewed module path/],
      ["import { fork } from 'node:child_process'\nfork('./worker.mjs', { execArgv: ['--version'] })\n", /unreviewed Node option in fork execArgv/],
      ["import { fork } from 'node:child_process'\nfork('./worker.mjs', { execArgv: ['--require=./preload.mjs'] })\n", /dynamic-code flags in fork execArgv/],
      ["const r = require\nr('node:' + 'child_process').execSync('printf unsafe')\n", /forbidden execSync/],
      ["const r = require\nReflect.get(r('node:child_process'), 'exec' + 'Sync')('printf unsafe')\n", /forbidden execSync/],
      ["import { execSync } from 'node:child_process'\nfunction unsafe(run = execSync) { run('printf unsafe') }\nunsafe()\n", /forbidden execSync/],
      ["const { get } = Reflect\nget(globalThis, 'eval')('2 + 2')\n", /forbidden eval/],
      ["function unsafe({ get } = Reflect) { get(globalThis, 'eval')('2 + 2') }\nunsafe()\n", /forbidden eval|privileged executable value escape/],
      ["const { get } = Reflect\nReflect.apply(get, null, [globalThis, 'eval'])('2 + 2')\n", /forbidden eval/],
      ["import { spawnSync } from 'node:child_process'\nReflect.apply(spawnSync, null, ['node', [], { shell: true }])\n", /indirect child_process invocation/],
      ["function unsafe(globalObject) { return globalObject.eval }\nunsafe(globalThis)('2 + 2')\n", /privileged executable value escape/],
      ["function unsafe(reflector) { return reflector.get(globalThis, 'eval') }\nunsafe(Reflect)('2 + 2')\n", /privileged executable value escape/],
      ["import { spawnSync } from 'node:child_process'\nfunction unsafe(run) { run('sh', ['-c', 'printf unsafe']) }\nunsafe(spawnSync)\n", /privileged executable value escape/],
      ["function unsafe(load) { return load('node:child_process') }\nunsafe(require).execSync('printf unsafe')\n", /privileged executable value escape/],
      ["import { createRequire } from 'node:module'\ncreateRequire(import.meta.url)('node:child_process').execSync('printf unsafe')\n", /createRequire module loading/],
      ["process.getBuiltinModule('child_process').execSync('printf unsafe')\n", /getBuiltinModule module loading/],
      ["import Module from 'node:module'\nModule._load('node:child_process').execSync('printf unsafe')\n", /private node:module loading/],
      ["import { runInNewContext } from 'node:vm'\nrunInNewContext('2 + 2')\n", /node:vm dynamic code/],
      ["await import(process.argv[2])\n", /dynamic module loading/],
      ["const cp = await import('node:child_process')\nfunction unsafe(namespace) { namespace.execSync('printf unsafe') }\nunsafe(cp)\n", /module namespace escape/],
      ["import { spawnSync } from 'node:child_process'\nconst args = []\nconst box = { args }\nbox.args.push('-c', 'printf unsafe')\nspawnSync('sh', args, { shell: false })\n", /ambiguous process argv\/options|unreviewable shell command arguments/],
      ["import { spawnSync } from 'node:child_process'\nconst args = []\nfunction mutate(alias = args) { alias.push('-c', 'printf unsafe') }\nmutate()\nspawnSync('sh', args, { shell: false })\n", /ambiguous process argv\/options|unreviewable shell command arguments/],
      ["import { spawnSync } from 'node:child_process'\nconst args = []\nconst alias = true ? args : []\nalias.push('-c', 'printf unsafe')\nspawnSync('sh', args, { shell: false })\n", /ambiguous process argv\/options|unreviewable shell command arguments/],
      ["const r = require\nconst name = process.argv[2]\nr(name)\n", /dynamic module loading/],
    ]
    for (const [source, expected] of attacks) {
      writeFileSync(target, source)
      assert.throws(
        () => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }),
        expected,
        `reviewed entrypoint attack was accepted:\n${source}`,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('paired meta members receive the same reviewed-entrypoint AST safety as suite and direct sources', () => {
  const { root, inventory, registry } = fixture()
  const pairedMember = resolve(root, inventory.pairedMeta.members[0])
  try {
    writeFileSync(pairedMember, "import { spawnSync } from 'node:child_process'\nspawnSync(process.execPath, ['--eval', '2 + 2'])\n")
    assert.throws(
      () => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }),
      /Node dynamic-code flags/,
      'paired meta ownership must not bypass reviewed-entrypoint safety',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('reviewed entrypoint cache is bytes, path, inode and link bound and never caches a failed verdict', () => {
  const { root, inventory, registry } = fixture()
  const target = join(root, 'packages/governance/test/suite.test.mjs')
  const swap = `${target}.swap`
  const alias = `${target}.alias`
  const safe = `${'export const cacheSafe = true'.padEnd(63, ' ')}\n`
  const unsafe = `${"eval('2 + 2')".padEnd(63, ' ')}\n`
  try {
    assert.equal(Buffer.byteLength(safe), Buffer.byteLength(unsafe))
    writeFileSync(target, safe)
    assert.equal(validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), true)
    assert.equal(validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), true)

    const originalTimes = statSync(target)
    writeFileSync(target, unsafe)
    utimesSync(target, originalTimes.atime, originalTimes.mtime)
    assert.throws(() => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), /forbidden eval/)
    assert.throws(() => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), /forbidden eval/)

    // A failed verdict must never poison the positive cache.
    writeFileSync(target, safe)
    assert.equal(validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), true)

    writeFileSync(swap, unsafe)
    renameSync(swap, target)
    assert.throws(() => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), /forbidden eval/)

    writeFileSync(target, safe)
    assert.equal(validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), true)
    writeFileSync(alias, safe)
    rmSync(target)
    linkSync(alias, target)
    assert.throws(() => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), /hard-link/)

    rmSync(target)
    writeFileSync(target, Buffer.alloc((4 * 1024 * 1024) + 1, 0x20))
    assert.throws(() => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), /source-size limit/)

    writeFileSync(target, Buffer.from([0xff, 0xfe, 0x00, 0x61]))
    assert.throws(() => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), /canonical UTF-8/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('links, diluted boundaries, exclusion drift and duplicate direct argv fail closed', () => {
  const { root, inventory, registry } = fixture()
  const staticNodePath = join(root, HARNESS_STATIC_EXECUTION_FIXTURE_ROOT, 'fixture-probe.mjs')
  const staticShellPath = join(root, HARNESS_STATIC_EXECUTION_FIXTURE_ROOT, 'fixture-shell.sh')
  const canonicalHelperPath = join(root, CANONICAL_HOOK_RUNTIME_ROOT, 'lib/static-helper.mjs')
  const canonicalHelperConsumerPath = join(root, CANONICAL_HOOK_RUNTIME_ROOT, 'fixture.sh')
  const staticNodeSource = readFileSync(staticNodePath)
  const staticShellSource = readFileSync(staticShellPath)
  const canonicalHelperConsumerSource = readFileSync(canonicalHelperConsumerPath)
  try {
    assert.throws(
      () => validateHarnessSourceInventory(inventory, { repoRoot: root }),
      /requires the canonical Harness registry join/,
    )

    const diluted = structuredClone(inventory)
    diluted.executionBoundary = 'Structured commands are a complete sandbox.'
    assert.throws(() => validateHarnessSourceInventory(diluted, { repoRoot: root, registry }), /boundary is diluted/)

    const gateAuthorityDrift = structuredClone(inventory)
    gateAuthorityDrift.gateMetaExclusions.sha256 = '0'.repeat(64)
    assert.throws(() => validateHarnessSourceInventory(gateAuthorityDrift, { repoRoot: root, registry }), /gate-meta exclusion digest drifted/)

    const externalOwnerDrift = structuredClone(inventory)
    externalOwnerDrift.externalExclusions = []
    assert.throws(() => validateHarnessSourceInventory(externalOwnerDrift, { repoRoot: root, registry }), /environmental gate-meta exclusions/)

    const nonGovernanceAuthorityDrift = structuredClone(inventory)
    nonGovernanceAuthorityDrift.nonGovernance.sha256 = '0'.repeat(64)
    assert.throws(() => validateHarnessSourceInventory(nonGovernanceAuthorityDrift, { repoRoot: root, registry }), /non-governance exclusion digest drifted/)

    const duplicateDirect = structuredClone(registry)
    duplicateDirect.entries.push({ commands: [['node', 'scripts/test-excluded-gate.mjs']] })
    assert.throws(() => validateHarnessSourceInventory(inventory, { repoRoot: root, registry: duplicateDirect }), /register the exact command once|exactly one registry command/)

    const staticDigestDrift = structuredClone(inventory)
    staticDigestDrift.staticExecutionFixtures.entries[0].sha256 = '0'.repeat(64)
    assert.throws(() => validateHarnessSourceInventory(staticDigestDrift, { repoRoot: root, registry }), /static-execution fixture digest drifted/)

    const canonicalHelperDigestDrift = structuredClone(inventory)
    canonicalHelperDigestDrift.canonicalHookStaticHelpers.entries[0].sha256 = '0'.repeat(64)
    assert.throws(() => validateHarnessSourceInventory(canonicalHelperDigestDrift, { repoRoot: root, registry }), /static-helper digest drifted/)

    const unregisteredCanonicalHelper = join(root, CANONICAL_HOOK_RUNTIME_ROOT, 'lib/unregistered.mjs')
    writeFileSync(unregisteredCanonicalHelper, 'export const unregistered = true\n')
    assert.throws(() => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), /static-helper inventory is not root-closed/)
    rmSync(unregisteredCanonicalHelper)

    writeFileSync(canonicalHelperConsumerPath, '#!/usr/bin/env bash\ntrue\n')
    assert.throws(() => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), /consumer lacks its helper reference/)
    writeFileSync(canonicalHelperConsumerPath, canonicalHelperConsumerSource)

    writeFileSync(
      canonicalHelperConsumerPath,
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'claude -p "review this canonical hook"',
        'HOOK_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"',
        'node -- "$HOOK_DIR/lib/static-helper.mjs"',
        '',
      ].join('\n'),
    )
    assert.equal(validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), true)
    writeFileSync(canonicalHelperConsumerPath, canonicalHelperConsumerSource)

    assert.equal(digest(canonicalHelperPath), inventory.canonicalHookStaticHelpers.entries[0].sha256)

    const unregisteredFixture = join(root, HARNESS_STATIC_EXECUTION_FIXTURE_ROOT, 'unregistered.mjs')
    writeFileSync(unregisteredFixture, 'export const unregistered = true\n')
    assert.throws(() => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), /fixture inventory is not root-closed/)
    rmSync(unregisteredFixture)

    writeFileSync(staticNodePath, "eval('2 + 2')\n")
    const unsafeStaticNode = structuredClone(inventory)
    unsafeStaticNode.staticExecutionFixtures.entries[0].sha256 = digest(staticNodePath)
    assert.throws(() => validateHarnessSourceInventory(unsafeStaticNode, { repoRoot: root, registry }), /forbidden eval/)
    writeFileSync(staticNodePath, staticNodeSource)

    const forbiddenStaticShellBodies = [
      ['#!/usr/bin/env bash', "node -e 'process.exit(0)'", ''],
      ['#!/usr/bin/env bash', "node - \"$REGISTRY\" <<'NODE'", 'process.exit(0)', 'NODE', ''],
      ['#!/usr/bin/env bash', "printf '%s' 'process.exit(0)' | node", ''],
      ['#!/usr/bin/env bash', 'if ! node --input-type=module -; then exit 1; fi', ''],
    ]
    for (const lines of forbiddenStaticShellBodies) {
      writeFileSync(staticShellPath, lines.join('\n'))
      const unsafeStaticShell = structuredClone(inventory)
      unsafeStaticShell.staticExecutionFixtures.entries[1].sha256 = digest(staticShellPath)
      assert.throws(
        () => validateHarnessSourceInventory(unsafeStaticShell, { repoRoot: root, registry }),
        /forbidden Node dynamic or stdin code/,
      )
      writeFileSync(staticShellPath, staticShellSource)
      writeFileSync(canonicalHelperConsumerPath, lines.join('\n'))
      assert.throws(
        () => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }),
        /canonical active shell uses forbidden Node dynamic or stdin code/,
      )
      writeFileSync(canonicalHelperConsumerPath, canonicalHelperConsumerSource)
    }
    writeFileSync(staticShellPath, staticShellSource)

    writeFileSync(
      staticShellPath,
      [
        '#!/usr/bin/env bash',
        'claude -p "review this fixture"',
        "printf '%s\\n' 'node -e is negative test data, not an invocation'",
        '',
      ].join('\n'),
    )
    const safeClaudePrint = structuredClone(inventory)
    safeClaudePrint.staticExecutionFixtures.entries[1].sha256 = digest(staticShellPath)
    assert.equal(validateHarnessSourceInventory(safeClaudePrint, { repoRoot: root, registry }), true)
    writeFileSync(staticShellPath, staticShellSource)

    rmSync(join(root, 'packages/governance/test/suite.test.mjs'))
    symlinkSync(join(root, 'infra/governance/test/hidden_case.test.mjs'), join(root, 'packages/governance/test/suite.test.mjs'))
    assert.throws(() => validateHarnessSourceInventory(inventory, { repoRoot: root, registry }), /symbolic link|no-symlink|regular/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('suite runner binds the production joins, source identity and whole-suite deadline', () => {
  const { root, inventory, registry } = fixture()
  const originalNow = Date.now
  try {
    const calls = []
    let now = 10_000
    Date.now = () => now
    const summary = runHarnessSuite({
      suiteId: 'fixture-remainder',
      repoRoot: root,
      inventory,
      registry,
      environment: { GOVERNANCE_HARNESS_ACTIVE: '1' },
      execute(argv, options) {
        calls.push({ argv, options })
        now += 5_000
        return { status: 'passed', exitCode: 0, signal: null, stdout: '', stderr: '' }
      },
    })
    assert.equal(summary.status, 'failed')
    assert.equal(calls.length, 1)
    assert.equal(summary.results[1].status, 'timed-out')
    assert.equal(calls[0].options.environment.GOVERNANCE_HARNESS_SUITE_ACTIVE, '1')
    assert.equal(summary.executionBoundary, HARNESS_EXECUTION_BOUNDARY)

    assert.throws(
      () => runHarnessSuite({ suiteId: 'fixture-remainder', repoRoot: root, inventory, registry, environment: {} }),
      /only run inside/,
    )
    assert.throws(
      () => runHarnessSuite({ suiteId: 'fixture-remainder', repoRoot: root, inventory, registry, environment: { GOVERNANCE_HARNESS_ACTIVE: '1', GOVERNANCE_HARNESS_SUITE_ACTIVE: '1' } }),
      /Nested Harness suite/,
    )
  } finally {
    Date.now = originalNow
    rmSync(root, { recursive: true, force: true })
  }
})

test('suite deadline is one total budget and cannot become member-count multiplied', () => {
  const { root, inventory, registry } = fixture()
  const originalNow = Date.now
  try {
    const observedTimeouts = []
    let now = 20_000
    Date.now = () => now
    const summary = runHarnessSuite({
      suiteId: 'fixture-remainder',
      repoRoot: root,
      inventory,
      registry,
      environment: { GOVERNANCE_HARNESS_ACTIVE: '1' },
      execute(_argv, options) {
        observedTimeouts.push(options.timeoutMs)
        now += 3_000
        return { status: 'passed', exitCode: 0, signal: null, stdout: '', stderr: '' }
      },
    })
    assert.deepEqual(observedTimeouts, [5_000, 2_000])
    assert.equal(summary.durationMs, 6_000)
    assert.equal(summary.status, 'failed')
    assert.equal(summary.results[0].status, 'passed')
    assert.equal(summary.results[1].status, 'timed-out')
    assert.equal(summary.results[1].deadlineExceeded, true)
  } finally {
    Date.now = originalNow
    rmSync(root, { recursive: true, force: true })
  }
})

test('aggregate suite executes the one fixed canonical hook argv and binds every member identity', () => {
  const { root, inventory, registry } = fixture()
  try {
    const summary = runHarnessSuite({
      suiteId: 'canonical-hook-behavioral',
      repoRoot: root,
      inventory,
      registry,
      environment: { GOVERNANCE_HARNESS_ACTIVE: '1' },
    })
    assert.equal(summary.status, 'passed')
    assert.equal(summary.results.length, 1)
    assert.deepEqual(summary.results[0].argv, [
      'bash',
      'packages/design-system/ds-canonical/hooks/tests/run-all.sh',
    ])
    assert.equal(summary.results[0].boundSourceIdentities.length, 5)
    assert.deepEqual(
      summary.results[0].boundSourceIdentities.map(identity => identity.path),
      [
        'packages/design-system/ds-canonical/hooks/tests/run-all.sh',
        'packages/design-system/ds-canonical/hooks/tests/test_fixture.sh',
        'packages/design-system/ds-canonical/hooks/lib/static-helper.mjs',
        'packages/design-system/ds-canonical/hooks/fixture.sh',
        'packages/design-system/ds-canonical/hooks/tests/fixture-helper.mjs',
      ],
    )
    assert.equal(summary.results[0].deadlineExceeded, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('suite runner detects pathname-visible source mutation during a member run', () => {
  const { root, inventory, registry } = fixture()
  try {
    const summary = runHarnessSuite({
      suiteId: 'fixture-remainder',
      repoRoot: root,
      inventory,
      registry,
      environment: { GOVERNANCE_HARNESS_ACTIVE: '1' },
      execute(argv) {
        writeFileSync(resolve(root, argv.at(-1)), 'export const changed = true\n')
        return { status: 'passed', exitCode: 0, signal: null, stdout: '', stderr: '' }
      },
    })
    assert.equal(summary.status, 'failed')
    assert.equal(summary.results[0].sourceStable, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

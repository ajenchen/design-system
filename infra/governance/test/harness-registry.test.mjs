import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  DEFAULT_REPO_ROOT,
  HARNESS_SETUP_OUTER_RESERVE_MS,
  HARNESS_DOMAIN_TAXONOMY,
  REQUIRED_HARNESS_DOMAINS,
  deriveAuthorityAllHarnessTimeoutMs,
  deriveHarnessAggregateTimeoutMs,
  deriveHarnessCheckerMutationCoverage,
  readHarnessAuthorityContracts,
  readHarnessRegistry,
  validateHarnessAuthorityContractDocument,
  validateHarnessAuthorityContracts,
  validateHarnessRegistry,
  validateHarnessSharedAuthorityClosures,
} from '../lib/harness-registry.mjs'

const registry = readHarnessRegistry()
const authorityContract = readHarnessAuthorityContracts()
const META_TEST_INVENTORY_SCRIPT = 'scripts/audit-gate-meta-test-coverage.mjs'
const META_TEST_INVENTORY_ARGS = ['--check']

const writeFixtureFile = (root, path, body) => {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, body)
}

test('shared closed-tool authority closure binds thin adapter, byte projections, manifests, mirror and npm pack', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-shared-authority-'))
  const closure = structuredClone(authorityContract.sharedAuthorityClosures[0])
  const canonicalPath = 'packages/governance/src/closed-tool-execution.mjs'
  const canonicalBody = "export const closedToolFixture = 'canonical'\n"
  const canonicalDigest = createHash('sha256').update(canonicalBody).digest('hex')
  const managedDestination = closure.managedFileProjection.destination
  const managedArtifactName = `${createHash('sha256').update(managedDestination).digest('hex')}.blob`
  const managedArtifactRelative = `consumer/managed-files/${managedArtifactName}`
  const managedArtifactPath = `${closure.managedFileProjection.artifactRoot}/${managedArtifactName}`
  const sourcePaths = new Map([
    [closure.canonicalSourceId, canonicalPath],
    [closure.adapter.sourceId, 'scripts/lib/closed-tool-execution.mjs'],
    ['exact-fork-governance-builder', 'scripts/build-fork-governance.mjs'],
    ['exact-published-template-mirror-builder', 'scripts/build-published-template-mirror.mjs'],
    ['exact-published-template-mirror-policy', 'scripts/published-template-mirror-policy.json'],
    ['governance-package-contract', 'packages/governance/package.json'],
    ['release-bom-builder', 'scripts/build-release-bom.mjs'],
  ])
  const manifest = {
    sources: [...sourcePaths].map(([id, path]) => ({
      id,
      ownerRepo: 'design-system',
      path,
      required: true,
    })),
  }
  const ownerCommand = ['node', 'fixture-shared-authority-owner.mjs']
  const ownerCommandByPath = new Map(closure.executedTestOwners.map(owner => [owner.path, ownerCommand]))
  const fixtureRegistry = { entries: [{ commands: [ownerCommand] }] }

  try {
    writeFixtureFile(fixtureRoot, canonicalPath, canonicalBody)
    writeFixtureFile(
      fixtureRoot,
      'scripts/lib/closed-tool-execution.mjs',
      "// Fixture thin adapter.\nexport * from '../../packages/governance/src/closed-tool-execution.mjs'\n",
    )
    writeFixtureFile(
      fixtureRoot,
      'scripts/build-fork-governance.mjs',
      [
        "const source = 'packages/governance/src/closed-tool-execution.mjs'",
        "const common = 'common/closed-tool-execution.mjs'",
        "const consumer = 'consumer/lib/closed-tool-execution.mjs'",
        "const destination = 'scripts/lib/closed-tool-execution.mjs'",
        "const artifacts = 'consumer/managed-files/'",
        '',
      ].join('\n'),
    )
    writeFixtureFile(
      fixtureRoot,
      'scripts/build-published-template-mirror.mjs',
      [
        "const source = 'packages/governance/src/closed-tool-execution.mjs'",
        "const destination = 'scripts/lib/closed-tool-execution.mjs'",
        '',
      ].join('\n'),
    )
    writeFixtureFile(
      fixtureRoot,
      'scripts/published-template-mirror-policy.json',
      `${JSON.stringify({
        schemaVersion: 2,
        exactPaths: [managedDestination],
        generatedExactPaths: [],
        pathPrefixes: [],
      }, null, 2)}\n`,
    )
    writeFixtureFile(
      fixtureRoot,
      'packages/governance/package.json',
      `${JSON.stringify({
        name: '@qijenchen/governance',
        type: 'module',
        files: ['src'],
        exports: {
          './closed-tool-execution': './src/closed-tool-execution.mjs',
        },
      }, null, 2)}\n`,
    )
    const releaseBuilderBody = [
      'const packageSources = [',
      "  ['@qijenchen/governance', 'packages/governance/package.json', [",
      "    'package/src/closed-tool-execution.mjs',",
      '  ]],',
      ']',
      '',
    ].join('\n')
    writeFixtureFile(fixtureRoot, 'scripts/build-release-bom.mjs', releaseBuilderBody)
    for (const projection of closure.directProjections) {
      writeFixtureFile(fixtureRoot, projection.path, canonicalBody)
    }
    writeFixtureFile(fixtureRoot, managedArtifactPath, canonicalBody)
    const corpusLock = {
      schemaVersion: 1,
      kind: 'fork-governance-corpus-lock',
      hashAlgorithm: 'sha256',
      entries: [
        {
          file: 'common/closed-tool-execution.mjs',
          sha256: canonicalDigest,
          source: canonicalPath,
          destination: null,
        },
        {
          file: 'consumer/lib/closed-tool-execution.mjs',
          sha256: canonicalDigest,
          source: canonicalPath,
          destination: null,
        },
        {
          file: managedArtifactRelative,
          sha256: canonicalDigest,
          source: canonicalPath,
          destination: managedDestination,
        },
      ],
    }
    writeFixtureFile(
      fixtureRoot,
      'packages/design-system/ds-canonical/fork/governance.lock',
      `${JSON.stringify(corpusLock, null, 2)}\n`,
    )
    writeFixtureFile(
      fixtureRoot,
      'packages/design-system/ds-canonical/fork/manifest.json',
      `${JSON.stringify({
        kind: 'provider-neutral-fork-manifest',
        consumer: {
          managedFiles: { [managedDestination]: managedArtifactRelative },
          materialization: { exactPaths: [managedDestination] },
        },
      }, null, 2)}\n`,
    )
    const consumerLockBody = `${JSON.stringify({
      payload: { managedFiles: { [managedDestination]: canonicalDigest } },
    }, null, 2)}\n`
    writeFixtureFile(
      fixtureRoot,
      'packages/design-system/ds-canonical/fork/consumer/lock.json',
      consumerLockBody,
    )
    writeFixtureFile(
      fixtureRoot,
      'template/ds-product-template/governance/lock.json',
      consumerLockBody,
    )
    for (const owner of closure.executedTestOwners) {
      writeFixtureFile(fixtureRoot, owner.path, owner.path === 'scripts/test-release-bom.mjs'
        ? "execFileSync('npm', ['pack', 'packages/governance'])\n"
        : '// fixture execution owner\n')
    }

    assert.equal(
      validateHarnessSharedAuthorityClosures([closure], {
        registry: fixtureRegistry,
        repoRoot: fixtureRoot,
        manifest,
        ownerCommandByPath,
      }),
      closure,
    )

    const missingProjection = structuredClone(closure)
    missingProjection.directProjections.pop()
    assert.throws(
      () => validateHarnessSharedAuthorityClosures([missingProjection], {
        registry: fixtureRegistry,
        repoRoot: fixtureRoot,
        manifest,
        ownerCommandByPath,
      }),
      /direct projection inventory is incomplete/,
    )

    const duplicatedDomainAuthority = structuredClone(fixtureRegistry)
    duplicatedDomainAuthority.entries[0].authorityPaths = [canonicalPath]
    assert.throws(
      () => validateHarnessSharedAuthorityClosures([closure], {
        registry: duplicatedDomainAuthority,
        repoRoot: fixtureRoot,
        manifest,
        ownerCommandByPath,
      }),
      /manually duplicated into domain authorityPaths/,
    )

    writeFixtureFile(
      fixtureRoot,
      'scripts/lib/closed-tool-execution.mjs',
      "export const bypass = true\nexport * from '../../packages/governance/src/closed-tool-execution.mjs'\n",
    )
    assert.throws(
      () => validateHarnessSharedAuthorityClosures([closure], {
        registry: fixtureRegistry,
        repoRoot: fixtureRoot,
        manifest,
        ownerCommandByPath,
      }),
      /behavior beyond the one static re-export/,
    )
    writeFixtureFile(
      fixtureRoot,
      'scripts/lib/closed-tool-execution.mjs',
      "// Fixture thin adapter.\nexport * from '../../packages/governance/src/closed-tool-execution.mjs'\n",
    )

    writeFixtureFile(fixtureRoot, closure.directProjections[0].path, 'tampered\n')
    assert.throws(
      () => validateHarnessSharedAuthorityClosures([closure], {
        registry: fixtureRegistry,
        repoRoot: fixtureRoot,
        manifest,
        ownerCommandByPath,
      }),
      /not canonical-byte-exact/,
    )
    writeFixtureFile(fixtureRoot, closure.directProjections[0].path, canonicalBody)

    writeFixtureFile(fixtureRoot, managedArtifactPath, 'tampered managed artifact\n')
    assert.throws(
      () => validateHarnessSharedAuthorityClosures([closure], {
        registry: fixtureRegistry,
        repoRoot: fixtureRoot,
        manifest,
        ownerCommandByPath,
      }),
      /managed-file artifact is not canonical-byte-exact/,
    )
    writeFixtureFile(fixtureRoot, managedArtifactPath, canonicalBody)

    const missingSharedOwner = structuredClone(closure)
    missingSharedOwner.executedTestOwners.pop()
    assert.throws(
      () => validateHarnessSharedAuthorityClosures([missingSharedOwner], {
        registry: fixtureRegistry,
        repoRoot: fixtureRoot,
        manifest,
        ownerCommandByPath,
      }),
      /execution-owner closure is incomplete/,
    )

    const missingOwnerTopology = new Map(ownerCommandByPath)
    missingOwnerTopology.delete(closure.executedTestOwners[0].path)
    assert.throws(
      () => validateHarnessSharedAuthorityClosures([closure], {
        registry: fixtureRegistry,
        repoRoot: fixtureRoot,
        manifest,
        ownerCommandByPath: missingOwnerTopology,
      }),
      /execution owner is absent from the source inventory/,
    )

    const unregisteredOwnerRegistry = { entries: [{ commands: [] }] }
    assert.throws(
      () => validateHarnessSharedAuthorityClosures([closure], {
        registry: unregisteredOwnerRegistry,
        repoRoot: fixtureRoot,
        manifest,
        ownerCommandByPath,
      }),
      /execution owner has no registered Harness command/,
    )

    const sourceBindingPoison = structuredClone(manifest)
    sourceBindingPoison.sources.find(source => source.id === closure.canonicalSourceId).path =
      'scripts/lib/closed-tool-execution.mjs'
    assert.throws(
      () => validateHarnessSharedAuthorityClosures([closure], {
        registry: fixtureRegistry,
        repoRoot: fixtureRoot,
        manifest: sourceBindingPoison,
        ownerCommandByPath,
      }),
      /canonical manifest binding drifted/,
    )

    const dilutedSharedClaims = structuredClone(closure)
    dilutedSharedClaims.claims.proves = ['A generic shared runtime exists without an exact projection guarantee.']
    assert.throws(
      () => validateHarnessSharedAuthorityClosures([dilutedSharedClaims], {
        registry: fixtureRegistry,
        repoRoot: fixtureRoot,
        manifest,
        ownerCommandByPath,
      }),
      /shared claims are not the exact closed projection/,
    )

    const poisonedCorpusLock = structuredClone(corpusLock)
    poisonedCorpusLock.entries.find(entry => entry.file === 'common/closed-tool-execution.mjs').sha256 =
      '0'.repeat(64)
    writeFixtureFile(
      fixtureRoot,
      'packages/design-system/ds-canonical/fork/governance.lock',
      `${JSON.stringify(poisonedCorpusLock, null, 2)}\n`,
    )
    assert.throws(
      () => validateHarnessSharedAuthorityClosures([closure], {
        registry: fixtureRegistry,
        repoRoot: fixtureRoot,
        manifest,
        ownerCommandByPath,
      }),
      /fork lock binding is absent or divergent/,
    )
    writeFixtureFile(
      fixtureRoot,
      'packages/design-system/ds-canonical/fork/governance.lock',
      `${JSON.stringify(corpusLock, null, 2)}\n`,
    )

    writeFixtureFile(
      fixtureRoot,
      'scripts/build-release-bom.mjs',
      releaseBuilderBody.replace("    'package/src/closed-tool-execution.mjs',\n", ''),
    )
    assert.throws(
      () => validateHarnessSharedAuthorityClosures([closure], {
        registry: fixtureRegistry,
        repoRoot: fixtureRoot,
        manifest,
        ownerCommandByPath,
      }),
      /does not require the closed-tool npm archive entry/,
    )
    writeFixtureFile(fixtureRoot, 'scripts/build-release-bom.mjs', releaseBuilderBody)

    const authorityPoisonedManifest = structuredClone(manifest)
    authorityPoisonedManifest.sources.push({
      id: 'forbidden-generated-projection-authority',
      ownerRepo: 'design-system',
      path: closure.directProjections[0].path,
      required: true,
    })
    assert.throws(
      () => validateHarnessSharedAuthorityClosures([closure], {
        registry: fixtureRegistry,
        repoRoot: fixtureRoot,
        manifest: authorityPoisonedManifest,
        ownerCommandByPath,
      }),
      /promoted to canonical authority/,
    )
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('Harness registry is closed, complete and bound to real no-symlink authority and test paths', () => {
  const schema = JSON.parse(readFileSync(resolve(DEFAULT_REPO_ROOT, 'infra/governance/schemas/harness-registry.schema.json'), 'utf8'))
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  assert.equal(validate(registry), true, new Ajv2020().errorsText(validate.errors))
  const authoritySchema = JSON.parse(readFileSync(resolve(DEFAULT_REPO_ROOT, 'infra/governance/schemas/harness-authority-contracts.schema.json'), 'utf8'))
  const validateAuthority = new Ajv2020({ allErrors: true, strict: true }).compile(authoritySchema)
  assert.equal(validateAuthority(authorityContract), true, new Ajv2020().errorsText(validateAuthority.errors))
  assert.equal(validateHarnessRegistry(registry), true)
  assert.equal(validateHarnessAuthorityContractDocument(authorityContract, { registry }), authorityContract)
  assert.deepEqual(registry.requiredDomains, REQUIRED_HARNESS_DOMAINS)
  assert.deepEqual(registry.domainTaxonomy, HARNESS_DOMAIN_TAXONOMY)
  assert.equal(registry.authorityContract.schemaVersion, 2)
  assert.equal(authorityContract.schemaVersion, 2)
  assert.equal(
    registry.sharedAuthorityPolicy,
    'shared-closures-live-once-in-the-authority-contract-and-are-not-duplicated-across-domain-authority-paths',
  )
  assert.deepEqual(registry.entries.slice(0, REQUIRED_HARNESS_DOMAINS.length).map(entry => entry.domain), REQUIRED_HARNESS_DOMAINS)
  const hookCommand = ['node', 'infra/governance/bin/run-harness-suite.mjs', '--suite', 'canonical-hook-behavioral']
  assert.ok(registry.entries.find(entry => entry.domain === 'fake-green').commands.some(command => JSON.stringify(command) === JSON.stringify(hookCommand)))
  assert.equal(
    registry.runner.timeoutOverrides.find(override => JSON.stringify(override.command) === JSON.stringify(hookCommand)).timeoutMs,
    1_860_000,
  )
  assert.deepEqual(registry.runner.requiredConsumers.map(consumer => consumer.path), [
    '.devcontainer/post-create.mjs',
  ])
  assert.deepEqual(registry.runner.requiredConsumers.at(-1), {
    path: '.devcontainer/post-create.mjs',
    invocationKind: 'js-authority-setup-wrapper',
    argv: ['node', '.devcontainer/post-create.mjs'],
  })
  const cloudEntry = registry.entries.find(entry => entry.domain === 'cloud')
  assert.ok(cloudEntry.testPaths.includes('infra/governance/test/authority-setup.test.mjs'))
  assert.ok(cloudEntry.authorityPaths.includes('scripts/lib/verified-exact-npm-runtime.mjs'))
  assert.ok(cloudEntry.authorityPaths.includes('package.json'))
  assert.ok(cloudEntry.authorityPaths.includes('scripts/setup-authority-governance.mjs'))
  assert.ok(cloudEntry.authorityPaths.includes('scripts/setup-workspace.mjs'))
  assert.ok(cloudEntry.authorityPaths.includes('scripts/setup-provider-cli-toolchain.mjs'))
  assert.ok(cloudEntry.authorityPaths.includes('infra/governance/bin/run-harnesses.mjs'))

  const bootstrapAuthorityPaths = [
    'infra/governance/bin/consumerctl.mjs',
    'infra/governance/lib/consumer-bootstrap.mjs',
    'infra/governance/schemas/consumer-bootstrap-plan.schema.json',
    'infra/governance/schemas/consumer-bootstrap-snapshot-verification.schema.json',
    'infra/governance/schemas/consumer-bootstrap-readback-verification.schema.json',
    'infra/governance/schemas/consumer-bootstrap-promotion-proposal.schema.json',
    'infra/governance/schemas/consumer-fanout-review.schema.json',
    'infra/governance/schemas/consumer-fanout-dispatch-evidence.schema.json',
    'infra/governance/schemas/managed-repos.schema.json',
  ]
  for (const domain of ['upgrade', 'fleet']) {
    const entry = registry.entries.find(candidate => candidate.domain === domain)
    assert.ok(entry.testPaths.includes('infra/governance/test/consumerctl.test.mjs'))
    for (const path of bootstrapAuthorityPaths) {
      assert.ok(entry.authorityPaths.includes(path), `${domain} Harness lost bootstrap authority traceability for ${path}`)
    }
  }

  const openShape = structuredClone(registry)
  openShape.entries[0].unreviewedClaim = true
  assert.equal(validate(openShape), false, 'Harness registry accepted an unreviewed claim field')

  const escapedPath = structuredClone(registry)
  escapedPath.entries[0].authorityPaths[0] = '../outside'
  assert.equal(validate(escapedPath), false, 'Harness registry accepted a path escape')

  const broadOnlyAuthority = structuredClone(registry)
  broadOnlyAuthority.entries[0].authorityPaths.push('infra/governance/lib/external-activation.mjs')
  assert.throws(
    () => validateHarnessRegistry(broadOnlyAuthority),
    /authorityPaths drifted from the independent claim contract/,
    'Harness registry accepted an authority path absent from its independent claim contract',
  )

  const broadDirectoryContract = structuredClone(authorityContract)
  const broadEntry = broadDirectoryContract.entries.find(entry => entry.domain === 'install')
  broadEntry.authoritySourceIds = broadEntry.authoritySourceIds.map(sourceId =>
    sourceId === 'governance-root-script-registry' ? 'repository-automation-corpus' : sourceId)
  for (const claim of broadEntry.claims) {
    claim.sourceIds = claim.sourceIds.map(sourceId =>
      sourceId === 'governance-root-script-registry' ? 'repository-automation-corpus' : sourceId)
  }
  assert.throws(
    () => validateHarnessAuthorityContractDocument(broadDirectoryContract, { registry }),
    /unreviewed broad directory/,
    'Harness claim contract accepted a broad directory manifest source as authority',
  )

  const nodeEval = structuredClone(registry)
  nodeEval.entries[0].commands[0] = ['node', '--eval', 'process.exit(0)']
  assert.throws(() => validateHarnessRegistry(nodeEval), /Node evaluation|entrypoint|argument shape/)

  const shellRunner = structuredClone(registry)
  shellRunner.entries[0].commands[0] = ['npm', 'test']
  assert.throws(() => validateHarnessRegistry(shellRunner), /committed Node entrypoint/)

  for (const unreviewedCommand of [
    ['node', 'scripts/run-gate-meta-tests.mjs', '--extra'],
    ['node', 'infra/governance/bin/run-harness-suite.mjs', '--suite=governance-script-remainder'],
    ['node', '--test', 'infra/governance/test/harness-registry.test.mjs', '--test-name-pattern', 'only'],
    ['node', 'scripts/sync-all.mjs'],
  ]) {
    const openArgv = structuredClone(registry)
    openArgv.entries[0].commands[0] = unreviewedCommand
    assert.equal(validate(openArgv), false, `Harness registry schema accepted open argv:${JSON.stringify(unreviewedCommand)}`)
    assert.throws(
      () => validateHarnessRegistry(openArgv),
      /Harness whitelist|argument shape|Node evaluation|registered execution owner|source-execution topology/,
    )
  }

  const mutatingEntrypoint = structuredClone(registry)
  mutatingEntrypoint.entries[0].commands[0] = ['node', 'scripts/sync-all.mjs']
  assert.throws(() => validateHarnessRegistry(mutatingEntrypoint), /source-execution topology|not registered|suite is not registered/)

  const recursiveRunner = structuredClone(registry)
  recursiveRunner.entries[0].commands[0] = ['node', 'infra/governance/bin/run-harnesses.mjs']
  assert.throws(() => validateHarnessRegistry(recursiveRunner), /recursively execute/)

  const dilutedRunner = structuredClone(registry)
  dilutedRunner.runner.certificationPolicy = 'local-pass-means-cloud-certified'
  assert.throws(() => validateHarnessRegistry(dilutedRunner), /may not promote external certification claims/)

  const wrongInventoryDigest = structuredClone(registry)
  wrongInventoryDigest.sourceInventory.sha256 = '0'.repeat(64)
  assert.throws(() => validateHarnessRegistry(wrongInventoryDigest), /source inventory digest drifted/)

  const missingCloudConsumer = structuredClone(registry)
  missingCloudConsumer.runner.requiredConsumers.pop()
  assert.throws(() => validateHarnessRegistry(missingCloudConsumer), /consumer contracts are incomplete/)

  const missingTimeout = structuredClone(registry)
  missingTimeout.runner.timeoutOverrides = missingTimeout.runner.timeoutOverrides.filter(override => override.command.at(-1) !== 'consumer-clean-room')
  assert.throws(() => validateHarnessRegistry(missingTimeout), /outer process-group deadline/)

  const absentTimeoutContract = structuredClone(registry)
  delete absentTimeoutContract.runner.timeoutOverrides
  assert.equal(validate(absentTimeoutContract), false)
  assert.throws(
    () => validateHarnessRegistry(absentTimeoutContract),
    error => !(error instanceof TypeError) && /invalid or open shape|timeout overrides/.test(error.message),
  )

  const duplicateDirect = structuredClone(registry)
  duplicateDirect.entries[0].commands.push(['node', 'scripts/test-codex-run-guarded.mjs'])
  assert.throws(() => validateHarnessRegistry(duplicateDirect), /exact command once|exactly one registry command/)

  const uniqueCommands = [...new Map(registry.entries.flatMap(entry => entry.commands).map(command => [JSON.stringify(command), command])).values()]
  const timeoutByCommand = new Map(registry.runner.timeoutOverrides.map(override => [JSON.stringify(override.command), override.timeoutMs]))
  const aggregateTimeoutMs = uniqueCommands.reduce(
    (total, command) => total + (timeoutByCommand.get(JSON.stringify(command)) ?? registry.runner.defaultTimeoutMs),
    0,
  )
  assert.equal(deriveHarnessAggregateTimeoutMs(registry), aggregateTimeoutMs)
  assert.equal(deriveAuthorityAllHarnessTimeoutMs(registry), deriveHarnessAggregateTimeoutMs(registry) + HARNESS_SETUP_OUTER_RESERVE_MS)
  assert.ok(deriveAuthorityAllHarnessTimeoutMs(registry) > 15 * 60_000, 'authority setup regressed to the old 15-minute bootstrap timeout')
})

test('versioned Harness taxonomy preserves ordered core domains and admits only append-only portable extensions', () => {
  const extended = structuredClone(registry)
  const source = extended.entries.find(entry => entry.domain === 'fake-green')
  extended.entries.push({
    ...structuredClone(source),
    id: 'extension-policy-probe',
    domain: 'x-policy-probe',
    proves: ['The extension adds a separately named coverage domain without replacing any mandatory core domain.'],
    doesNotProve: ['The extension cannot weaken, reorder, rename or substitute for any mandatory core Harness semantics.'],
  })
  assert.throws(
    () => validateHarnessRegistry(extended),
    /authority contract entry count differs from the registry/,
    'A registry-only extension bypassed the independent claim contract',
  )

  const replacedCore = structuredClone(extended)
  replacedCore.entries[3].domain = 'x-process-replacement'
  replacedCore.entries[3].id = 'extension-process-replacement'
  assert.throws(() => validateHarnessRegistry(replacedCore), /mandatory core domain is missing, replaced or reordered/)

  const insertedExtension = structuredClone(extended)
  insertedExtension.entries.unshift(insertedExtension.entries.pop())
  assert.throws(() => validateHarnessRegistry(insertedExtension), /mandatory core domain is missing, replaced or reordered/)

  const unnamespaced = structuredClone(extended)
  unnamespaced.entries.at(-1).domain = 'policy-probe'
  assert.throws(() => validateHarnessRegistry(unnamespaced), /portable x- namespace/)

  const mismatchedId = structuredClone(extended)
  mismatchedId.entries.at(-1).id = 'extension-other'
  assert.throws(() => validateHarnessRegistry(mismatchedId), /id must be derived from its domain/)

  const unsorted = structuredClone(extended)
  unsorted.entries.push({
    ...structuredClone(source),
    id: 'extension-alpha-probe',
    domain: 'x-alpha-probe',
  })
  assert.throws(() => validateHarnessRegistry(unsorted), /extension domains must be appended in sorted order/)

  const openExtension = structuredClone(extended)
  openExtension.entries.at(-1).extensionEscape = true
  const schema = JSON.parse(readFileSync(resolve(DEFAULT_REPO_ROOT, 'infra/governance/schemas/harness-registry.schema.json'), 'utf8'))
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  assert.equal(validate(openExtension), false, 'Harness extension accepted an open entry shape')
})

test('registry claim projections and external-certification boundaries fail closed when weakened', () => {
  const fakeCloudGreen = structuredClone(registry)
  fakeCloudGreen.entries.find(entry => entry.domain === 'cloud').certificationClaim = 'local-harness-only'
  assert.throws(() => validateHarnessRegistry(fakeCloudGreen), /Cloud Harness must remain not-certified/)

  const fakeCloudExecution = structuredClone(registry)
  fakeCloudExecution.entries.find(entry => entry.domain === 'cloud').doesNotProve = [
    'No fresh-clone cloud run has completed.',
  ]
  assert.throws(() => validateHarnessRegistry(fakeCloudExecution), /proves\/doesNotProve drifted from the independent claim contract/)

  const fakeMirrorGreen = structuredClone(registry)
  fakeMirrorGreen.entries.find(entry => entry.domain === 'mirror').certificationClaim = 'local-harness-only'
  assert.throws(() => validateHarnessRegistry(fakeMirrorGreen), /mirror must require external readback/)

  const powerLossOverclaim = structuredClone(registry)
  powerLossOverclaim.entries.find(entry => entry.domain === 'process-crash').doesNotProve = ['No unrelated claim.']
  assert.throws(() => validateHarnessRegistry(powerLossOverclaim), /proves\/doesNotProve drifted from the independent claim contract/)

  const openDescriptorOverclaim = structuredClone(registry)
  openDescriptorOverclaim.entries.find(entry => entry.domain === 'upgrade').doesNotProve = ['No unrelated claim.']
  assert.throws(() => validateHarnessRegistry(openDescriptorOverclaim), /proves\/doesNotProve drifted from the independent claim contract/)

  const concurrentEditDilution = structuredClone(registry)
  concurrentEditDilution.entries.find(entry => entry.domain === 'process-crash').proves = ['Process-crash recovery only.']
  assert.throws(() => validateHarnessRegistry(concurrentEditDilution), /proves\/doesNotProve drifted from the independent claim contract/)

  const templateLeak = structuredClone(registry)
  templateLeak.entries.find(entry => entry.domain === 'template-consumer').proves = ['Generic template test only.']
  assert.throws(() => validateHarnessRegistry(templateLeak), /proves\/doesNotProve drifted from the independent claim contract/)

  const sameProviderReview = structuredClone(registry)
  sameProviderReview.entries.find(entry => entry.domain === 'second-opinion').doesNotProve = ['No external runtime claim.']
  assert.throws(() => validateHarnessRegistry(sameProviderReview), /proves\/doesNotProve drifted from the independent claim contract/)

  const conflatedModelAuthority = structuredClone(registry)
  conflatedModelAuthority.entries.find(entry => entry.domain === 'second-opinion').proves = [
    'Deep audit requires explicit author identity and a registry-selected peer provider distinct from both the author and current provider.',
    'Every admitted provider resolves review transport, model, context and certification through the canonical review binding.',
    'Product consumers receive a separate read-only independent-review workflow without DS-author, release, deep-audit-remediation or mutation authority.',
  ]
  assert.throws(() => validateHarnessRegistry(conflatedModelAuthority), /proves\/doesNotProve drifted from the independent claim contract/)

  const inferredModelPromotion = structuredClone(registry)
  inferredModelPromotion.entries.find(entry => entry.domain === 'second-opinion').doesNotProve = [
    'A second opinion occurred unless immutable, read-only peer evidence from a separate execution context is present.',
    'One provider reviewing itself is independent review.',
  ]
  assert.throws(() => validateHarnessRegistry(inferredModelPromotion), /proves\/doesNotProve drifted from the independent claim contract/)

  const productRoleLeak = structuredClone(registry)
  productRoleLeak.entries.find(entry => entry.domain === 'second-opinion').proves = [
    'Deep audit requires explicit author identity and a registered peer provider distinct from both the author and current provider.',
  ]
  assert.throws(() => validateHarnessRegistry(productRoleLeak), /proves\/doesNotProve drifted from the independent claim contract/)

  const mirrorBehaviorOverclaim = structuredClone(registry)
  const mirrorBehaviorEntry = mirrorBehaviorOverclaim.entries.find(entry => entry.domain === 'fake-green')
  mirrorBehaviorEntry.proves = mirrorBehaviorEntry.proves.map(statement =>
    statement.includes('canonical hook behavioral suite')
      ? 'Generated mirror tests provide a second independent behavioral execution.'
      : statement,
  )
  assert.throws(() => validateHarnessRegistry(mirrorBehaviorOverclaim), /proves\/doesNotProve drifted from the independent claim contract/)
})

test('independent claim authority SSOT rejects missing claims, sources, owners and registry-only rewrites', () => {
  const duplicatedSharedAuthority = structuredClone(authorityContract)
  duplicatedSharedAuthority.entries[0].authoritySourceIds.push('exact-closed-tool-execution-library')
  assert.throws(
    () => validateHarnessAuthorityContractDocument(duplicatedSharedAuthority, { registry }),
    /manually duplicated into domain claim closure/,
    'Harness domain claim closure duplicated a globally shared authority source',
  )

  const obsoleteRegistryBinding = structuredClone(registry)
  obsoleteRegistryBinding.authorityContract.schemaVersion = 1
  assert.throws(
    () => validateHarnessAuthorityContracts(obsoleteRegistryBinding),
    /fixed path, identity or projection policy is invalid/,
    'Harness registry accepted the obsolete v1 authority-contract identity',
  )

  const obsoleteContractIdentity = structuredClone(authorityContract)
  obsoleteContractIdentity.schemaVersion = 1
  assert.throws(
    () => validateHarnessAuthorityContractDocument(obsoleteContractIdentity, { registry }),
    /authority contract schema failed|identity or closure policy is invalid/,
    'Harness validator accepted the obsolete v1 authority-contract document',
  )

  const changedContractPath = structuredClone(registry)
  changedContractPath.authorityContract.path = 'infra/governance/providers/alternate-authority-contracts.json'
  assert.throws(
    () => validateHarnessAuthorityContracts(changedContractPath),
    /fixed path/,
    'Harness registry accepted a caller-selected authority-contract path',
  )

  const changedContractDigest = structuredClone(registry)
  changedContractDigest.authorityContract.sha256 = '0'.repeat(64)
  assert.throws(
    () => validateHarnessAuthorityContracts(changedContractDigest),
    /authority contract digest drifted/,
    'Harness registry accepted a rehashed-old authority-contract binding',
  )

  const changedSchemaDigest = structuredClone(registry)
  changedSchemaDigest.authorityContract.schemaSha256 = '0'.repeat(64)
  assert.throws(
    () => validateHarnessAuthorityContracts(changedSchemaDigest),
    /authority contract schema digest drifted/,
    'Harness registry accepted a rehashed-old authority-contract schema binding',
  )

  const missingClaim = structuredClone(authorityContract)
  missingClaim.entries[0].claims.shift()
  assert.throws(
    () => validateHarnessAuthorityContractDocument(missingClaim, { registry }),
    /claim (?:source union|id is not stable)|proves\/doesNotProve drifted/,
    'Harness authority contract accepted a deleted stable claim',
  )

  const missingSource = structuredClone(authorityContract)
  const proposalClaim = missingSource.entries[0].claims.find(claim => claim.claimId === 'fresh-install-and-setup.proves.04')
  proposalClaim.sourceIds = proposalClaim.sourceIds.filter(sourceId => sourceId !== 'exact-provider-cli-proposal-verifier-fixture')
  assert.throws(
    () => validateHarnessAuthorityContractDocument(missingSource, { registry }),
    /claim source union is not an exact closed projection/,
    'Harness authority contract accepted a deleted claim source id',
  )

  const missingOwner = structuredClone(authorityContract)
  const installContract = missingOwner.entries.find(entry => entry.domain === 'install')
  installContract.executedTestOwners = installContract.executedTestOwners.filter(owner => owner.path !== 'scripts/test-propose-provider-cli-package-content.mjs')
  assert.throws(
    () => validateHarnessAuthorityContractDocument(missingOwner, { registry }),
    /owner outside its entry closure|testPaths drifted/,
    'Harness authority contract accepted a deleted executed test owner',
  )

  const orphanEntry = structuredClone(authorityContract)
  orphanEntry.entries.push({
    ...structuredClone(orphanEntry.entries.at(-1)),
    entryId: 'extension-orphan',
    domain: 'x-orphan',
  })
  assert.throws(
    () => validateHarnessAuthorityContractDocument(orphanEntry, { registry }),
    /entry count differs from the registry/,
    'Harness authority contract accepted an orphan extra domain',
  )

  const divergentDomain = structuredClone(authorityContract)
  divergentDomain.entries[0].domain = 'x-divergent'
  assert.throws(
    () => validateHarnessAuthorityContractDocument(divergentDomain, { registry }),
    /orphaned, extra or reordered/,
    'Harness authority contract accepted a domain divergent from its registry entry',
  )

  const invalidGraphOwner = structuredClone(authorityContract)
  invalidGraphOwner.entries[0].executedTestOwners[0] = { kind: 'graph-stage', stageId: 'missing-stage' }
  invalidGraphOwner.entries[0].claims[0].executionOwners[0] = { kind: 'graph-stage', stageId: 'missing-stage' }
  assert.throws(
    () => validateHarnessAuthorityContractDocument(invalidGraphOwner, { registry }),
    /not a runtime-backed governance graph stage/,
    'Harness authority contract accepted an unknown graph-stage owner',
  )

  const criticalAuthorities = [
    ['install', 'scripts/setup-governance.mjs'],
    ['rollback', 'infra/governance/bin/reconcile-github.mjs'],
    ['process-crash', 'scripts/sync-all.mjs'],
    ['provider-lifecycle', 'packages/governance/canonical/providers.json'],
    ['template-consumer', 'scripts/build-fork-governance.mjs'],
    ['second-opinion', 'packages/governance/src/provider-review-binding.mjs'],
    ['mirror', 'scripts/generate-product-template-package-lock.mjs'],
    ['release', 'scripts/release-bom-contract.mjs'],
    ['fleet', 'infra/governance/schemas/consumer-fanout-dispatch-evidence.schema.json'],
    ['fleet', 'infra/governance/schemas/fleet-reconcile-bootstrap-transaction.schema.json'],
    ['fleet', 'infra/governance/schemas/fleet-reconcile-bootstrap-replay-receipt.schema.json'],
    ['evidence', 'scripts/lib/ci-evidence-live-observer.mjs'],
    ['fake-green', 'scripts/audit-gate-meta-test-coverage.mjs'],
  ]
  for (const [domain, path] of criticalAuthorities) {
    const missingAuthority = structuredClone(registry)
    const entry = missingAuthority.entries.find(candidate => candidate.domain === domain)
    entry.authorityPaths = entry.authorityPaths.filter(candidate => candidate !== path)
    assert.throws(
      () => validateHarnessAuthorityContractDocument(authorityContract, { registry: missingAuthority }),
      /authority claim references a source outside its entry closure|authorityPaths drifted from the independent claim contract/,
      `${domain} Harness accepted a deleted critical authority after the obsolete entry self-hash was removed`,
    )
  }
})

test('meta-test inventory derives full zero-debt checker coverage while preserving live external-certification boundaries', () => {
  assert.deepEqual(
    registry.metaTestCoverage.inventoryCommand,
    ['node', META_TEST_INVENTORY_SCRIPT, ...META_TEST_INVENTORY_ARGS],
    'meta-test inventory execution must remain bound to the fixed reviewed entrypoint',
  )
  const result = spawnSync(process.execPath, [
    '--',
    META_TEST_INVENTORY_SCRIPT,
    ...META_TEST_INVENTORY_ARGS,
  ], {
    cwd: DEFAULT_REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const match = result.stdout.match(/checker gate:\s*(\d+)\s*\/\s*有 meta-test:\s*(\d+)\s*\/\s*缺:\s*(\d+)/)
  assert.ok(match, `unexpected gate coverage output:${result.stdout}`)
  const derived = deriveHarnessCheckerMutationCoverage()
  assert.deepEqual(match.slice(1).map(Number), [
    derived.checkerGateCount,
    derived.pairedMetaTestCount,
    derived.declaredGapCount,
  ])
  assert.equal(derived.fullMutationCoverageClaim, true)

  const exclusions = JSON.parse(readFileSync(resolve(DEFAULT_REPO_ROOT, 'scripts/gate-meta-test-exclusions.json'), 'utf8'))
  exclusions.entries.push({
    stem: 'check-branch-protection',
    executionClass: 'environmental-observation',
    portabilityPolicy: 'excluded',
    harness: 'scripts/test-check-branch-protection.mjs',
    fallback: 'manual opt-in live readback: node scripts/check-branch-protection.mjs --check --repository ajenchen/design-system',
    executionOwner: {
      kind: 'source-reference',
      path: 'scripts/check-branch-protection.mjs',
      evidence: 'check-branch-protection',
    },
    reason: 'Mutation fixture deliberately reclassifies one deterministic policy evaluator as an external-only observation.',
  })
  const reclassified = deriveHarnessCheckerMutationCoverage({ exclusionDocument: exclusions })
  assert.equal(reclassified.checkerGateCount, derived.checkerGateCount)
  assert.equal(reclassified.pairedMetaTestCount, derived.pairedMetaTestCount - 1)
  assert.equal(reclassified.declaredGapCount, 1)
  assert.equal(reclassified.fullMutationCoverageClaim, false)
  assert.deepEqual(reclassified.gaps.map(item => item.stem), ['check-branch-protection'])

  const dilutedOutcome = structuredClone(registry)
  dilutedOutcome.metaTestCoverage.requiredOutcome = 'known-debt-is-acceptable'
  assert.throws(() => validateHarnessRegistry(dilutedOutcome), /required outcome is invalid/)
})

test('product-template classification keeps every DS-author workflow out of the consumer skill role', () => {
  const classification = JSON.parse(readFileSync(resolve(DEFAULT_REPO_ROOT, 'scripts/fork-governance-classification.json'), 'utf8'))
  const skillItems = classification.homes.skills.items
  const bucketFor = new Map()
  for (const item of skillItems) {
    for (const name of item.names ?? [item.name]) bucketFor.set(name, item.bucket)
  }
  for (const name of [
    'new-component',
    'component-quality-gate',
    'design-system-audit',
    'story-writing',
    'knowledge-prune',
    'governance-health',
    'canonical-reviewer',
    'governance-status',
    'codify-corrections',
    'codify-principle',
    'ensure-canonical',
    'codex-collab',
    'deep-audit-cross-codex',
  ]) {
    assert.equal(bucketFor.get(name), 'DROP', `${name} leaked across the product-consumer role boundary`)
  }
  assert.equal(bucketFor.get('independent-review'), 'SHIP_AS_IS')
  const productReview = readFileSync(resolve(DEFAULT_REPO_ROOT, 'packages/design-system/ds-canonical/skills/independent-review/SKILL.md'), 'utf8')
  assert.match(productReview, /Use this workflow only for product-consumer work/)
  assert.match(productReview, /Do not authorize or perform design-system canonical changes/)
  assert.match(productReview, /Do not edit anything/)
})

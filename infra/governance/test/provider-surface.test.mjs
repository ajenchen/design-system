import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readJson } from '../lib/common.mjs'
import { validateProviderRegistry } from '../lib/model-validation.mjs'
import { codexHookMatcher } from '../../../scripts/lib/codex-hook-matcher.mjs'
import { deriveProviderAdapterFacts, validateProviderCompatibilityJoin } from '../lib/provider-compatibility.mjs'
import {
  validateManagedRepositoryRoleSurfaces,
  providerTransportProfileForRole,
  validateReleaseRingRoleSurfaces,
  validateRoleSurfacePolicy,
} from '../lib/role-surface-policy.mjs'
import {
  buildProviderSkillDriver,
  buildSharedSkillTargets,
  PROVIDER_REGISTRY,
  PROVIDER_SKILL_SEMANTICS,
  validateProviderSkillSemantics,
} from '../../../scripts/gen-codex-adapter.mjs'

const GOVERNANCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = resolve(GOVERNANCE_ROOT, '../..')
const matrix = readJson(resolve(GOVERNANCE_ROOT, 'providers/compatibility-matrix.json'))
const providerCliToolchain = readJson(resolve(GOVERNANCE_ROOT, 'providers/provider-cli-toolchain.json'))
const certifications = readJson(resolve(GOVERNANCE_ROOT, 'providers/certifications.json'))
const runtimeConformance = readJson(resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json'))
const inventory = readJson(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json'))
const roleSurfacePolicy = readJson(resolve(GOVERNANCE_ROOT, 'providers/role-surface-policy.json'))
const releaseRings = readJson(resolve(GOVERNANCE_ROOT, 'release-rings.json'))

test('provider CLI toolchain schema is data-driven while keeping a closed provider/provisioning shape', () => {
  const schema = readJson(resolve(GOVERNANCE_ROOT, 'schemas/provider-cli-toolchain.schema.json'))
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  assert.equal(validate(providerCliToolchain), true, new Ajv2020().errorsText(validate.errors))

  const futureExternal = structuredClone(providerCliToolchain)
  futureExternal.providerBindings.push({ providerId: 'future-model', provisioning: 'external-runtime', toolProviderId: null })
  assert.equal(validate(futureExternal), true, new Ajv2020().errorsText(validate.errors))

  const missingToolId = structuredClone(futureExternal)
  missingToolId.providerBindings.at(-1).provisioning = 'repo-provisioned-cli'
  assert.equal(validate(missingToolId), false, 'repo-provisioned provider binding accepted a null tool id')

  const rogueField = structuredClone(providerCliToolchain)
  rogueField.tools[0].unreviewedInstaller = 'curl | sh'
  assert.equal(validate(rogueField), false, 'provider CLI schema accepted an open installer field')

  const rogueContentField = structuredClone(providerCliToolchain)
  rogueContentField.packageContent.packages[0].selfReportedReceipt = true
  assert.equal(validate(rogueContentField), false, 'provider CLI schema accepted an open package-content field')

  const invalidContentDigest = structuredClone(providerCliToolchain)
  invalidContentDigest.packageContent.packages[0].treeSha256 = 'f'.repeat(63)
  assert.equal(validate(invalidContentDigest), false, 'provider CLI schema accepted an invalid package-content digest')
})

test('provider compatibility registry satisfies its closed machine-readable schema', () => {
  const schema = readJson(resolve(GOVERNANCE_ROOT, 'schemas/compatibility-matrix.schema.json'))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const validate = ajv.compile(schema)
  assert.equal(validate(matrix), true, ajv.errorsText(validate.errors))
  const duplicatedAdapterFact = structuredClone(matrix)
  duplicatedAdapterFact.providers.codex.instructions = { entrypoint: 'AGENTS.md', adapter: 'native' }
  assert.equal(validate(duplicatedAdapterFact), false, 'compatibility matrix must reject copied adapter facts')

  const divergentCloudGate = structuredClone(matrix)
  divergentCloudGate.surfaces.cloud.hardGateContract = { pointer: '#/cloud-specific-hooks' }
  assert.equal(validate(divergentCloudGate), false, 'cloud must not replace the canonical hard-gate contract')
})

test('role-surface policy is the closed cloud/GitHub-Actions SSOT for inventory, rings, and ledger', () => {
  const schema = readJson(resolve(GOVERNANCE_ROOT, 'schemas/role-surface-policy.schema.json'))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const validate = ajv.compile(schema)
  const registry = validateProviderRegistry(matrix, runtimeConformance, {
    adapterRegistry: PROVIDER_REGISTRY,
    providerCliToolchain,
    now: new Date('2026-07-20T00:00:00.000Z'),
  })
  assert.equal(validate(roleSurfacePolicy), true, ajv.errorsText(validate.errors))
  assert.equal(validateRoleSurfacePolicy(roleSurfacePolicy, registry), roleSurfacePolicy)
  assert.equal(providerTransportProfileForRole(roleSurfacePolicy, 'authority', 'claude'), 'claude-authority-full')
  assert.equal(providerTransportProfileForRole(roleSurfacePolicy, 'template-mirror', 'claude'), null)
  assert.equal(providerTransportProfileForRole(roleSurfacePolicy, 'product-consumer', 'claude'), null)
  assert.equal(validateManagedRepositoryRoleSurfaces(inventory, roleSurfacePolicy, registry), true)
  assert.equal(validateReleaseRingRoleSurfaces(inventory, releaseRings, roleSurfacePolicy, registry), true)

  const existingNonExcludableSurfaces = {
    authority: [
      'codex/codex-cli/local',
      'codex/codex-desktop/local',
      'codex/codex-desktop/remote-control',
      'codex/codex-cloud/cloud',
      'claude-code/claude-code-cli/local',
      'claude-code/claude-code-cli/remote-control',
      'claude-code/claude-code-cloud/cloud',
      'ci/github-actions/github-actions',
    ],
    'template-mirror': [
      'codex/codex-desktop/remote-control',
      'codex/codex-cloud/cloud',
      'claude-code/claude-code-cli/remote-control',
      'claude-code/claude-code-cloud/cloud',
      'ci/github-actions/github-actions',
    ],
    'product-consumer': [
      'codex/codex-cli/local',
      'codex/codex-desktop/local',
      'codex/codex-desktop/remote-control',
      'codex/codex-cloud/cloud',
      'claude-code/claude-code-cli/local',
      'claude-code/claude-code-cli/remote-control',
      'claude-code/claude-code-cloud/cloud',
      'ci/github-actions/github-actions',
    ],
  }
  for (const [role, requirements] of Object.entries(existingNonExcludableSurfaces)) {
    for (const requirement of requirements) {
      assert.ok(roleSurfacePolicy.roles[role].requiredSurfaces.includes(requirement), `${role} baseline omits ${requirement}`)
      const omitted = structuredClone(roleSurfacePolicy)
      omitted.roles[role].requiredSurfaces = omitted.roles[role].requiredSurfaces
        .filter(candidate => candidate !== requirement)
      assert.throws(
        () => validateRoleSurfacePolicy(omitted, registry),
        new RegExp(`may not exclude or omit mandatory existing surface:${requirement.replaceAll('/', '\\/')}`),
        `${role} moved mandatory existing surface ${requirement} out of required coverage`,
      )

      const explicitlyExcluded = structuredClone(omitted)
      explicitlyExcluded.roles[role].coverageExclusions.surfaces.push({
        requirement,
        reasonCode: 'surface-not-applicable-to-role',
        detail: 'Adversarial fixture attempts to reclassify an existing mandatory surface as explicitly excluded.',
      })
      assert.throws(
        () => validateRoleSurfacePolicy(explicitlyExcluded, registry),
        new RegExp(`may not exclude or omit mandatory existing surface:${requirement.replaceAll('/', '\\/')}`),
        `${role} converted mandatory existing surface ${requirement} into a coordinated exclusion`,
      )
    }
  }

  const carrierPoisons = [
    ['authority broad changed-path glob', value => {
      value.roles.authority.certificationCarrierPolicy.allowedChangedPaths.push('**')
    }],
    ['authority omitted ledger path', value => {
      value.roles.authority.certificationCarrierPolicy.allowedChangedPaths.pop()
    }],
    ['authority exact-subject substitution', value => {
      value.roles.authority.certificationCarrierPolicy = { relationship: 'exact-subject', allowedChangedPaths: [] }
    }],
    ['template descendant substitution', value => {
      value.roles['template-mirror'].certificationCarrierPolicy = {
        relationship: 'ledger-carrier-descendant',
        allowedChangedPaths: ['**'],
      }
    }],
    ['product descendant substitution', value => {
      value.roles['product-consumer'].certificationCarrierPolicy = {
        relationship: 'ledger-carrier-descendant',
        allowedChangedPaths: ['**'],
      }
    }],
  ]
  for (const [label, mutate] of carrierPoisons) {
    const poisoned = structuredClone(roleSurfacePolicy)
    mutate(poisoned)
    assert.throws(
      () => validateRoleSurfacePolicy(poisoned, registry),
      /certification carrier policy differs from its non-weakenable role minimum/,
      `${label} weakened repository subject proof`,
    )
  }

  for (const [role, replacement] of [
    ['authority', null],
    ['template-mirror', 'claude-authority-full'],
    ['product-consumer', 'claude-authority-full'],
  ]) {
    const poisoned = structuredClone(roleSurfacePolicy)
    poisoned.roles[role].providerTransportProfiles.claude = replacement
    assert.throws(
      () => validateRoleSurfacePolicy(poisoned, registry),
      /provider transport selection differs from its non-weakenable role minimum/,
      `${role} accepted the wrong Claude marketplace transport profile`,
    )
  }

  const removedRequirement = roleSurfacePolicy.roles.authority.requiredSurfaces[0]

  const overlappingExclusion = structuredClone(roleSurfacePolicy)
  overlappingExclusion.roles.authority.coverageExclusions.providers.push({
    provider: removedRequirement.split('/')[0],
    reasonCode: 'provider-not-applicable-to-role',
    detail: 'Adversarial fixture must not exclude a provider while retaining required tuples for the same repository role.',
  })
  assert.throws(
    () => validateRoleSurfacePolicy(overlappingExclusion, registry),
    /must classify registered tuple .* exactly once; found 2/,
    'a provider-level exclusion overlapped required tuples',
  )

  const crossedTuple = structuredClone(roleSurfacePolicy)
  crossedTuple.roles.authority.requiredSurfaces.push('codex/codex-cli/cloud')
  assert.throws(
    () => validateRoleSurfacePolicy(crossedTuple, registry),
    /requires an unregistered certification tuple:codex\/codex-cli\/cloud/,
    'known provider/runtime/surface components formed an unregistered policy tuple',
  )

  const futureRegistry = {
    ...registry,
    providerIds: new Set([...registry.providerIds, 'future-model']),
    runtimeKindIds: new Map([...registry.runtimeKindIds, ['future-model', new Set(['future-hosted'])]]),
    runtimeProfilesByCertificationTuple: new Map([
      ...registry.runtimeProfilesByCertificationTuple,
      ['future-model/future-hosted/cloud', 'future-hosted-cloud'],
    ]),
  }
  assert.throws(
    () => validateRoleSurfacePolicy(roleSurfacePolicy, futureRegistry),
    /must classify registered tuple future-model\/future-hosted\/cloud exactly once; found 0/,
    'a future registered provider bypassed role coverage closure',
  )
  const explicitlyExcludedFuture = structuredClone(roleSurfacePolicy)
  for (const profile of Object.values(explicitlyExcludedFuture.roles)) {
    profile.coverageExclusions.providers.push({
      provider: 'future-model',
      reasonCode: 'provider-not-applicable-to-role',
      detail: 'Synthetic future provider is explicitly inapplicable to this role until its role contract is defined.',
    })
  }
  assert.equal(validateRoleSurfacePolicy(explicitlyExcludedFuture, futureRegistry), explicitlyExcludedFuture)

  const portableCore = [
    'codex/codex-cloud/cloud',
    'claude-code/claude-code-cloud/cloud',
    'ci/github-actions/github-actions',
  ]
  for (const [role, profile] of Object.entries(roleSurfacePolicy.roles)) {
    for (const requirement of portableCore) {
      assert.ok(profile.requiredSurfaces.includes(requirement), `${role} omits required portable surface ${requirement}`)
    }
  }

  for (const repository of inventory.repositories) {
    const ring = releaseRings.rings.find(candidate => candidate.id === repository.releaseRing)
    const predicate = ring.promotionPredicates.find(candidate => candidate.type === 'provider-surfaces-certified')
    assert.deepEqual(predicate.surfaces, roleSurfacePolicy.roles[repository.role].requiredSurfaces, `${repository.id} ring bypasses its role-surface policy`)
    for (const requirement of roleSurfacePolicy.roles[repository.role].requiredSurfaces) {
      const missing = structuredClone(inventory)
      missing.repositories.find(candidate => candidate.id === repository.id).providerSurfacesRequired = repository.providerSurfacesRequired.filter(candidate => candidate !== requirement)
      assert.throws(
        () => validateManagedRepositoryRoleSurfaces(missing, roleSurfacePolicy),
        /provider surfaces differ from the canonical role-surface policy/,
        `${repository.id} accepted missing required tuple ${requirement}`,
      )
      const staleRings = structuredClone(releaseRings)
      staleRings.rings.find(candidate => candidate.id === repository.releaseRing)
        .promotionPredicates.find(candidate => candidate.type === 'provider-surfaces-certified').surfaces = predicate.surfaces.filter(candidate => candidate !== requirement)
      assert.throws(
        () => validateReleaseRingRoleSurfaces(inventory, staleRings, roleSurfacePolicy),
        /provider surfaces differ from the canonical role-surface policy/,
        `${repository.releaseRing} accepted missing required tuple ${requirement}`,
      )
    }
  }

  for (const repositoryRole of ['authority', 'template-mirror', 'product-consumer']) {
    for (const [provider, runtimeKind] of [['codex', 'codex-cloud'], ['claude-code', 'claude-code-cloud']]) {
      const record = certifications.certifications.find(candidate => candidate.provider === provider
        && candidate.runtimeKind === runtimeKind
        && candidate.surface === 'cloud'
        && candidate.repositoryRole === repositoryRole)
      assert.equal(record?.status, 'not-certified', `${provider}/${runtimeKind}/cloud/${repositoryRole} must remain explicitly blocked before external evidence`)
    }
  }

  const memoryIndex = readFileSync(resolve(REPO_ROOT, 'governance/memory/MEMORY.md'), 'utf8')
  const cloudReference = readFileSync(resolve(REPO_ROOT, 'governance/memory/reference_cloud_governance_loading.md'), 'utf8')
  assert.match(memoryIndex, /歷史單一 Claude cloud target\/snapshot/)
  assert.match(memoryIndex, /不構成目前或所有 cloud certification/)
  assert.doesNotMatch(memoryIndex, /雲端端到端\s*100%\s*蓋章/)
  assert.match(cloudReference, /不得再描述為[^\n]*cloud 100% 蓋章/)
})

test('local, remote, cloud and CI resolve one canonical role-bound hard-gate family while native hooks remain feedback', () => {
  for (const [surfaceId, surface] of Object.entries(matrix.surfaces)) {
    assert.deepEqual(surface.hardGateContract, { pointer: '#/commonContract/roleHardGateContracts' }, `${surfaceId} diverged from canonical hard gates`)
    assert.equal(surface.certificationPolicy, 'target-bound-evidence-required', `${surfaceId} allows evidence-free certification`)
  }
  assert.equal(matrix.surfaces.local.repoConfigTravels, true)
  assert.equal(matrix.surfaces.local.userConfigTravels, true)
  assert.equal(matrix.surfaces.cloud.repoConfigTravels, true)
  assert.equal(matrix.surfaces.cloud.userConfigTravels, false)
  assert.equal(matrix.surfaces.cloud.nativeHookPolicy, 'environment-dependent-feedback-only')

  const cloudHomeLeak = structuredClone(matrix)
  cloudHomeLeak.surfaces.cloud.userConfigTravels = true
  assert.throws(() => validateProviderCompatibilityJoin(cloudHomeLeak, PROVIDER_REGISTRY), /without inheriting user-home/)

  const cloudFakeGreen = structuredClone(matrix)
  cloudFakeGreen.surfaces.cloud.certificationPolicy = 'self-asserted'
  assert.throws(() => validateProviderCompatibilityJoin(cloudFakeGreen, PROVIDER_REGISTRY), /target-bound certification evidence/)

  const registryBytes = readFileSync(resolve(GOVERNANCE_ROOT, 'providers/harness-registry.json'))
  assert.equal(matrix.commonContract.hardGateContracts.authority.registrySha256, createHash('sha256').update(registryBytes).digest('hex'))

  const forgedDigest = structuredClone(matrix)
  forgedDigest.commonContract.hardGateContracts.authority.registrySha256 = '0'.repeat(64)
  assert.throws(() => validateProviderCompatibilityJoin(forgedDigest, PROVIDER_REGISTRY), /registry digest mismatch/)

  for (const surfaceId of ['local', 'remote-control', 'cloud', 'github-actions']) {
    const alternatePointer = structuredClone(matrix)
    alternatePointer.surfaces[surfaceId].hardGateContract = { pointer: '#/commonContract/optionalHooks' }
    assert.throws(
      () => validateProviderCompatibilityJoin(alternatePointer, PROVIDER_REGISTRY),
      /canonical role-bound hard-gate family/,
      `${surfaceId} accepted a diluted hard-gate pointer`,
    )
  }

  const dilutedRegistry = JSON.parse(registryBytes.toString('utf8'))
  dilutedRegistry.entries.find(entry => entry.domain === 'cloud').commands = [['node', '--eval', 'process.exit(0)']]
  const dilutedBytes = Buffer.from(JSON.stringify(dilutedRegistry))
  const rotatedToDilution = structuredClone(matrix)
  rotatedToDilution.commonContract.hardGateContracts.authority.registrySha256 = createHash('sha256').update(dilutedBytes).digest('hex')
  assert.throws(
    () => validateProviderCompatibilityJoin(rotatedToDilution, PROVIDER_REGISTRY, { harnessRegistryBytes: dilutedBytes }),
    /Node evaluation|entrypoint|argument shape/,
    'a digest rotation must not make an open or executable-string Harness registry valid',
  )

  assert.deepEqual(matrix.commonContract.roleHardGateContracts, {
    authority: '#/commonContract/hardGateContracts/authority',
    'template-mirror': '#/commonContract/hardGateContracts/consumer',
    'product-consumer': '#/commonContract/hardGateContracts/consumer',
  })
  const consumerContract = matrix.commonContract.hardGateContracts.consumer
  const templatePackage = readJson(resolve(REPO_ROOT, 'template/ds-product-template/package.json'))
  assert.equal(templatePackage.scripts['governance:check'], consumerContract.runnerCommand.join(' '))
  for (const repository of inventory.repositories) {
    const pointer = matrix.commonContract.roleHardGateContracts[repository.role]
    assert.ok(pointer, `${repository.id}/${repository.role} has no hard-gate binding`)
    const contract = pointer.endsWith('/authority') ? matrix.commonContract.hardGateContracts.authority : consumerContract
    assert.ok(Array.isArray(contract.runnerCommand) && contract.runnerCommand.length >= 2, `${repository.id}/${repository.role} has no executable hard gate`)
  }
})

test('cloud post-create paths preserve authority and product-consumer role boundaries', () => {
  const authorityConfig = readJson(resolve(REPO_ROOT, '.devcontainer/devcontainer.json'))
  assert.deepEqual(
    authorityConfig.postCreateCommand,
    ['node', '.devcontainer/post-create.mjs'],
    'authority cloud setup must enter one committed structured wrapper',
  )

  const authorityWrapper = readFileSync(resolve(REPO_ROOT, '.devcontainer/post-create.mjs'), 'utf8')
  assert.match(authorityWrapper, /from '\.\.\/scripts\/lib\/workspace-post-create\.mjs'/)
  assert.match(authorityWrapper, /runWorkspacePostCreate\(\{ root \}\)/)
  assert.doesNotMatch(authorityWrapper, /execSync|shell\s*:|(?:^|\s)(?:sh|bash)\s+-c|\|\||&&/m)

  const sharedWrapper = readFileSync(resolve(REPO_ROOT, 'scripts/lib/workspace-post-create.mjs'), 'utf8')
  assert.match(sharedWrapper, /\['complete provider-neutral workspace setup', process\.execPath, \[workspaceSetup\]\]/)
  assert.match(sharedWrapper, /shell: false/)
  const setupAll = readFileSync(resolve(REPO_ROOT, 'scripts/setup-workspace.mjs'), 'utf8')
  assert.match(setupAll, /scripts\/setup-authority-governance\.mjs/)
  assert.match(setupAll, /scripts\/setup-provider-cli-toolchain\.mjs/)
  assert.match(setupAll, /setup:all/)

  const productConfig = readJson(resolve(REPO_ROOT, 'template/ds-product-template/.devcontainer/devcontainer.json'))
  const productManifest = readJson(resolve(REPO_ROOT, 'template/ds-product-template/package.json'))
  assert.deepEqual(productConfig.postCreateCommand, ['node', '.devcontainer/post-create.mjs'])
  const productWrapper = readFileSync(resolve(REPO_ROOT, 'template/ds-product-template/.devcontainer/post-create.mjs'), 'utf8')
  assert.match(productWrapper, /from '\.\.\/scripts\/lib\/workspace-post-create\.mjs'/)
  assert.match(productWrapper, /runWorkspacePostCreate\(\{ root \}\)/)
  assert.equal(Object.hasOwn(productManifest.scripts, 'test:governance-harnesses'), false)
  assert.equal(productManifest.scripts['setup:all'], 'node scripts/setup-workspace.mjs')
  assert.match(
    productManifest.scripts['governance:check'],
    /ds-canonical\/fork\/consumer\/governance-check\.mjs --repo \. --hooks-off$/,
    'product cloud must execute the exact installed role-bound consumer hard gate',
  )
})

test('provider surface certification platform matrix is closed and native Windows remains unsupported', () => {
  const schema = readJson(resolve(GOVERNANCE_ROOT, 'schemas/provider-surface-certification.schema.json'))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  assert.equal(validate(certifications), true, ajv.errorsText(validate.errors))

  const missingAxis = structuredClone(certifications)
  delete missingAxis.certifications[0].platformMatrix[0].pathClass
  assert.equal(validate(missingAxis), false, 'surface certification accepted a missing pathClass')

  const falseNativeWindows = structuredClone(certifications)
  falseNativeWindows.certifications[0].platformMatrix
    .find((target) => target.id === 'windows-win32-x64-native').status = 'not-certified'
  assert.equal(validate(falseNativeWindows), false, 'surface certification represented native Windows as a supportable target')
})

test('every surface-aware runtime profile has explicit aliases and ledgers without claiming evidence', () => {
  const desktopLocalProfile = runtimeConformance.providers.find((candidate) => candidate.id === 'codex-desktop-local')
  assert.equal(desktopLocalProfile?.distributionVersionAuthority.version, '26.721.30844')
  assert.deepEqual(
    desktopLocalProfile?.certificationTargets.map((target) => ({
      id: target.id,
      distributionVersion: target.distributionVersion,
      pathClass: target.pathClass,
    })),
    [
      {
        id: 'macos-darwin-arm64-native-no-space',
        distributionVersion: '26.721.30844',
        pathClass: 'no-space',
      },
      {
        id: 'macos-darwin-arm64-native-space',
        distributionVersion: '26.721.30844',
        pathClass: 'contains-space',
      },
    ],
    'Codex Desktop local must declare the exact observed version as distinct no-space and contains-space targets',
  )
  for (const profileProvider of runtimeConformance.providers) {
    const compatibility = Object.entries(matrix.providers).find(([, registration]) => (
      registration.adapterProviderId === profileProvider.adapterProviderId
      && registration.runtimeKinds?.[profileProvider.runtimeKind]?.runtimeProfilesBySurface?.[profileProvider.certificationSurface] === profileProvider.id
    ))
    assert.ok(compatibility, `${profileProvider.id} has no unique compatibility alias`)
    const [fleetProvider] = compatibility
    const expected = profileProvider.certificationTargets.map((target) => target.id).sort()
    const records = certifications.certifications.filter((record) => (
      record.provider === fleetProvider
      && record.runtimeKind === profileProvider.runtimeKind
      && record.surface === profileProvider.certificationSurface
    ))
    assert.ok(records.length > 0, `${profileProvider.id} must have at least one role-bound certification record`)
    for (const record of records) {
      const declaredTargets = record.platformMatrix.filter((target) => target.status !== 'unsupported')
      assert.deepEqual(declaredTargets.map((target) => target.id).sort(), expected, `${record.id} omits a runtime certification target`)
      assert.ok(declaredTargets.every((target) => target.status === 'not-certified'), `${record.id} claims unproven runtime evidence`)
      for (const profileTarget of profileProvider.certificationTargets) {
        const certificationTarget = declaredTargets.find((target) => target.id === profileTarget.id)
        for (const axis of ['operatingSystem', 'platform', 'arch', 'executionEnvironment', 'distributionVersion', 'pathClass']) {
          assert.equal(certificationTarget[axis], profileTarget[axis], `${record.id}/${profileTarget.id} drifted on ${axis}`)
        }
      }
      const nativeWindows = record.platformMatrix.find((target) => target.id === 'windows-win32-x64-native')
      if (nativeWindows) assert.equal(nativeWindows.status, 'unsupported', `${record.id} must keep native Windows explicitly unsupported`)
    }
  }
  for (const record of certifications.certifications) {
    const profileId = matrix.providers[record.provider].runtimeKinds[record.runtimeKind].runtimeProfilesBySurface[record.surface]
    assert.equal(typeof profileId, 'string', `${record.id} resolved a null/impossible runtime profile`)
    const profile = runtimeConformance.providers.find(candidate => candidate.id === profileId)
    assert.equal(profile?.runtimeKind, record.runtimeKind, `${record.id} runtimeKind/profile drift`)
    assert.equal(profile?.certificationSurface, record.surface, `${record.id} surface/profile drift`)
    const declaredVersions = [...new Set(profile?.certificationTargets.map(target => target.distributionVersion))]
    assert.equal(declaredVersions.length, 1, `${record.id} profile targets disagree on providerVersion`)
    assert.equal(
      record.providerVersion,
      declaredVersions[0],
      `${record.id} providerVersion/profile authority drift`,
    )
  }
  assert.ok(certifications.certifications
    .filter((record) => ['cloud', 'remote-control'].includes(record.surface))
    .every((record) => record.status === 'not-certified' && record.platformMatrix.every((target) => target.status === 'not-certified')),
  'cloud and remote-control surfaces must remain not-certified without external evidence')
})

test('compatibility joins adapter facts and canonical provider CLI versions without duplicating authority', () => {
  assert.equal(Object.hasOwn(matrix, 'skillParity'), false)
  for (const registration of Object.values(matrix.providers)) {
    for (const duplicatedFact of ['instructions', 'skills', 'hooks', 'mcp', 'plugins']) {
      assert.equal(Object.hasOwn(registration, duplicatedFact), false, `${duplicatedFact} must be derived from the adapter registry`)
    }
  }
  assert.equal(PROVIDER_REGISTRY.providers.find((provider) => provider.id === 'generic').providerKind, 'headless-protocol')
  for (const provider of PROVIDER_REGISTRY.providers.filter((candidate) => candidate.id !== 'generic')) {
    assert.equal(provider.providerKind, 'concrete-runtime')
  }
  const join = validateProviderCompatibilityJoin(matrix, PROVIDER_REGISTRY)
  const codex = join.joinedProviders.get('codex').adapter
  assert.deepEqual(codex, deriveProviderAdapterFacts('codex', PROVIDER_REGISTRY))
  assert.equal(codex.instructions.entrypoint, 'AGENTS.md')
  assert.equal(codex.skills.materializerId, 'agent-skills-directory-v1')
  assert.equal(codex.hooks.materializerId, 'command-hooks-json-v1')
  assert.deepEqual(join.providerCliVersionBindings.get('codex'), {
    adapterProviderId: 'codex',
    lockedVersion: providerCliToolchain.tools.find((tool) => tool.providerId === 'codex').version,
    minimumVersion: matrix.providers.codex.minimumVersion,
    providerId: 'codex',
  })
  assert.deepEqual(join.providerCliVersionBindings.get('claude-code'), {
    adapterProviderId: 'claude',
    lockedVersion: providerCliToolchain.tools.find((tool) => tool.providerId === 'claude-code').version,
    minimumVersion: matrix.providers['claude-code'].minimumVersion,
    providerId: 'claude-code',
  })

  const stale = structuredClone(matrix)
  stale.adapterRegistry.schemaVersion -= 1
  assert.throws(() => validateProviderCompatibilityJoin(stale, PROVIDER_REGISTRY), /schemaVersion is stale/)

  const raisedCompatibilityFloor = structuredClone(matrix)
  raisedCompatibilityFloor.providers.codex.minimumVersion = '0.144.7'
  assert.throws(
    () => validateProviderCompatibilityJoin(raisedCompatibilityFloor, PROVIDER_REGISTRY),
    /codex locked version 0\.144\.6 is below compatibility minimum 0\.144\.7/,
    'a compatibility floor newer than the canonical installed CLI was accepted',
  )

  const staleCanonicalToolchain = structuredClone(providerCliToolchain)
  staleCanonicalToolchain.tools.find((tool) => tool.providerId === 'codex').version = '0.144.5'
  assert.throws(
    () => validateProviderCompatibilityJoin(matrix, PROVIDER_REGISTRY, { providerCliToolchain: staleCanonicalToolchain }),
    /codex locked version 0\.144\.5 is below compatibility minimum 0\.144\.6/,
    'a canonical CLI lock older than the compatibility floor was accepted',
  )

  const floatingCanonicalToolchain = structuredClone(providerCliToolchain)
  floatingCanonicalToolchain.tools.find((tool) => tool.providerId === 'codex').version = 'latest'
  assert.throws(
    () => validateProviderCompatibilityJoin(matrix, PROVIDER_REGISTRY, { providerCliToolchain: floatingCanonicalToolchain }),
    /locked version must be exact stable semver:latest/,
    'a floating canonical provider CLI version was accepted',
  )

  const duplicatedCanonicalTool = structuredClone(providerCliToolchain)
  duplicatedCanonicalTool.tools.push(structuredClone(duplicatedCanonicalTool.tools[0]))
  assert.throws(
    () => validateProviderCompatibilityJoin(matrix, PROVIDER_REGISTRY, { providerCliToolchain: duplicatedCanonicalTool }),
    /providerId is duplicated:claude-code/,
    'duplicate canonical CLI ownership was accepted',
  )

  const missingPackageContent = structuredClone(providerCliToolchain)
  delete missingPackageContent.packageContent
  assert.throws(
    () => validateProviderCompatibilityJoin(matrix, PROVIDER_REGISTRY, { providerCliToolchain: missingPackageContent }),
    /invalid or open shape/,
    'provider compatibility accepted a provider CLI authority without package content',
  )

  const substitutedPackageContent = structuredClone(providerCliToolchain)
  substitutedPackageContent.packageContent.packages[0].lockPath = 'node_modules/@attacker/poison'
  assert.throws(
    () => validateProviderCompatibilityJoin(matrix, PROVIDER_REGISTRY, { providerCliToolchain: substitutedPackageContent }),
    /package-content/,
    'provider compatibility accepted substituted package-content authority',
  )

  const duplicatedPackageContent = structuredClone(providerCliToolchain)
  duplicatedPackageContent.packageContent.packages.splice(1, 0, structuredClone(duplicatedPackageContent.packageContent.packages[0]))
  assert.throws(
    () => validateProviderCompatibilityJoin(matrix, PROVIDER_REGISTRY, { providerCliToolchain: duplicatedPackageContent }),
    /lockPath is duplicated/,
    'provider compatibility accepted duplicate package-content authority',
  )

  const orphanCanonicalTool = structuredClone(providerCliToolchain)
  const orphan = structuredClone(orphanCanonicalTool.tools.find((tool) => tool.providerId === 'codex'))
  orphan.providerId = 'future-model'
  orphanCanonicalTool.tools.push(orphan)
  assert.throws(
    () => validateProviderCompatibilityJoin(matrix, PROVIDER_REGISTRY, { providerCliToolchain: orphanCanonicalTool }),
    /future-model has no repo-provisioned provider binding/,
    'a canonical CLI without a compatibility registration was accepted',
  )

  const missingProviderBinding = structuredClone(providerCliToolchain)
  missingProviderBinding.providerBindings = missingProviderBinding.providerBindings.filter(binding => binding.providerId !== 'ci')
  assert.throws(
    () => validateProviderCompatibilityJoin(matrix, PROVIDER_REGISTRY, { providerCliToolchain: missingProviderBinding }),
    /must exactly enumerate every compatibility provider/,
    'a registered external provider disappeared from the closed CLI provisioning registry',
  )

  const futureExternalMatrix = structuredClone(matrix)
  futureExternalMatrix.providers['future-model'] = {
    adapterProviderId: null,
    runtimeKinds: { 'future-hosted': { runtimeProfilesBySurface: { cloud: 'future-hosted-cloud' }, runtimeEvidenceRequired: true } },
    minimumVersion: 'future-hosted',
  }
  const futureExternalToolchain = structuredClone(providerCliToolchain)
  futureExternalToolchain.providerBindings.push({ providerId: 'future-model', provisioning: 'external-runtime', toolProviderId: null })
  assert.doesNotThrow(
    () => validateProviderCompatibilityJoin(futureExternalMatrix, PROVIDER_REGISTRY, { providerCliToolchain: futureExternalToolchain }),
    'a registered provider without a repo-provisioned CLI must remain admissible',
  )

  const lowerCompatibilityFloor = structuredClone(matrix)
  lowerCompatibilityFloor.providers.codex.minimumVersion = '0.100.0'
  assert.doesNotThrow(
    () => validateProviderCompatibilityJoin(lowerCompatibilityFloor, PROVIDER_REGISTRY),
    'a newer canonical CLI must remain compatible with an older valid floor',
  )
})

function validateProviderFleetIntegrity({ adapterRegistry, compatibility, managedInventory, certificationLedger, providerCliToolchain: toolchain = providerCliToolchain }) {
  const join = validateProviderCompatibilityJoin(compatibility, adapterRegistry, { providerCliToolchain: toolchain })
  const mappings = [...join.joinedProviders.values()]
    .filter((entry) => entry.adapter !== null)
    .map((entry) => ({ fleetProviderId: entry.fleetProviderId, adapterProviderId: entry.adapter.providerId }))

  for (const repo of managedInventory.repositories) {
    for (const { fleetProviderId } of mappings) {
      assert.ok(
        repo.providerSurfacesRequired.some((requirement) => requirement.startsWith(`${fleetProviderId}/`)),
        `${repo.id}/${repo.role} omits generated provider ${fleetProviderId} from its required fleet surfaces`,
      )
    }
  }

  const required = managedInventory.repositories.flatMap((repo) => repo.providerSurfacesRequired.map((requirement) => {
    const [provider, runtimeKind, surface] = requirement.split('/')
    return `${provider}/${runtimeKind}/${surface}/${repo.role}`
  })).sort()
  const recorded = certificationLedger.certifications.map((item) =>
    `${item.provider}/${item.runtimeKind}/${item.surface}/${item.repositoryRole}`).sort()
  assert.equal(new Set(recorded).size, recorded.length, 'duplicate provider-surface certification key')
  assert.deepEqual(recorded, required, 'every required fleet surface must have exactly one certification ledger entry')
  return true
}

function skillNames(relativeRoot) {
  const root = resolve(REPO_ROOT, relativeRoot)
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(resolve(root, entry.name, 'SKILL.md')))
    .map(entry => entry.name)
    .sort()
}

function treeInventory(root) {
  const files = new Map()
  const visit = (current) => {
    for (const name of readdirSync(current).sort()) {
      const path = resolve(current, name)
      const info = lstatSync(path)
      assert.equal(info.isSymbolicLink(), false, `skill projection contains a symbolic link:${path}`)
      if (info.isDirectory()) visit(path)
      else if (info.isFile()) files.set(path.slice(root.length + 1), { content: readFileSync(path), mode: statSync(path).mode & 0o777 })
      else assert.fail(`skill projection contains an unsupported entry:${path}`)
    }
  }
  visit(root)
  return files
}

function providerProjectionDiff(fixtureRoot, providerId) {
  const provider = PROVIDER_REGISTRY.providers.find((candidate) => candidate.id === providerId)
  const actualRoot = resolve(fixtureRoot, provider.adapter.skillView.directory)
  const expectedRoot = resolve(fixtureRoot, '.expected', providerId)
  const targets = buildSharedSkillTargets({
    sourceRoot: fixtureRoot,
    outputRoot: fixtureRoot,
    destinationDir: expectedRoot,
    targetProvider: providerId,
  })
  const expected = new Map(targets.map((target) => [target.path.slice(expectedRoot.length + 1), { content: target.content, mode: target.mode }]))
  const actual = treeInventory(actualRoot)
  const paths = [...new Set([...expected.keys(), ...actual.keys()])].sort()
  return paths.flatMap((path) => {
    if (!expected.has(path)) return [`extra:${path}`]
    if (!actual.has(path)) return [`missing:${path}`]
    if (!actual.get(path).content.equals(expected.get(path).content)) return [`content:${path}`]
    if (actual.get(path).mode !== expected.get(path).mode) return [`mode:${path}`]
    return []
  })
}

function projectionFixture({ canonicalOutputs = false } = {}) {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'provider-projection-'))
  for (const relativePath of [
    'packages/design-system/ds-canonical/skills',
    '.claude/skills',
    '.agents/skills',
  ]) {
    const destination = resolve(fixtureRoot, relativePath)
    mkdirSync(resolve(destination, '..'), { recursive: true })
    cpSync(resolve(REPO_ROOT, relativePath), destination, { recursive: true })
  }
  if (canonicalOutputs) {
    for (const providerId of ['claude', 'codex']) {
      const provider = PROVIDER_REGISTRY.providers.find((candidate) => candidate.id === providerId)
      const destination = resolve(fixtureRoot, provider.adapter.skillView.directory)
      rmSync(destination, { recursive: true, force: true })
      const targets = buildSharedSkillTargets({ sourceRoot: fixtureRoot, outputRoot: fixtureRoot, targetProvider: providerId })
      for (const target of targets) {
        mkdirSync(resolve(target.path, '..'), { recursive: true })
        writeFileSync(target.path, target.content)
        chmodSync(target.path, target.mode)
      }
    }
  }
  return fixtureRoot
}

test('each provider skill view is checked directly against the canonical projector', () => {
  const fixtureRoot = projectionFixture()
  try {
    assert.deepEqual(providerProjectionDiff(fixtureRoot, 'claude'), [])
    assert.deepEqual(providerProjectionDiff(fixtureRoot, 'codex'), [])
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('canonical, Claude, Codex, and dual tampering cannot make provider parity falsely green', () => {
  const cases = [
    { name: 'canonical', paths: ['packages/design-system/ds-canonical/skills/visual-audit/SKILL.md'], failed: ['claude', 'codex'] },
    { name: 'claude', paths: ['.claude/skills/visual-audit/SKILL.md'], failed: ['claude'] },
    { name: 'codex', paths: ['.agents/skills/visual-audit/SKILL.md'], failed: ['codex'] },
    { name: 'both', paths: ['.claude/skills/visual-audit/SKILL.md', '.agents/skills/visual-audit/SKILL.md'], failed: ['claude', 'codex'] },
  ]
  for (const fixture of cases) {
    const fixtureRoot = projectionFixture({ canonicalOutputs: true })
    try {
      for (const relativePath of fixture.paths) {
        const path = resolve(fixtureRoot, relativePath)
        writeFileSync(path, `${readFileSync(path, 'utf8')}\n<!-- ${fixture.name}-tamper -->\n`)
      }
      for (const providerId of ['claude', 'codex']) {
        const drift = providerProjectionDiff(fixtureRoot, providerId)
        assert.equal(drift.length > 0, fixture.failed.includes(providerId), `${fixture.name}/${providerId}:${drift.join(',')}`)
      }
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  }
})

test('Codex matcher projection retains native Bash/Edit/Write names and additive legacy aliases', () => {
  const writeMatcher = codexHookMatcher('Edit|Write|MultiEdit')
  const bashMatcher = codexHookMatcher('Bash')
  for (const token of ['Edit', 'Write', 'MultiEdit', 'apply_patch', 'edit_file', 'write_file']) {
    assert.ok(writeMatcher.split('|').includes(token), `missing Codex write matcher:${token}`)
  }
  assert.equal(bashMatcher, 'Bash|exec_command|shell_command')
})

test('provider skill registry rejects same-provider peers and unknown provider inheritance', () => {
  const registryPath = resolve(REPO_ROOT, 'scripts/provider-skill-semantics.json')
  const schemaPath = resolve(REPO_ROOT, 'scripts/schemas/provider-skill-semantics.schema.json')
  const registry = readJson(registryPath)
  const schema = readJson(schemaPath)
  assert.equal(registry.$schema, './schemas/provider-skill-semantics.schema.json')
  assert.equal(schema.$id, 'https://qijenchen.dev/schemas/provider-skill-semantics-v3.json')
  assert.deepEqual(registry, PROVIDER_SKILL_SEMANTICS)

  for (const provider of PROVIDER_REGISTRY.providers.filter((item) => item.adapter.generate)) {
    for (const skill of registry.skills.filter((item) => item.projection === 'provider-thin-driver')) {
      const binding = provider.adapter.skillBindings[skill.name]
      assert.ok(binding, `${provider.id}:${skill.name} thin-driver binding is missing`)
      assert.equal(binding.self, provider.id)
      assert.equal(Object.hasOwn(binding, 'peer'), false)
      assert.equal(binding.selectionPolicy, 'highest-certified-independent-review-v1')
      assert.equal(binding.reviewClass, 'tier-0-governance')
      assert.equal(typeof binding.transport, 'string')
    }
  }

  const spoofed = structuredClone(PROVIDER_REGISTRY)
  spoofed.providers.find((item) => item.id === 'codex').adapter.skillBindings['codex-collab'].peer = 'codex'
  assert.throws(
    () => buildProviderSkillDriver({ skillName: 'codex-collab', targetProvider: 'codex', registry: spoofed }),
    /fixed peer|capability-based selection|must NOT have additional properties/,
  )
  const invalidSemantics = structuredClone(registry)
  invalidSemantics.skills[0].unexpected = true
  assert.throws(() => validateProviderSkillSemantics(invalidSemantics), /committed JSON Schema/)
  assert.throws(
    () => buildProviderSkillDriver({ skillName: 'codex-collab', targetProvider: 'future-provider' }),
    /ADAPTER-BLOCKED/,
  )
})

test('high-risk provider skills are semantic thin drivers and never invoke the current provider as their independent peer', () => {
  const expected = ['canonical-reviewer', 'codex-collab', 'deep-audit-cross-codex', 'independent-review']
  assert.deepEqual(PROVIDER_SKILL_SEMANTICS.skills.filter((skill) => skill.projection === 'provider-thin-driver').map((skill) => skill.name).sort(), expected)
  assert.deepEqual(
    PROVIDER_SKILL_SEMANTICS.skills.map((skill) => skill.name).sort(),
    skillNames('.claude/skills'),
    'provider skill semantics must exactly cover the canonical Claude skill inventory',
  )

  for (const skillName of expected) {
    const generated = readFileSync(resolve(REPO_ROOT, '.agents/skills', skillName, 'SKILL.md'), 'utf8')
    assert.match(generated, /currentProvider: codex/)
    assert.match(generated, /reviewSelectionPolicy: highest-certified-independent-review-v1/)
    assert.match(generated, /reviewClass: tier-0-governance/)
    assert.match(generated, /independentPeerProvider: selected-and-frozen-at-review-prepare-time/)
    assert.match(generated, /sameProviderPeer: invalid/)
    assert.match(
      generated,
      ['deep-audit-cross-codex', 'independent-review'].includes(skillName)
        ? /transport: content-addressed-model-broker-exchange-v1/
        : /transport: external-or-orchestrator/,
    )
    assert.match(generated, /missingEvidenceOutcome: REVIEW-BLOCKED/)
    assert.doesNotMatch(generated, /node_modules\/\.bin\/codex|\bwhich codex\b|@codex|\bcodex exec\b/i)
  }

  const reviewer = readFileSync(resolve(REPO_ROOT, '.agents/skills/canonical-reviewer/SKILL.md'), 'utf8')
  assert.match(reviewer, /reviewIsolation: separate-context-required/)
  assert.match(reviewer, /reviewMutation: read-only/)
  assert.match(reviewer, /reviewWorkspace: immutable-snapshot-or-enforced-tool-deny/)
  assert.match(reviewer, /mutationDetection: before-after-worktree-fingerprint/)
  assert.match(reviewer, /source: packages\/design-system\/ds-canonical\/skills\/canonical-reviewer\/SKILL\.md/)
  assert.match(reviewer, /If the author provider is codex, resolve highest-certified-independent-review-v1\/tier-0-governance/)
  assert.doesNotMatch(reviewer, /^context:|^agent:/m)
})

test('deep-audit second opinion is provider-adaptive and author-separated', () => {
  const deepAudit = PROVIDER_SKILL_SEMANTICS.skills.find((skill) => skill.name === 'deep-audit-cross-codex')
  assert.equal(deepAudit.requiresIndependentPeer, true)
  assert.equal(deepAudit.requiresAuthorProvider, true)

  for (const provider of ['claude', 'codex']) {
    const driver = buildProviderSkillDriver({ skillName: deepAudit.name, targetProvider: provider })
    assert.match(driver, new RegExp(`currentProvider: ${provider}`))
    assert.match(driver, /reviewSelectionPolicy: highest-certified-independent-review-v1/)
    assert.match(driver, /reviewClass: tier-0-governance/)
    assert.match(driver, /independentPeerProvider: selected-and-frozen-at-review-prepare-time/)
    assert.match(driver, /authorProviderRequired: true/)
    assert.match(driver, /authorProviderMustEqualCurrentProvider: true/)
    assert.match(driver, /independentReviewerMustDifferFromAuthor: true/)
    assert.match(driver, new RegExp(`valid only when the author provider is ${provider}`))
    assert.match(driver, /highest certified independent capability/)
    assert.match(driver, /author\/peer collision is REVIEW-BLOCKED/)
  }

  const weakened = structuredClone(PROVIDER_SKILL_SEMANTICS)
  weakened.skills.find((skill) => skill.name === deepAudit.name).requiresAuthorProvider = false
  assert.throws(() => validateProviderSkillSemantics(weakened), /must require explicit author identity/)
})

test('product independent review is provider-adaptive, certified-target-only, read-only, and role bounded', () => {
  const review = PROVIDER_SKILL_SEMANTICS.skills.find((skill) => skill.name === 'independent-review')
  assert.equal(review.mode, 'independent-product-review')
  assert.equal(review.requiresIndependentPeer, true)
  assert.equal(review.requiresAuthorProvider, true)
  assert.equal(review.reviewOnly, true)

  const source = readFileSync(resolve(REPO_ROOT, review.sourceWorkflow), 'utf8')
  assert.match(source, /Use this workflow only for product-consumer work/)
  assert.match(source, /Do not authorize or perform design-system canonical changes/)
  assert.match(source, /package publication, release\/promotion, privileged GitHub changes, deep-audit remediation, or fleet rollout/)
  assert.match(source, /Suggestions remain text only/)

  for (const provider of ['claude', 'codex']) {
    const driver = buildProviderSkillDriver({ skillName: review.name, targetProvider: provider })
    assert.match(driver, new RegExp(`currentProvider: ${provider}`))
    assert.match(driver, /reviewSelectionPolicy: highest-certified-independent-review-v1/)
    assert.match(driver, /independentPeerProvider: selected-and-frozen-at-review-prepare-time/)
    assert.match(driver, /targetCertificationContract: exact-provider-runtime-surface-role-target-v1/)
    assert.match(driver, /authorProviderMustEqualCurrentProvider: true/)
    assert.match(driver, /reviewMutation: read-only/)
    assert.match(driver, /exact certified provider\/runtime\/surface\/product-consumer target/)
    assert.match(driver, /never acquire DS-author, release, or mutation authority/)
  }

  const unknown = structuredClone(PROVIDER_REGISTRY)
  const generic = unknown.providers.find((provider) => provider.id === 'generic')
  generic.id = 'future-uncertified'
  assert.throws(
    () => buildProviderSkillDriver({ skillName: review.name, targetProvider: generic.id, registry: unknown }),
    /ADAPTER-BLOCKED/,
  )

  const uncertified = structuredClone(PROVIDER_REGISTRY)
  delete uncertified.providers.find((provider) => provider.id === 'codex').adapter.skillBindings['independent-review'].certificationContract
  assert.throws(
    () => buildProviderSkillDriver({ skillName: review.name, targetProvider: 'codex', registry: uncertified }),
    /exact provider\/runtime\/surface\/role\/target certification contract.*ADAPTER-BLOCKED/,
  )
})

test('Claude canonical reviewer uses the registered context-fork agent while Codex stays neutral', () => {
  const claudeSkill = readFileSync(resolve(REPO_ROOT, '.claude/skills/canonical-reviewer/SKILL.md'), 'utf8')
  assert.equal(claudeSkill, buildProviderSkillDriver({ skillName: 'canonical-reviewer', targetProvider: 'claude' }))
  assert.match(claudeSkill, /^context: fork$/m)
  assert.match(claudeSkill, /^agent: canonical-reviewer$/m)

  const canonicalAgent = readFileSync(resolve(REPO_ROOT, 'packages/design-system/ds-canonical/adapters/claude/agents/canonical-reviewer.md'), 'utf8')
  const repositoryAgent = readFileSync(resolve(REPO_ROOT, '.claude/agents/canonical-reviewer.md'), 'utf8')
  assert.equal(repositoryAgent, canonicalAgent)
  assert.match(repositoryAgent, /CLAUDE_CANONICAL_REVIEWER_AGENT_V1/)
})

test('every required fleet provider surface has one explicit certification ledger entry', () => {
  assert.equal(validateProviderFleetIntegrity({
    adapterRegistry: PROVIDER_REGISTRY,
    compatibility: matrix,
    managedInventory: inventory,
    certificationLedger: certifications,
  }), true)
})

test('future provider onboarding fails closed until adapter, fleet, inventory, and certification registries agree', () => {
  const inputs = () => ({
    adapterRegistry: structuredClone(PROVIDER_REGISTRY),
    compatibility: structuredClone(matrix),
    managedInventory: structuredClone(inventory),
    certificationLedger: structuredClone(certifications),
    providerCliToolchain: structuredClone(providerCliToolchain),
  })

  const adapterOnly = inputs()
  const future = structuredClone(adapterOnly.adapterRegistry.providers.find((provider) => provider.id === 'codex'))
  future.id = 'future-provider'
  future.displayName = 'Novel future provider'
  future.instructionEntry = 'FUTURE.md'
  future.sharedInstructionEntry = 'FUTURE.md'
  future.adapter.repositoryInstructionSource = null
  future.skillDirectory = '.future-provider/workflows'
  future.hookConfig = '.future-provider/events.json'
  future.runtime.cli.executable = 'future-provider'
  future.runtime.cli.localExecutable = 'node_modules/.bin/future-provider'
  future.runtime.cli.replyArtifactPrefix = 'future-provider-reply'
  future.runtime.branchNamespace = 'future-provider/'
  future.adapter.skillView = {
    directory: '.future-provider/workflows',
    materializerId: 'markdown-workflows-directory-v1',
  }
  future.adapter.hookView.output = '.future-provider/events.json'
  future.adapter.hookView.materializerId = 'portable-event-list-json-v1'
  future.adapter.discovery = {
    providerRootNames: ['.future-provider'],
    instructionNames: ['FUTURE.md'],
    instructionOverrideNames: ['FUTURE.local.md', 'FUTURE.override.md'],
    configPaths: ['.future-provider/events.json'],
    pluginRootNames: [],
  }
  for (const binding of Object.values(future.adapter.skillBindings)) binding.self = future.id
  adapterOnly.adapterRegistry.providers.push(future)
  assert.throws(() => validateProviderFleetIntegrity(adapterOnly), /join is incomplete/)

  const mappedWithoutInventory = inputs()
  mappedWithoutInventory.adapterRegistry.providers.push(future)
  mappedWithoutInventory.compatibility.providers['future-model'] = {
    adapterProviderId: 'future-provider',
    runtimeKinds: {
      'future-cli': { runtimeProfilesBySurface: { local: 'future-provider-local' }, runtimeEvidenceRequired: true },
    },
    minimumVersion: '1.0.0',
  }
  mappedWithoutInventory.providerCliToolchain.providerBindings.push({ providerId: 'future-model', provisioning: 'external-runtime', toolProviderId: null })
  assert.throws(() => validateProviderFleetIntegrity(mappedWithoutInventory), /omits generated provider future-model/)

  const inventoryWithoutCertification = structuredClone(mappedWithoutInventory)
  for (const repo of inventoryWithoutCertification.managedInventory.repositories) {
    repo.providerSurfacesRequired.push('future-model/future-cli/local')
  }
  assert.throws(() => validateProviderFleetIntegrity(inventoryWithoutCertification), /certification ledger entry/)

  const duplicateMapping = inputs()
  duplicateMapping.compatibility.providers['codex-alias'] = {
    adapterProviderId: 'codex',
    runtimeKinds: {
      'codex-alias-cli': { runtimeProfilesBySurface: { local: 'codex-alias-local' }, runtimeEvidenceRequired: true },
    },
    minimumVersion: '1.0.0',
  }
  duplicateMapping.providerCliToolchain.providerBindings.push({ providerId: 'codex-alias', provisioning: 'external-runtime', toolProviderId: null })
  assert.throws(() => validateProviderFleetIntegrity(duplicateMapping), /maps to multiple/)

  const disabledMapping = inputs()
  disabledMapping.compatibility.providers.generic = {
    adapterProviderId: 'generic',
    runtimeKinds: {
      'generic-cli': { runtimeProfilesBySurface: { local: 'generic-local' }, runtimeEvidenceRequired: true },
    },
    minimumVersion: '1.0.0',
  }
  disabledMapping.providerCliToolchain.providerBindings.push({ providerId: 'generic', provisioning: 'external-runtime', toolProviderId: null })
  assert.throws(() => validateProviderFleetIntegrity(disabledMapping), /headless protocol|non-materialized adapter|incomplete/)
})

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { validateModel } from '../bin/reconcile-github.mjs'
import { readJson } from '../lib/common.mjs'
import { validateDesiredGithub } from '../lib/model-validation.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const inventory = readJson(resolve(ROOT, 'inventory/managed-repos.json'))
const desired = readJson(resolve(ROOT, 'desired/github.json'))
const rings = readJson(resolve(ROOT, 'release-rings.json'))
const matrix = readJson(resolve(ROOT, 'providers/compatibility-matrix.json'))
const providerToolchain = readJson(resolve(ROOT, 'providers/provider-cli-toolchain.json'))
const runtimeProfile = readJson(resolve(ROOT, 'providers/runtime-conformance.json'))
const certifications = readJson(resolve(ROOT, 'providers/certifications.json'))
const waivers = readJson(resolve(ROOT, 'waivers.json'))
const issuerRegistry = readJson(resolve(ROOT, 'trust/issuers.json'))
const NOW = new Date(Math.max(
  ...issuerRegistry.issuers.map(issuer => Date.parse(issuer.notBefore)),
) + 1)
const templateConsumerLock = readJson(resolve(ROOT, '../../template/ds-product-template/governance/lock.json'))
const templateAuditWorkflow = readFileSync(resolve(ROOT, '../../template/ds-product-template/.github/workflows/audit.yml'), 'utf8')
const authorityVersionWorkflow = readFileSync(resolve(ROOT, '../../.github/workflows/changeset-version.yml'), 'utf8')
const authorityReleaseWorkflow = readFileSync(resolve(ROOT, '../../.github/workflows/release.yml'), 'utf8')

test('live governance model encodes exact trust anchors, solo review settings, tags, and environments', () => {
  assert.equal(validateModel(inventory, desired, rings, certifications, waivers, NOW), true)
  assert.deepEqual(inventory.fleetScope, {
    coverage: 'registered-opt-in-inventory',
    enrollment: 'reviewed-registration-only',
    unregisteredDescendants: 'not-covered',
  })
  const globalFleetClaim = structuredClone(inventory)
  globalFleetClaim.fleetScope.unregisteredDescendants = 'implicitly-covered'
  assert.throws(
    () => validateModel(globalFleetClaim, desired, rings, certifications, waivers, NOW),
    /inventory schema validation failed:.*unregisteredDescendants must be equal to constant/,
  )
  assert.equal(desired.integrations.githubActions.id, 15368)
  assert.deepEqual(
    {
      id: desired.integrations.governanceCheckApp.id,
      capability: desired.integrations.governanceCheckApp.capability,
      externalTrustAnchor: desired.integrations.governanceCheckApp.externalTrustAnchor,
      secretPrefix: desired.integrations.governanceCheckApp.secretPrefix,
      repositorySelection: desired.integrations.governanceCheckApp.repositorySelection,
      permissions: desired.integrations.governanceCheckApp.permissions,
    },
    { id: 4402758, capability: 'check-only', externalTrustAnchor: true, secretPrefix: 'GOVERNANCE_CHECK_APP', repositorySelection: 'selected', permissions: { checks: 'write' } },
  )
  assert.deepEqual(
    {
      id: desired.integrations.governanceWriterApp.id,
      capability: desired.integrations.governanceWriterApp.capability,
      externalTrustAnchor: desired.integrations.governanceWriterApp.externalTrustAnchor,
      secretPrefix: desired.integrations.governanceWriterApp.secretPrefix,
      repositorySelection: desired.integrations.governanceWriterApp.repositorySelection,
      permissions: desired.integrations.governanceWriterApp.permissions,
    },
    { id: 4402767, capability: 'writer', externalTrustAnchor: false, secretPrefix: 'GOVERNANCE_WRITER_APP', repositorySelection: 'selected', permissions: { contents: 'write', pullRequests: 'write', workflows: 'write' } },
  )
  assert.notEqual(desired.integrations.governanceCheckApp.secretPrefix, desired.integrations.governanceWriterApp.secretPrefix)
  for (const mutate of [
    value => { value.integrations.governanceCheckApp.permissions.contents = 'read' },
    value => { value.integrations.governanceWriterApp.permissions.checks = 'write' },
    value => { delete value.integrations.governanceWriterApp.permissions.workflows },
    value => { value.integrations.governanceWriterApp.repositorySelection = 'all' },
  ]) {
    const broadenedApp = structuredClone(desired)
    mutate(broadenedApp)
    assert.throws(
      () => validateModel(inventory, broadenedApp, rings, certifications, waivers, NOW),
      /desired schema validation failed|Governance .* App permissions|selected-repository/,
    )
  }
  for (const profileName of ['published-template', 'product-consumer']) {
    const profile = desired.profiles[profileName]
    assert.deepEqual(profile.requiredChecks.map(check => check.context), ['Verify consumer'])
    assert.equal(profile.requiredChecks[0].integration, 'githubActions')
    assert.equal(profile.actionsWorkflowPermissions.can_approve_pull_request_reviews, true)
    assert.deepEqual(profile.environments, [])
  }
  assert.deepEqual(
    desired.profiles['product-consumer'].requiredChecks[0],
    {
      ...desired.profiles['product-consumer'].requiredChecks[0],
      baseTrusted: true,
      requiredEvents: ['repository_dispatch'],
      trustSource: 'protected-base-workflow',
      workflow: '.github/workflows/audit.yml',
    },
  )
  assert.equal(desired.profiles['published-template'].requiredChecks[0].baseTrusted, undefined)
  assert.deepEqual(desired.profiles['published-template'].requiredChecks[0].requiredEvents, ['pull_request'])
  assert.equal(desired.profiles['published-template'].requiredChecks[0].trustSource, 'repository-workflow')
  assert.equal(desired.profiles['published-template'].requiredChecks[0].workflow, '.github/workflows/audit.yml')
  assert.deepEqual(
    desired.profiles['design-system-authority'].environments.map(environment => environment.name),
    ['npm-release', 'governance-external-ledger'],
  )
  const externalLedgerEnvironment = desired.profiles['design-system-authority'].environments.find(
    environment => environment.name === 'governance-external-ledger',
  )
  assert.deepEqual(
    {
      workflow: externalLedgerEnvironment.workflow,
      credentialIntegration: externalLedgerEnvironment.credentialIntegration,
      rollout: externalLedgerEnvironment.rollout,
      deploymentBranchPolicy: externalLedgerEnvironment.deploymentBranchPolicy,
    },
    {
      workflow: '.github/workflows/external-ledger-writer.yml',
      credentialIntegration: 'governanceWriterApp',
      rollout: 'always',
      deploymentBranchPolicy: {
        customBranchPolicies: false,
        protectedBranches: true,
      },
    },
  )
  for (const profileName of ['published-template', 'product-consumer']) {
    assert.equal(
      desired.profiles[profileName].environments.some(environment => environment.name === 'governance-external-ledger'),
      false,
      `${profileName} must not receive the authority external-ledger credential`,
    )
  }
  const npmRelease = desired.profiles['design-system-authority'].environments.find(environment => environment.name === 'npm-release')
  assert.equal(Object.hasOwn(npmRelease, 'credentialIntegration'), false)
  assert.equal(npmRelease.rollout, 'always')
  assert.equal(desired.profiles['design-system-authority'].immutableReleases, false)
  const publishNpmOffset = authorityReleaseWorkflow.indexOf('\n  build-and-publish-npm:\n')
  const publishNpm = publishNpmOffset >= 0 ? authorityReleaseWorkflow.slice(publishNpmOffset + 1) : null
  assert.ok(publishNpm, 'release workflow lacks the npm-release publish job')
  assert.match(publishNpm, /environment:\s*\n\s*name: npm-release/)
  assert.match(publishNpm, /id-token: write/)
  assert.doesNotMatch(publishNpm, /create-github-app-token|GOVERNANCE_WRITER_APP|permission-contents|permission-pull-requests/)
  const authorityChecks = desired.profiles['design-system-authority'].requiredChecks
  assert.equal(authorityChecks.length, 1)
  assert.equal(authorityChecks[0].context, 'Verify(tsc + tests + compile + build)')
  assert.deepEqual(authorityChecks[0].requiredEvents, ['pull_request'])
  assert.deepEqual(authorityChecks[0].releaseRequiredEvents, ['push'])
  const authorityVerifiedMain = desired.profiles['design-system-authority'].rulesets.find(ruleset => ruleset.name === 'fleet/verified-main')
  const authorityTags = desired.profiles['design-system-authority'].rulesets.find(ruleset => ruleset.target === 'tag')
  assert.equal(authorityVerifiedMain.rollout, 'always')
  assert.equal(authorityTags.rollout, 'always')
  assert.deepEqual(authorityTags.rules.map(rule => rule.type), ['update', 'deletion'])
  assert.ok(authorityChecks.every(check => (
    check.integration === 'githubActions'
    && check.trustSource === 'repository-workflow'
    && check.baseTrusted !== true
  )))
  assert.equal(
    desired.profiles['design-system-authority'].environments.some(environment => environment.name === 'governance-check-verdict'),
    false,
    'authority profile must not regain the removed Governance Check App verdict environment',
  )
  for (const profile of Object.values(desired.profiles)) {
    assert.deepEqual(profile.actionsWorkflowPermissions, {
      can_approve_pull_request_reviews: true,
      default_workflow_permissions: 'read',
    })
    const pullRequest = profile.rulesets.flatMap(ruleset => ruleset.rules).find(rule => rule.type === 'pull_request')
    assert.ok(profile.rulesets.every(ruleset => ruleset.rollout === 'always'))
    assert.deepEqual(profile.rulesets.find(ruleset => ruleset.target === 'tag').rules.map(rule => rule.type), ['update', 'deletion'])
    assert.equal(pullRequest.parameters.required_approving_review_count, 0)
    assert.equal(pullRequest.parameters.require_code_owner_review, false)
    assert.equal(pullRequest.parameters.require_last_push_approval, false)
    assert.ok(profile.rulesets.some(ruleset => ruleset.target === 'tag' && ruleset.conditions.ref_name.include.includes('refs/tags/v*')))
    assert.ok(profile.rulesets.every(ruleset => ruleset.bypass_actors.length === 0))
  }
  assert.match(templateAuditWorkflow, /name: Verify consumer/)
  assert.match(templateAuditWorkflow, /npm ci --ignore-scripts/)
  for (const command of ['npm run typecheck', 'npm run lint:imports', 'npm run build']) assert.match(templateAuditWorkflow, new RegExp(command))
  assert.doesNotMatch(templateAuditWorkflow, /setup:governance|audit:a11y|playwright|GOVERNANCE_(?:CHECK|WRITER)_APP/)
  assert.equal(existsSync(resolve(ROOT, '../../template/ds-product-template/.github/workflows/sync-design-system.yml')), false)
  assert.match(authorityVersionWorkflow, /uses: changesets\/action@[a-f0-9]{40}/)
  assert.match(authorityVersionWorkflow, /^on:\s*\n(?:  #.*\n)*  workflow_dispatch:\s*$/m)
  assert.doesNotMatch(authorityVersionWorkflow, /^\s+push:\s*$/m)
  assert.doesNotMatch(authorityVersionWorkflow, /\bgh\s+pr\s+(?:review|merge)\b|actions\/runs\/[^\s"']+\/approve|pulls\/[^\s"']+\/reviews/)
  const overlyBroad = structuredClone(desired)
  overlyBroad.profiles['product-consumer'].actionsWorkflowPermissions.default_workflow_permissions = 'write'
  assert.throws(
    () => validateModel(inventory, overlyBroad, rings, certifications, waivers, NOW),
    /desired schema validation failed:.*default_workflow_permissions must be equal to constant/,
  )
  const unexpectedConsumerEnvironment = structuredClone(desired)
  unexpectedConsumerEnvironment.profiles['product-consumer'].environments.push(structuredClone(npmRelease))
  assert.throws(
    () => validateModel(inventory, unexpectedConsumerEnvironment, rings, certifications, waivers, NOW),
    /desired schema validation failed|must not require Governance App environments/,
  )
  const disabledActionsPrWriter = structuredClone(desired)
  disabledActionsPrWriter.profiles['product-consumer'].actionsWorkflowPermissions.can_approve_pull_request_reviews = false
  assert.throws(
    () => validateModel(inventory, disabledActionsPrWriter, rings, certifications, waivers, NOW),
    /desired schema validation failed:.*can_approve_pull_request_reviews must be equal to constant/,
  )
  const desiredValidatorContract = validateDesiredGithub.toString()
  assert.match(desiredValidatorContract, /product-consumer required check must be the protected-default receiver Verify consumer receipt/)
  assert.match(desiredValidatorContract, /must allow GitHub Actions to create upgrade pull requests/)
  assert.match(desiredValidatorContract, /externalLedgerEnvironment\.workflow === '\.github\/workflows\/external-ledger-writer\.yml'[\s\S]*governance-external-ledger must bind the protected external-ledger writer workflow/)
  assert.match(desiredValidatorContract, /externalLedgerEnvironment\.credentialIntegration === 'governanceWriterApp'[\s\S]*governance-external-ledger must use the dedicated Governance Writer App/)
  const missingExternalLedgerEnvironment = structuredClone(desired)
  missingExternalLedgerEnvironment.profiles['design-system-authority'].environments = (
    missingExternalLedgerEnvironment.profiles['design-system-authority'].environments.filter(
      environment => environment.name !== 'governance-external-ledger',
    )
  )
  assert.throws(
    () => validateModel(inventory, missingExternalLedgerEnvironment, rings, certifications, waivers, NOW),
    /desired schema validation failed|must declare exactly one governance-external-ledger environment/,
  )
  const wrongExternalLedgerWorkflow = structuredClone(desired)
  wrongExternalLedgerWorkflow.profiles['design-system-authority'].environments.find(
    environment => environment.name === 'governance-external-ledger',
  ).workflow = '.github/workflows/mirror-to-published-template.yml'
  assert.throws(
    () => validateModel(inventory, wrongExternalLedgerWorkflow, rings, certifications, waivers, NOW),
    /desired schema validation failed|must bind the protected external-ledger writer workflow/,
  )
  const externalLedgerCandidateOnly = structuredClone(desired)
  externalLedgerCandidateOnly.profiles['design-system-authority'].environments.find(
    environment => environment.name === 'governance-external-ledger',
  ).rollout = 'on-promotion'
  assert.throws(
    () => validateModel(inventory, externalLedgerCandidateOnly, rings, certifications, waivers, NOW),
    /desired schema validation failed|must exist before candidate freeze and external activation/,
  )
  const npmWriterInjection = structuredClone(desired)
  npmWriterInjection.profiles['design-system-authority'].environments.find(environment => environment.name === 'npm-release').credentialIntegration = 'governanceWriterApp'
  assert.throws(
    () => validateModel(inventory, npmWriterInjection, rings, certifications, waivers, NOW),
    /desired schema validation failed:.*design-system-authority\/environments/,
  )
  assert.match(desiredValidatorContract, /environment\.name === 'npm-release'[\s\S]*npm-release must remain OIDC-only/)
  assert.deepEqual(desired.managedEnvironmentNames, ['npm-release', 'governance-upgrade', 'governance-external-ledger'])
  assert.equal(rings.schemaVersion, 3)
  assert.equal(rings.candidateRelease, null)
  for (const ring of rings.rings) {
    assert.ok(ring.waves.length > 0)
    assert.ok(ring.promotionPredicates.every(predicate => typeof predicate === 'object' && predicate.id && predicate.type))
    assert.ok(ring.waves.every(wave => wave.maxParallel <= ring.maxParallel))
  }
  for (const assignment of Object.values(rings.assignments)) {
    assert.equal('promotedAt' in assignment, false)
    assert.equal(assignment.applyAuthorization, null)
    assert.equal(assignment.completionAttestation, null)
  }
})

test('target provider versions are current while every unproven surface remains not-certified', () => {
  const locked = Object.fromEntries(providerToolchain.tools.map(tool => [tool.providerId, tool.version]))
  const compare = (left, right) => {
    const a = left.split('.').map(Number)
    const b = right.split('.').map(Number)
    for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index]
    return 0
  }
  assert.ok(compare(locked.codex, matrix.providers.codex.minimumVersion) >= 0)
  assert.ok(compare(locked['claude-code'], matrix.providers['claude-code'].minimumVersion) >= 0)
  assert.ok(certifications.certifications.every(item => item.status === 'not-certified'))
  for (const certification of certifications.certifications) {
    const profileId = matrix.providers[certification.provider]
      ?.runtimeKinds?.[certification.runtimeKind]
      ?.runtimeProfilesBySurface?.[certification.surface]
    const profile = runtimeProfile.providers.find(item => item.id === profileId)
    assert.ok(profile, `${certification.id} must resolve one runtime profile`)
    const targetVersions = [...new Set(profile.certificationTargets.map(target => target.distributionVersion))]
    assert.deepEqual(targetVersions.length, 1, `${profile.id} target versions must be closed and uniform`)
    assert.equal(certification.providerVersion, targetVersions[0], `${certification.id} providerVersion drifted from ${profile.id}`)
    if (profile.distributionVersionAuthority.kind === 'provider-cli-toolchain') {
      assert.equal(
        certification.providerVersion,
        locked[profile.distributionVersionAuthority.providerId],
        `${certification.id} drifted from the exact provider CLI toolchain`,
      )
    } else {
      assert.equal(
        certification.providerVersion,
        profile.distributionVersionAuthority.version,
        `${certification.id} drifted from its external runtime identity authority`,
      )
    }
  }
})

test('every immutable sync-all managed file is upstream-owned for every template consumer', () => {
  const rules = inventory.ownershipPolicies['product-consumer'].rules
  for (const path of Object.keys(templateConsumerLock.payload.managedFiles)) {
    const matches = rules.filter((rule) => rule.pattern === path)
    assert.equal(matches.length, 1, `${path} must have exactly one exact product-consumer ownership rule`)
    assert.equal(matches[0].mode, 'upstream-managed', `${path} cannot default to consumer-owned while sync-all replaces it`)
    assert.equal(matches[0].owner, 'design-system-governance')
  }
  for (const path of [
    'governance/schemas/issuer-registry.schema.json',
    'governance/schemas/visual-baseline-review-policy.schema.json',
    'governance/trust/issuers.json',
    'governance/visual-baseline-review-policy.json',
  ]) {
    const matches = rules.filter(rule => rule.pattern === path)
    assert.deepEqual(matches, [{ pattern: path, mode: 'upstream-managed', owner: 'design-system-governance' }], `${path} must remain one exact upstream-owned sync-all rule`)
  }
})

#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  evaluateBranchProtectionPolicy,
  materializeExpectedBranchRulesets,
} from './lib/branch-protection-policy.mjs'
import {
  observeBranchProtectionPolicy,
  parseBranchProtectionArgs,
  resolveManagedRepositoryPolicy,
} from './check-branch-protection.mjs'

const desired = JSON.parse(readFileSync('infra/governance/desired/github.json', 'utf8'))
const inventory = JSON.parse(readFileSync('infra/governance/inventory/managed-repos.json', 'utf8'))
const integrations = structuredClone(desired.integrations)
for (const integration of Object.values(integrations)) if (!integration.id) integration.id = 424242
const expected = materializeExpectedBranchRulesets(desired.profiles['design-system-authority'], integrations)

const unicodeProfile = structuredClone(desired.profiles['design-system-authority'])
unicodeProfile.requiredChecks = ['😀 check', '中 check', 'あ check', 'ب check', 'Z check'].map(context => ({
  context,
  integration: 'githubActions',
}))
const unicodeBaseRuleset = unicodeProfile.rulesets.find(ruleset => ruleset.name === 'fleet/base-integrity')
const unicodeVerifiedRuleset = unicodeProfile.rulesets.find(ruleset => ruleset.name === 'fleet/verified-main')
unicodeProfile.rulesets = [
  { ...structuredClone(unicodeBaseRuleset), name: 'fleet/😀' },
  ...['fleet/中', 'fleet/あ', 'fleet/ب', 'fleet/Z'].map(name => ({
    ...structuredClone(unicodeVerifiedRuleset),
    name,
  })),
]
const unicodeExpected = materializeExpectedBranchRulesets(unicodeProfile, integrations)
const byteSorted = values => [...values].sort((left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')))
assert.deepEqual(unicodeExpected.map(ruleset => ruleset.name), byteSorted(unicodeProfile.rulesets.map(ruleset => ruleset.name)))
for (const ruleset of unicodeExpected) {
  const statusRule = ruleset.rules.find(rule => rule.type === 'required_status_checks')
  if (!statusRule) continue
  const checks = statusRule.parameters.required_status_checks
  assert.deepEqual(checks.map(check => check.context), byteSorted(unicodeProfile.requiredChecks.map(check => check.context)))
}

function verdict(mutator = () => {}) {
  const observed = structuredClone(expected).map((ruleset, index) => ({
    id: index + 100,
    source_type: 'Repository',
    ...ruleset,
  }))
  mutator(observed)
  return evaluateBranchProtectionPolicy({
    expectedRulesets: expected,
    observedRulesets: observed,
    managedPrefix: desired.managedRulesetPrefix,
  })
}

assert.equal(verdict().ok, true, 'exact desired branch policy must pass despite harmless API metadata')

const mutations = [
  ['missing ruleset', rulesets => rulesets.pop(), /missing managed branch ruleset/],
  ['unexpected managed ruleset', rulesets => rulesets.push({ ...structuredClone(rulesets[0]), name: 'fleet/rogue' }), /unexpected managed branch ruleset/],
  ['disabled enforcement', rulesets => { rulesets[0].enforcement = 'disabled' }, /enforcement must be active/],
  ['bypass actor', rulesets => { rulesets[0].bypass_actors.push({ actor_id: 1, actor_type: 'Team', bypass_mode: 'always' }) }, /must not have bypass actors/],
  ['force-push protection removed', rulesets => { rulesets[0].rules = rulesets[0].rules.filter(rule => rule.type !== 'non_fast_forward') }, /differs from exact desired policy/],
  ['required check removed', rulesets => {
    const rule = rulesets.flatMap(ruleset => ruleset.rules).find(candidate => candidate.type === 'required_status_checks')
    rule.parameters.required_status_checks.pop()
  }, /must contain required status checks|differs from exact desired policy/],
  ['required check App substituted', rulesets => {
    const rule = rulesets.flatMap(ruleset => ruleset.rules).find(candidate => candidate.type === 'required_status_checks')
    rule.parameters.required_status_checks[0].integration_id += 1
  }, /differs from exact desired policy/],
]

for (const [label, mutate, pattern] of mutations) {
  const result = verdict(mutate)
  assert.equal(result.ok, false, `${label} mutation must fail closed`)
  assert.match(result.failures.join('\n'), pattern, `${label} mutation returned the wrong failure`)
}

// 1B(2026-07-29):authority profile 已不引用 governanceCheckApp;負例改 null 掉
// 仍被全部 required checks 引用的 githubActions,invariant 覆蓋不變。
const unresolved = structuredClone(integrations)
unresolved.githubActions.id = null
assert.throws(
  () => materializeExpectedBranchRulesets(desired.profiles['design-system-authority'], unresolved),
  /required integration is unresolved/,
)

const weakened = structuredClone(desired.profiles['design-system-authority'])
weakened.rulesets.forEach(ruleset => { ruleset.rules = ruleset.rules.filter(rule => rule.type !== 'non_fast_forward') })
assert.throws(() => materializeExpectedBranchRulesets(weakened, integrations), /omits non_fast_forward/)

assert.deepEqual(parseBranchProtectionArgs([]), { check: false, repository: null, environment: null })
assert.throws(() => parseBranchProtectionArgs(['--check']), /requires --repository OWNER\/REPO/)
assert.deepEqual(
  parseBranchProtectionArgs(['--check', '--repository', 'ajenchen/ds-product-template']),
  { check: true, repository: 'ajenchen/ds-product-template', environment: null },
)
assert.deepEqual(
  parseBranchProtectionArgs(['--repository', 'ajenchen/design-system', '--check']),
  { check: true, repository: 'ajenchen/design-system', environment: null },
)
assert.deepEqual(
  parseBranchProtectionArgs(['--check', '--repository', 'ajenchen/design-system', '--environment', 'npm-release']),
  { check: true, repository: 'ajenchen/design-system', environment: 'npm-release' },
)
for (const [argv, pattern] of [
  [['--repository', 'ajenchen/design-system'], /only with --check/],
  [['--check', '--check'], /duplicate argument: --check/],
  [['--check', '--repository', 'ajenchen/design-system', '--repository', 'ajenchen/ds-product-template'], /duplicate argument: --repository/],
  [['--check', '--repository'], /requires OWNER\/REPO/],
  [['--check', '--repository', 'not-a-repository'], /must be OWNER\/REPO/],
  [['--check', '--environment', 'npm-release'], /requires --repository OWNER\/REPO/],
  [['--repository', 'ajenchen/design-system', '--environment', 'npm-release'], /allowed only with --check/],
  [['--check', '--repository', 'ajenchen/design-system', '--environment'], /requires NAME/],
  [['--check', '--repository', 'ajenchen/design-system', '--environment', '../npm-release'], /closed GitHub environment name/],
  [['--check', '--repository', 'ajenchen/design-system', '--environment', 'npm-release', '--environment', 'governance-external-ledger'], /duplicate argument: --environment/],
  // The mutation-boundary-only mode was removed 2026-08-04 with the external
  // activation cluster: its flags must fail closed as unknown arguments.
  [['--mutation-boundary-only'], /unknown argument: --mutation-boundary-only/],
  [['--check', '--repository', 'ajenchen/design-system', '--mutation-boundary-only'], /unknown argument: --mutation-boundary-only/],
  [['--check', '--repository', 'ajenchen/design-system', '--activation-proof', '/tmp/proof.json'], /unknown argument: --activation-proof/],
  [['--check', '--repository', 'ajenchen/design-system', '--release-source-root', '/tmp'], /unknown argument: --release-source-root/],
  [['--check', '--tag', 'v1.2.3'], /unknown argument: --tag/],
]) assert.throws(() => parseBranchProtectionArgs(argv), pattern)

const integrationIds = {
  'github-actions': desired.integrations.githubActions.id,
  'qijenchen-governance-check': desired.integrations.governanceCheckApp.id ?? 424241,
  'qijenchen-governance-writer': desired.integrations.governanceWriterApp.id ?? 424242,
}

function observerFixture({
  repository = 'ajenchen/design-system',
  currentRepository = 'ajenchen/design-system',
  inventoryValue = inventory,
  desiredValue = desired,
  metadata = null,
  permissions = null,
  environmentName = null,
  environmentResponse = null,
  mutateRulesets = () => {},
  appOverrides = {},
} = {}) {
  const selectedRepo = inventoryValue.repositories.find(item => item.github === (repository ?? currentRepository))
  const profile = selectedRepo ? desiredValue.profiles?.[selectedRepo.desiredProfile] : null
  const resolved = structuredClone(desiredValue.integrations)
  for (const integration of Object.values(resolved || {})) {
    if (integration.id === null) integration.id = integrationIds[integration.slug]
  }
  const rulesets = profile
    ? materializeExpectedBranchRulesets(profile, resolved).map((ruleset, index) => ({
      id: 100 + index,
      source_type: 'Repository',
      source: selectedRepo.github,
      ...ruleset,
    }))
    : []
  mutateRulesets(rulesets)
  const desiredEnvironment = profile?.environments?.find(item => item.name === environmentName)
  const defaultEnvironmentResponse = desiredEnvironment ? {
    id: 9001,
    name: desiredEnvironment.name,
    protection_rules: [
      { id: 9103, node_id: 'ENV_BRANCH_POLICY', type: 'branch_policy' },
      ...(desiredEnvironment.waitTimer === 0 ? [] : [
        { id: 9101, node_id: 'ENV_WAIT', type: 'wait_timer', wait_timer: desiredEnvironment.waitTimer },
      ]),
      ...(desiredEnvironment.reviewers.length === 0 && desiredEnvironment.preventSelfReview === false ? [] : [{
        id: 9102,
        node_id: 'ENV_REVIEWERS',
        type: 'required_reviewers',
        prevent_self_review: desiredEnvironment.preventSelfReview,
        reviewers: desiredEnvironment.reviewers.map(item => ({ type: item.type, reviewer: { id: item.id } })),
      }]),
    ],
    deployment_branch_policy: {
      protected_branches: desiredEnvironment.deploymentBranchPolicy.protectedBranches,
      custom_branch_policies: desiredEnvironment.deploymentBranchPolicy.customBranchPolicies,
    },
  } : null
  const calls = []
  const ghJson = (args) => {
    calls.push([...args])
    if (args[0] === 'repo') return { nameWithOwner: currentRepository }
    assert.deepEqual(args.slice(0, 5), ['api', '-X', 'GET', '-H', 'Accept: application/vnd.github+json'], 'checker must use read-only GitHub API calls')
    assert.deepEqual(args.slice(5, 7), ['-H', 'X-GitHub-Api-Version: 2022-11-28'], 'checker must pin the reviewed GitHub REST API version')
    const path = args.at(-1)
    const slug = selectedRepo?.github || repository || currentRepository
    if (path === `/repos/${slug}`) {
      return metadata ?? { full_name: slug, default_branch: selectedRepo.defaultBranch }
    }
    if (path === `/repos/${slug}/actions/permissions/workflow`) {
      return permissions ?? structuredClone(profile.actionsWorkflowPermissions)
    }
    if (environmentName && path === `/repos/${slug}/environments/${encodeURIComponent(environmentName)}`) {
      return structuredClone(environmentResponse ?? defaultEnvironmentResponse)
    }
    if (path.startsWith('/apps/')) {
      const appSlug = decodeURIComponent(path.slice('/apps/'.length))
      return appOverrides[appSlug] ?? { id: integrationIds[appSlug], slug: appSlug }
    }
    if (path === `/repos/${slug}/rulesets?includes_parents=true&per_page=100&page=1`) {
      return rulesets.map(item => ({
        id: item.id,
        name: item.name,
        target: item.target,
        source_type: item.source_type,
        source: item.source,
        enforcement: item.enforcement,
        ...(item.created_at ? { created_at: item.created_at } : {}),
        ...(item.updated_at ? { updated_at: item.updated_at } : {}),
        ...(item.node_id ? { node_id: item.node_id } : {}),
      }))
    }
    const detail = path.match(new RegExp(`^/repos/${slug.replace('/', '\\/')}/rulesets/(\\d+)$`))
    if (detail) return structuredClone(rulesets.find(item => item.id === Number(detail[1])))
    throw new Error(`unexpected mocked GitHub read:${path}`)
  }
  return { ghJson, calls, rulesets }
}

for (const repository of ['ajenchen/design-system', 'ajenchen/ds-product-template']) {
  const fixture = observerFixture({ repository })
  const result = observeBranchProtectionPolicy({ repository, inventory, desired, ghJson: fixture.ghJson })
  assert.equal(result.ok, true, `${repository} exact managed profile should pass`)
  assert.equal(result.repository, repository)
  assert.equal(result.profileName, inventory.repositories.find(item => item.github === repository).desiredProfile)
  assert.equal(result.defaultBranch, inventory.repositories.find(item => item.github === repository).defaultBranch)
  assert.equal(result.environmentName, null)
  assert.deepEqual(result.failures, [])
  assert.deepEqual(
    Object.keys(result).sort(),
    ['defaultBranch', 'environmentName', 'failures', 'ok', 'profileName', 'repository'],
    'verdict must keep the exact closed shape',
  )
  assert.equal(fixture.calls.some(args => args[0] === 'repo'), false, 'explicit repository must not be replaced by cwd inference')
  assert.ok(fixture.calls.filter(args => args[0] === 'api').every(args => args[2] === 'GET'), 'checker performed a non-GET GitHub API operation')
  assert.equal(
    fixture.calls.filter(args => args.at(-1) === `/repos/${repository}/actions/permissions/workflow`).length,
    1,
    'full verification must read Actions workflow permissions exactly once',
  )
}

const substitutedApp = observerFixture({
  repository: 'ajenchen/design-system',
  appOverrides: { 'qijenchen-governance-check': { id: 999999, slug: 'qijenchen-governance-check' } },
})
const substitutedAppVerdict = observeBranchProtectionPolicy({
  repository: 'ajenchen/design-system',
  inventory,
  desired,
  ghJson: substitutedApp.ghJson,
})
assert.equal(substitutedAppVerdict.ok, false, 'live App ID substitution behind an unchanged slug must fail closed')
assert.match(substitutedAppVerdict.failures.join('\n'), /live GitHub App identity differs from exact desired policy/)

const defaultFixture = observerFixture({ repository: null, currentRepository: 'ajenchen/design-system' })
const defaultResult = observeBranchProtectionPolicy({ inventory, desired, ghJson: defaultFixture.ghJson })
assert.equal(defaultResult.ok, true, 'default current-repository mode must remain supported')
assert.equal(defaultFixture.calls.filter(args => args[0] === 'repo').length, 1, 'default mode must resolve the current repository exactly once')

assert.throws(
  () => observeBranchProtectionPolicy({ repository: 'ajenchen/unmanaged', inventory, desired, ghJson: () => { throw new Error('network must not run') } }),
  /outside managed inventory/,
)

const ambiguousInventory = structuredClone(inventory)
ambiguousInventory.repositories.push({ ...structuredClone(ambiguousInventory.repositories[0]), id: 'duplicate-authority' })
assert.throws(
  () => resolveManagedRepositoryPolicy({ inventory: ambiguousInventory, desired, repository: 'ajenchen/design-system' }),
  /inventory is ambiguous/,
)

const missingProfile = structuredClone(desired)
delete missingProfile.profiles['published-template']
assert.throws(
  () => resolveManagedRepositoryPolicy({ inventory, desired: missingProfile, repository: 'ajenchen/ds-product-template' }),
  /desired profile is missing:published-template/,
)

for (const mutate of [
  profile => { delete profile.actionsWorkflowPermissions.can_approve_pull_request_reviews },
  profile => { profile.actionsWorkflowPermissions.unreviewed = true },
  profile => { profile.actionsWorkflowPermissions.default_workflow_permissions = 'write' },
]) {
  const invalidDesired = structuredClone(desired)
  mutate(invalidDesired.profiles['published-template'])
  assert.throws(
    () => resolveManagedRepositoryPolicy({ inventory, desired: invalidDesired, repository: 'ajenchen/ds-product-template' }),
    /Actions workflow permissions/,
  )
}

const driftedPermissions = observerFixture({
  repository: 'ajenchen/ds-product-template',
  permissions: { default_workflow_permissions: 'read', can_approve_pull_request_reviews: false },
})
const permissionVerdict = observeBranchProtectionPolicy({
  repository: 'ajenchen/ds-product-template',
  inventory,
  desired,
  ghJson: driftedPermissions.ghJson,
})
assert.equal(permissionVerdict.ok, false, 'Actions permission drift must fail closed')
assert.match(permissionVerdict.failures.join('\n'), /permissions differ from exact desired profile:published-template/)

for (const permissions of [
  { default_workflow_permissions: 'read' },
  { default_workflow_permissions: 'read', can_approve_pull_request_reviews: false, unreviewed: true },
]) {
  const fixture = observerFixture({ repository: 'ajenchen/ds-product-template', permissions })
  assert.throws(
    () => observeBranchProtectionPolicy({ repository: 'ajenchen/ds-product-template', inventory, desired, ghJson: fixture.ghJson }),
    /workflow permissions.*invalid or open shape/,
  )
}

const redirected = observerFixture({
  repository: 'ajenchen/ds-product-template',
  metadata: { full_name: 'attacker/ds-product-template', default_branch: 'main' },
})
assert.throws(
  () => observeBranchProtectionPolicy({ repository: 'ajenchen/ds-product-template', inventory, desired, ghJson: redirected.ghJson }),
  /repository identity mismatch/,
)

const unresolvedApp = observerFixture({
  repository: 'ajenchen/ds-product-template',
  appOverrides: { 'qijenchen-governance-check': { id: 0, slug: 'qijenchen-governance-check' } },
})
assert.throws(
  () => observeBranchProtectionPolicy({ repository: 'ajenchen/ds-product-template', inventory, desired, ghJson: unresolvedApp.ghJson }),
  /GitHub App identity is unresolved/,
)

const releaseEnvironment = observerFixture({
  repository: 'ajenchen/design-system',
  environmentName: 'npm-release',
})
const releaseEnvironmentVerdict = observeBranchProtectionPolicy({
  repository: 'ajenchen/design-system',
  environment: 'npm-release',
  inventory,
  desired,
  ghJson: releaseEnvironment.ghJson,
})
assert.equal(releaseEnvironmentVerdict.ok, true, 'npm-release must pass its exact design-system authority profile')
assert.equal(releaseEnvironmentVerdict.environmentName, 'npm-release')
assert.deepEqual(
  releaseEnvironment.calls.find(args => args.at(-1).includes('/environments/'))?.slice(0, 3),
  ['api', '-X', 'GET'],
  'zero-value environment rules may be omitted while deployment_branch_policy remains exact',
)
const environmentCalls = releaseEnvironment.calls.filter(args => args.at(-1).includes('/environments/'))
assert.equal(environmentCalls.length, 1, 'environment readback must use exactly one endpoint')
assert.equal(environmentCalls[0][2], 'GET', 'environment readback must be GET-only')

const nonDefaultEnvironmentDesired = structuredClone(desired)
const nonDefaultRelease = nonDefaultEnvironmentDesired.profiles['design-system-authority'].environments.find(item => item.name === 'npm-release')
nonDefaultRelease.waitTimer = 5
nonDefaultRelease.preventSelfReview = true
nonDefaultRelease.reviewers = [{ type: 'User', id: 42 }]
const omittedNonDefaultRules = observerFixture({
  repository: 'ajenchen/design-system',
  desiredValue: nonDefaultEnvironmentDesired,
  environmentName: 'npm-release',
  environmentResponse: {
    id: 9001,
    name: 'npm-release',
    protection_rules: [{ id: 9103, node_id: 'ENV_BRANCH_POLICY', type: 'branch_policy' }],
    deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
  },
})
const omittedNonDefaultVerdict = observeBranchProtectionPolicy({
  repository: 'ajenchen/design-system',
  environment: 'npm-release',
  inventory,
  desired: nonDefaultEnvironmentDesired,
  ghJson: omittedNonDefaultRules.ghJson,
})
assert.equal(omittedNonDefaultVerdict.ok, false, 'omitted rules must normalize to zero values, not conceal non-default desired policy')
assert.match(omittedNonDefaultVerdict.failures.join('\n'), /wait_timer differs/)
assert.match(omittedNonDefaultVerdict.failures.join('\n'), /prevent_self_review differs/)
assert.match(omittedNonDefaultVerdict.failures.join('\n'), /reviewer set differs/)

const templateReleaseEnvironment = observerFixture({
  repository: 'ajenchen/ds-product-template',
  environmentName: 'npm-release',
})
assert.throws(
  () => observeBranchProtectionPolicy({
    repository: 'ajenchen/ds-product-template',
    environment: 'npm-release',
    inventory,
    desired,
    ghJson: templateReleaseEnvironment.ghJson,
  }),
  /environment is not declared by selected desired profile:npm-release/,
)
assert.equal(templateReleaseEnvironment.calls.length, 0, 'profile-invalid environment must fail before GitHub readback')

const missingEnvironment = observerFixture({ repository: 'ajenchen/design-system', environmentName: 'missing-environment' })
assert.throws(
  () => observeBranchProtectionPolicy({
    repository: 'ajenchen/design-system',
    environment: 'missing-environment',
    inventory,
    desired,
    ghJson: missingEnvironment.ghJson,
  }),
  /environment is not declared by selected desired profile:missing-environment/,
)

const ambiguousEnvironmentDesired = structuredClone(desired)
ambiguousEnvironmentDesired.profiles['design-system-authority'].environments.push(
  structuredClone(ambiguousEnvironmentDesired.profiles['design-system-authority'].environments.find(item => item.name === 'npm-release')),
)
assert.throws(
  () => observeBranchProtectionPolicy({
    repository: 'ajenchen/design-system',
    environment: 'npm-release',
    inventory,
    desired: ambiguousEnvironmentDesired,
    ghJson: () => { throw new Error('network must not run') },
  }),
  /selected desired profile environment is ambiguous:npm-release/,
)

function environmentFixture(mutator) {
  const source = observerFixture({ repository: 'ajenchen/design-system', environmentName: 'npm-release' })
  const desiredEnvironment = desired.profiles['design-system-authority'].environments.find(item => item.name === 'npm-release')
  const response = {
    id: 9001,
    name: 'npm-release',
    protection_rules: [
      { id: 9101, node_id: 'ENV_WAIT', type: 'wait_timer', wait_timer: desiredEnvironment.waitTimer },
      { id: 9102, node_id: 'ENV_REVIEWERS', type: 'required_reviewers', prevent_self_review: desiredEnvironment.preventSelfReview, reviewers: [] },
    ],
    deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
  }
  mutator(response)
  return observerFixture({
    repository: 'ajenchen/design-system',
    environmentName: 'npm-release',
    environmentResponse: response,
    mutateRulesets: rulesets => {
      rulesets.splice(0, rulesets.length, ...source.rulesets)
    },
  })
}

for (const [label, mutate, pattern] of [
  ['weakened deployment branch policy', value => { value.deployment_branch_policy.protected_branches = false }, /deployment branch policy differs/],
  ['wait timer drift', value => { value.protection_rules.find(rule => rule.type === 'wait_timer').wait_timer = 5 }, /wait_timer differs/],
  ['prevent-self-review drift', value => { value.protection_rules.find(rule => rule.type === 'required_reviewers').prevent_self_review = true }, /prevent_self_review differs/],
  ['reviewer drift', value => { value.protection_rules.find(rule => rule.type === 'required_reviewers').reviewers.push({ type: 'User', reviewer: { id: 42 } }) }, /reviewer set differs/],
]) {
  const fixture = environmentFixture(mutate)
  const result = observeBranchProtectionPolicy({
    repository: 'ajenchen/design-system',
    environment: 'npm-release',
    inventory,
    desired,
    ghJson: fixture.ghJson,
  })
  assert.equal(result.ok, false, `${label} must fail environment verification`)
  assert.match(result.failures.join('\n'), pattern)
}

for (const [label, mutate, pattern] of [
  ['duplicate protection rule', value => { value.protection_rules.push(structuredClone(value.protection_rules[0])) }, /protection rule is duplicated/],
  ['duplicate branch-policy rule', value => { value.protection_rules.push({ type: 'branch_policy' }, { type: 'branch_policy' }) }, /protection rule is duplicated:branch_policy/],
  ['unexpected protection rule', value => { value.protection_rules.push({ type: 'unreviewed_policy' }) }, /unexpected type:unreviewed_policy/],
  ['open wait rule', value => { value.protection_rules[0].unreviewed = true }, /wait_timer rule has an invalid or open shape/],
  ['malformed wait rule id', value => { value.protection_rules[0].id = '9101' }, /wait_timer rule\.id is invalid/],
  ['malformed reviewer rule node id', value => { value.protection_rules[1].node_id = '' }, /required_reviewers rule\.node_id is invalid/],
  ['malformed reviewer entry', value => { value.protection_rules[1].reviewers.push({ type: 'User', reviewer: { id: '42' } }) }, /reviewer\.id is invalid/],
  ['open branch-policy rule', value => { value.protection_rules.push({ type: 'branch_policy', branches: [] }) }, /branch_policy rule has an invalid or open shape/],
  ['malformed branch-policy metadata', value => { value.protection_rules.push({ id: 0, type: 'branch_policy' }) }, /branch_policy rule\.id is invalid/],
  ['open deployment branch policy', value => { value.deployment_branch_policy.unreviewed = true }, /deployment branch policy.*invalid or open shape/],
]) {
  const fixture = environmentFixture(mutate)
  assert.throws(
    () => observeBranchProtectionPolicy({
      repository: 'ajenchen/design-system',
      environment: 'npm-release',
      inventory,
      desired,
      ghJson: fixture.ghJson,
    }),
    pattern,
    label,
  )
}

console.log('✅ branch-protection FULL observer: exact managed rulesets + live App identity + Actions permissions + environment policy readback all fail closed')

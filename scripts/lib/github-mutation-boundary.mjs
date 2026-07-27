import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'

export const GITHUB_MUTATION_BOUNDARY_CONTRACT_PATH = 'infra/governance/providers/github-mutation-boundary-contract.json'
export const GITHUB_API_VERSION = '2022-11-28'
export const EMPTY_BYPASS_ACTORS_SHA256 = '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'
export const NULL_ENVIRONMENT_POLICY_SHA256 = '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b'
export const GITHUB_MUTATION_BOUNDARY_MAXIMUM_OBSERVATION_AGE_SECONDS = 3600
export const GITHUB_MUTATION_BOUNDARY_MINIMUM_REMAINING_VALIDITY_SECONDS = 300

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
const SHA256 = /^[a-f0-9]{64}$/

function invariant(condition, message) {
  if (!condition) throw new Error(`GitHub mutation-boundary contract invalid:${message}`)
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  invariant(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has an open or incomplete shape`)
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function compareText(left, right) {
  return left === right ? 0 : left < right ? -1 : 1
}

export function stableJson(value) {
  return JSON.stringify(stable(value))
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalTimestamp(value, label) {
  invariant(typeof value === 'string' && TIMESTAMP.test(value), `${label} must be a canonical UTC timestamp`)
  const normalized = value.includes('.')
    ? value.replace(/\.(\d{1,3})Z$/, (_, fraction) => `.${fraction.padEnd(3, '0')}Z`)
    : value.replace(/Z$/, '.000Z')
  const parsed = new Date(value)
  invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === normalized, `${label} must be a canonical UTC timestamp`)
  return parsed
}

export function validateGithubMutationBoundaryContract(contract, { desired = null, inventory = null } = {}) {
  exactKeys(contract, [
    '$schema', 'schemaVersion', 'kind', 'githubApiVersion', 'canonicalization', 'scope',
    'fullRulesetProjection', 'publicRulesetProjection', 'normalizedRulesetProjection',
    'environmentPolicyProjection', 'freshnessPolicy', 'desiredBindings', 'credentialBoundary',
  ], 'contract')
  invariant(contract.$schema === '../schemas/github-mutation-boundary-contract.schema.json'
    && contract.schemaVersion === 1
    && contract.kind === 'github-mutation-boundary-contract-v1'
    && contract.githubApiVersion === GITHUB_API_VERSION, 'contract identity/API version mismatch')
  exactKeys(contract.canonicalization, ['canonicalJson', 'hashAlgorithm', 'collectionSortKey', 'collectionSortOrder'], 'canonicalization')
  invariant(stableJson(contract.canonicalization) === stableJson({
    canonicalJson: 'stable-json', hashAlgorithm: 'sha256', collectionSortKey: 'id', collectionSortOrder: 'numeric-ascending',
  }), 'canonicalization algorithm drifted')
  exactKeys(contract.scope, ['source', 'target'], 'scope')
  exactKeys(contract.scope.source, ['repository', 'environment'], 'source scope')
  exactKeys(contract.scope.target, ['repository', 'environment'], 'target scope')
  invariant(contract.scope.source.repository === 'ajenchen/design-system'
    && contract.scope.source.environment === 'governance-mirror'
    && contract.scope.target.repository === 'ajenchen/ds-product-template'
    && contract.scope.target.environment === null, 'repository/environment scope drifted')

  const publicFields = ['id', 'name', 'target', 'source_type', 'source', 'enforcement', 'created_at', 'updated_at', 'node_id', 'conditions', 'rules']
  exactKeys(contract.publicRulesetProjection, [
    'runtimePermission', 'fields', 'excludedFields', 'freshnessFields', 'mayReadBypassActors', 'mayClaimBypassAbsence',
  ], 'public projection')
  invariant(contract.publicRulesetProjection.runtimePermission === 'metadata:read'
    && stableJson(contract.publicRulesetProjection.fields) === stableJson(publicFields)
    && stableJson(contract.publicRulesetProjection.excludedFields) === stableJson(['bypass_actors', 'current_user_can_bypass', '_links'])
    && stableJson(contract.publicRulesetProjection.freshnessFields) === stableJson(['created_at', 'updated_at'])
    && contract.publicRulesetProjection.mayReadBypassActors === false
    && contract.publicRulesetProjection.mayClaimBypassAbsence === false, 'public projection weakened or drifted')

  exactKeys(contract.normalizedRulesetProjection, [
    'fields', 'requiredCheckFields', 'flattenedRequiredCheckFields', 'integrationIdentity',
    'managedRulesetPrefix', 'managedNameSet', 'parentRulesets', 'unmanagedRulesets',
    'rulesetSort', 'ruleSort', 'requiredCheckSort', 'flattenedRequiredCheckSort',
  ], 'normalized ruleset projection')
  invariant(stableJson(contract.normalizedRulesetProjection.fields) === stableJson([
    'name', 'target', 'enforcement', 'conditions', 'bypass_actors', 'rules',
  ])
    && stableJson(contract.normalizedRulesetProjection.requiredCheckFields) === stableJson(['context', 'integration'])
    && stableJson(contract.normalizedRulesetProjection.flattenedRequiredCheckFields) === stableJson(['ruleset', 'context', 'integration'])
    && contract.normalizedRulesetProjection.integrationIdentity === 'slug'
    && contract.normalizedRulesetProjection.managedRulesetPrefix === 'fleet/'
    && contract.normalizedRulesetProjection.managedNameSet === 'exact'
    && contract.normalizedRulesetProjection.parentRulesets === 'forbidden'
    && contract.normalizedRulesetProjection.unmanagedRulesets === 'included-in-snapshot-excluded-from-desired-conformance'
    && contract.normalizedRulesetProjection.rulesetSort === 'name-codepoint-ascending'
    && contract.normalizedRulesetProjection.ruleSort === 'type-then-stable-json-codepoint-ascending'
    && contract.normalizedRulesetProjection.requiredCheckSort === 'context-then-integration-codepoint-ascending'
    && contract.normalizedRulesetProjection.flattenedRequiredCheckSort === 'ruleset-then-context-then-integration-codepoint-ascending',
  'normalized ruleset projection semantics drifted')

  exactKeys(contract.fullRulesetProjection, [
    'observerAuthority', 'fields', 'excludedFields', 'bypassActorsField', 'requiredBypassActors', 'emptyBypassActorsDigest',
  ], 'full projection')
  invariant(contract.fullRulesetProjection.observerAuthority === 'independently-administered-ruleset-write-observer'
    && stableJson(contract.fullRulesetProjection.fields) === stableJson([...publicFields, 'bypass_actors'])
    && stableJson(contract.fullRulesetProjection.excludedFields) === stableJson(['current_user_can_bypass', '_links'])
    && contract.fullRulesetProjection.bypassActorsField === 'bypass_actors'
    && stableJson(contract.fullRulesetProjection.requiredBypassActors) === '[]'
    && contract.fullRulesetProjection.emptyBypassActorsDigest === EMPTY_BYPASS_ACTORS_SHA256
    && sha256(stableJson(contract.fullRulesetProjection.requiredBypassActors)) === EMPTY_BYPASS_ACTORS_SHA256,
  'full projection or empty-bypass invariant drifted')

  exactKeys(contract.environmentPolicyProjection, ['fields', 'absentValue', 'absentValueDigest'], 'environment projection')
  invariant(stableJson(contract.environmentPolicyProjection.fields) === stableJson([
    'name', 'deploymentBranchPolicy', 'waitTimer', 'preventSelfReview', 'reviewers',
  ]) && contract.environmentPolicyProjection.absentValue === null
    && contract.environmentPolicyProjection.absentValueDigest === NULL_ENVIRONMENT_POLICY_SHA256
    && sha256(stableJson(null)) === NULL_ENVIRONMENT_POLICY_SHA256, 'environment projection drifted')

  exactKeys(contract.freshnessPolicy, [
    'maximumObservationAgeSeconds', 'minimumRemainingValiditySeconds',
    'scopes',
  ], 'freshness policy')
  invariant(
    contract.freshnessPolicy.maximumObservationAgeSeconds === GITHUB_MUTATION_BOUNDARY_MAXIMUM_OBSERVATION_AGE_SECONDS
      && contract.freshnessPolicy.minimumRemainingValiditySeconds === GITHUB_MUTATION_BOUNDARY_MINIMUM_REMAINING_VALIDITY_SECONDS,
  'freshness policy timing drifted')
  exactKeys(contract.freshnessPolicy.scopes, ['source', 'target'], 'freshness policy scopes')
  const freshnessClassKeys = [
    'directRuntimeRead', 'runtimeLiveBoundViaSignedProjection', 'contractBound', 'signedUnexpired',
  ]
  const commonFreshnessClasses = {
    runtimeLiveBoundViaSignedProjection: ['normalizedRulesetsDigest', 'requiredChecksDigest'],
    signedUnexpired: ['fullRulesetsDigest', 'bypassActorsDigest', 'actionsWorkflowPermissionsDigest'],
  }
  const expectedFreshnessClasses = {
    source: {
      directRuntimeRead: [
        'publicRulesetProjectionDigest', 'repositoryIdentityDefaultBranchDigest', 'environmentPolicyDigest',
      ],
      ...commonFreshnessClasses,
      contractBound: ['projectionContractDigest'],
    },
    target: {
      directRuntimeRead: ['publicRulesetProjectionDigest', 'repositoryIdentityDefaultBranchDigest'],
      ...commonFreshnessClasses,
      contractBound: ['projectionContractDigest', 'environmentPolicyDigest'],
    },
  }
  const allObservedClaims = [
    'actionsWorkflowPermissionsDigest', 'bypassActorsDigest', 'environmentPolicyDigest',
    'fullRulesetsDigest', 'normalizedRulesetsDigest', 'projectionContractDigest',
    'publicRulesetProjectionDigest', 'repositoryIdentityDefaultBranchDigest', 'requiredChecksDigest',
  ]
  for (const scope of ['source', 'target']) {
    const classifications = contract.freshnessPolicy.scopes[scope]
    exactKeys(classifications, freshnessClassKeys, `${scope} freshness classifications`)
    invariant(
      freshnessClassKeys.every(key => stableJson(classifications[key]) === stableJson(expectedFreshnessClasses[scope][key])),
      `${scope} freshness classifications drifted`,
    )
    const classifiedFields = freshnessClassKeys.flatMap(key => classifications[key])
    invariant(
      new Set(classifiedFields).size === classifiedFields.length
        && stableJson([...classifiedFields].sort()) === stableJson(allObservedClaims),
      `${scope} freshness classifications must be disjoint and exactly cover all nine claims`,
    )
  }

  exactKeys(contract.desiredBindings, ['source', 'target'], 'desired bindings')
  const desiredBindingKeys = [
    'normalizedRulesetsDigest', 'requiredChecksDigest', 'actionsWorkflowPermissionsDigest',
    'repositoryIdentityDefaultBranchDigest', 'environmentPolicyDigest',
  ]
  for (const scope of ['source', 'target']) {
    exactKeys(contract.desiredBindings[scope], desiredBindingKeys, `${scope} desired binding`)
    invariant(desiredBindingKeys.every(key => SHA256.test(contract.desiredBindings[scope][key] ?? '')), `${scope} desired binding contains an invalid digest`)
  }
  invariant(contract.desiredBindings.target.environmentPolicyDigest === NULL_ENVIRONMENT_POLICY_SHA256, 'target desired binding does not use the canonical absent environment')

  exactKeys(contract.credentialBoundary, ['observerCredentialNamespace', 'forbiddenNamespaces', 'exportedArtifact'], 'credential boundary')
  invariant(contract.credentialBoundary.observerCredentialNamespace === 'independent-observer-proxy'
    && stableJson(contract.credentialBoundary.forbiddenNamespaces) === stableJson(['github-actions', 'model', 'candidate'])
    && contract.credentialBoundary.exportedArtifact === 'signed-claim-output-only', 'credential boundary drifted')
  invariant((desired === null) === (inventory === null), 'desired and inventory must be supplied together for desired-binding verification')
  if (desired !== null) {
    const derived = deriveDesiredBindingsUnchecked({ desired, inventory, contract })
    invariant(stableJson(contract.desiredBindings) === stableJson(derived.desiredBindings), 'committed desired bindings differ from the canonical desired/inventory projection')
  }
  return contract
}

function nonEmptyString(value, label) {
  invariant(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`)
  return value
}

function normalizedRequiredChecks(profile, integrations, label) {
  invariant(Array.isArray(profile.requiredChecks) && profile.requiredChecks.length > 0, `${label} requiredChecks must be non-empty`)
  invariant(integrations && typeof integrations === 'object' && !Array.isArray(integrations), 'desired integration registry must be an object')
  const knownSlugs = new Set()
  for (const [name, integration] of Object.entries(integrations)) {
    invariant(integration && typeof integration === 'object' && !Array.isArray(integration), `desired integration ${name} must be an object`)
    const slug = nonEmptyString(integration.slug, `desired integration ${name}.slug`)
    invariant(!knownSlugs.has(slug), `desired integration slug is duplicated:${slug}`)
    invariant(integration.id === null || (Number.isSafeInteger(integration.id) && integration.id > 0), `desired integration ${name}.id is invalid`)
    knownSlugs.add(slug)
  }
  const checks = profile.requiredChecks.map((check, index) => {
    invariant(check && typeof check === 'object' && !Array.isArray(check), `${label} requiredChecks[${index}] must be an object`)
    const context = nonEmptyString(check.context, `${label} requiredChecks[${index}].context`)
    const integrationName = nonEmptyString(check.integration, `${label} requiredChecks[${index}].integration`)
    const integration = integrations[integrationName]
    invariant(integration && typeof integration === 'object' && !Array.isArray(integration), `${label} required check references an unknown integration:${integrationName}`)
    return { context, integration: integration.slug }
  }).sort((left, right) => compareText(left.context, right.context) || compareText(left.integration, right.integration))
  invariant(new Set(checks.map(check => check.context)).size === checks.length, `${label} required-check contexts are duplicated`)
  return checks
}

function normalizedDesiredRule(rule, checks, label) {
  invariant(rule && typeof rule === 'object' && !Array.isArray(rule), `${label} must be an object`)
  const keys = Object.keys(rule).sort()
  invariant(
    stableJson(keys) === stableJson(['type']) || stableJson(keys) === stableJson(['parameters', 'type']),
    `${label} has an open shape`,
  )
  nonEmptyString(rule.type, `${label}.type`)
  const normalized = { type: rule.type }
  if (Object.hasOwn(rule, 'parameters')) {
    invariant(rule.parameters && typeof rule.parameters === 'object' && !Array.isArray(rule.parameters), `${label}.parameters must be an object`)
    normalized.parameters = clone(rule.parameters)
  }
  if (rule.type === 'required_status_checks') {
    invariant(normalized.parameters?.fromProfile === true, `${label} must consume required checks from the desired profile`)
    delete normalized.parameters.fromProfile
    normalized.parameters.required_status_checks = clone(checks)
    invariant(normalized.parameters.strict_required_status_checks_policy === true, `${label} must require strict status checks`)
  } else if (normalized.parameters) {
    invariant(!Object.hasOwn(normalized.parameters, 'fromProfile'), `${label} contains fromProfile outside required_status_checks`)
  }
  return normalized
}

function normalizedDesiredRulesets(profile, checks, contract, label) {
  invariant(Array.isArray(profile.rulesets) && profile.rulesets.length > 0, `${label} rulesets must be non-empty`)
  const managedPrefix = contract.normalizedRulesetProjection.managedRulesetPrefix
  const rulesets = profile.rulesets.map((source, index) => {
    const itemLabel = `${label} rulesets[${index}]`
    exactKeys(source, ['bypass_actors', 'conditions', 'enforcement', 'name', 'rollout', 'rules', 'target'], itemLabel)
    nonEmptyString(source.name, `${itemLabel}.name`)
    invariant(source.name.startsWith(managedPrefix), `${itemLabel} is outside the managed ruleset namespace`)
    invariant(['branch', 'tag'].includes(source.target), `${itemLabel}.target is invalid`)
    invariant(source.enforcement === 'active', `${itemLabel}.enforcement must be active`)
    invariant(source.conditions && typeof source.conditions === 'object' && !Array.isArray(source.conditions), `${itemLabel}.conditions must be an object`)
    invariant(Array.isArray(source.bypass_actors) && source.bypass_actors.length === 0, `${itemLabel} must have no bypass actors`)
    invariant(Array.isArray(source.rules) && source.rules.length > 0, `${itemLabel}.rules must be non-empty`)
    const rules = source.rules.map((rule, ruleIndex) => normalizedDesiredRule(rule, checks, `${itemLabel}.rules[${ruleIndex}]`))
      .sort((left, right) => compareText(left.type, right.type) || compareText(stableJson(left), stableJson(right)))
    return {
      name: source.name,
      target: source.target,
      enforcement: source.enforcement,
      conditions: clone(source.conditions),
      bypass_actors: [],
      rules,
    }
  }).sort((left, right) => compareText(left.name, right.name))
  invariant(new Set(rulesets.map(ruleset => ruleset.name)).size === rulesets.length, `${label} managed ruleset names are duplicated`)
  return rulesets
}

function flattenedRequiredChecks(rulesets) {
  const flattened = []
  for (const ruleset of rulesets) {
    for (const rule of ruleset.rules) {
      if (rule.type !== 'required_status_checks') continue
      invariant(Array.isArray(rule.parameters?.required_status_checks) && rule.parameters.required_status_checks.length > 0,
        `normalized ruleset ${ruleset.name} has no required status checks`)
      for (const check of rule.parameters.required_status_checks) {
        exactKeys(check, ['context', 'integration'], `normalized ruleset ${ruleset.name} required status check`)
        flattened.push({ ruleset: ruleset.name, context: check.context, integration: check.integration })
      }
    }
  }
  invariant(flattened.length > 0, 'normalized desired rulesets contain no required status checks')
  flattened.sort((left, right) => (
    compareText(left.ruleset, right.ruleset)
      || compareText(left.context, right.context)
      || compareText(left.integration, right.integration)
  ))
  invariant(
    new Set(flattened.map(check => `${check.ruleset}\0${check.context}\0${check.integration}`)).size === flattened.length,
    'normalized desired rulesets contain duplicate flattened required checks',
  )
  return flattened
}

function normalizedActionsWorkflowPermissions(profile, label) {
  exactKeys(profile.actionsWorkflowPermissions, ['can_approve_pull_request_reviews', 'default_workflow_permissions'], `${label} Actions workflow permissions`)
  invariant(profile.actionsWorkflowPermissions.default_workflow_permissions === 'read', `${label} default workflow permission must be read`)
  invariant(typeof profile.actionsWorkflowPermissions.can_approve_pull_request_reviews === 'boolean', `${label} pull-request approval permission is invalid`)
  return clone(profile.actionsWorkflowPermissions)
}

function normalizedEnvironment(profile, name, label) {
  if (name === null) return null
  invariant(Array.isArray(profile.environments), `${label} environments must be an array`)
  const matches = profile.environments.filter(environment => environment?.name === name)
  invariant(matches.length === 1, `${label} must declare exactly one ${name} environment`)
  const environment = matches[0]
  exactKeys(environment.deploymentBranchPolicy, ['customBranchPolicies', 'protectedBranches'], `${label} ${name} deployment branch policy`)
  invariant(typeof environment.deploymentBranchPolicy.customBranchPolicies === 'boolean'
    && typeof environment.deploymentBranchPolicy.protectedBranches === 'boolean', `${label} ${name} deployment branch policy is invalid`)
  invariant(Number.isSafeInteger(environment.waitTimer) && environment.waitTimer >= 0, `${label} ${name} waitTimer is invalid`)
  invariant(typeof environment.preventSelfReview === 'boolean', `${label} ${name} preventSelfReview is invalid`)
  invariant(Array.isArray(environment.reviewers), `${label} ${name} reviewers must be an array`)
  const reviewers = environment.reviewers.map((reviewer, index) => {
    exactKeys(reviewer, ['id', 'type'], `${label} ${name} reviewers[${index}]`)
    invariant(['User', 'Team'].includes(reviewer.type) && Number.isSafeInteger(reviewer.id) && reviewer.id > 0, `${label} ${name} reviewers[${index}] is invalid`)
    return { type: reviewer.type, id: reviewer.id }
  }).sort((left, right) => compareText(left.type, right.type) || left.id - right.id)
  invariant(new Set(reviewers.map(reviewer => `${reviewer.type}:${reviewer.id}`)).size === reviewers.length, `${label} ${name} reviewers are duplicated`)
  return {
    name,
    deploymentBranchPolicy: clone(environment.deploymentBranchPolicy),
    waitTimer: environment.waitTimer,
    preventSelfReview: environment.preventSelfReview,
    reviewers,
  }
}

function repositoryForScope(inventory, contract, scope) {
  invariant(Array.isArray(inventory?.repositories), 'managed repository inventory is missing')
  const repository = contract.scope[scope].repository
  const matches = inventory.repositories.filter(item => item?.github === repository)
  invariant(matches.length === 1, `${scope} repository is missing or duplicated in managed inventory`)
  const expectedRole = scope === 'source' ? 'authority' : 'template-mirror'
  invariant(matches[0].role === expectedRole, `${scope} repository role is invalid`)
  nonEmptyString(matches[0].defaultBranch, `${scope} repository defaultBranch`)
  nonEmptyString(matches[0].desiredProfile, `${scope} repository desiredProfile`)
  return matches[0]
}

function deriveDesiredBindingsUnchecked({
  desired,
  inventory,
  contract,
} = {}) {
  invariant(desired?.profiles && typeof desired.profiles === 'object' && !Array.isArray(desired.profiles), 'desired GitHub profiles are missing')
  const desiredBindings = {}
  const projections = {}
  for (const scope of ['source', 'target']) {
    const repository = repositoryForScope(inventory, contract, scope)
    const profile = desired.profiles[repository.desiredProfile]
    invariant(profile && typeof profile === 'object' && !Array.isArray(profile), `${scope} desired GitHub profile is missing:${repository.desiredProfile}`)
    const profileRequiredChecks = normalizedRequiredChecks(profile, desired.integrations, `${scope} desired profile`)
    const normalizedRulesets = normalizedDesiredRulesets(profile, profileRequiredChecks, contract, `${scope} desired profile`)
    const requiredChecks = flattenedRequiredChecks(normalizedRulesets)
    const actionsWorkflowPermissions = normalizedActionsWorkflowPermissions(profile, `${scope} desired profile`)
    const repositoryIdentityDefaultBranch = { repository: repository.github, defaultBranch: repository.defaultBranch }
    const environmentPolicy = normalizedEnvironment(profile, contract.scope[scope].environment, `${scope} desired profile`)
    projections[scope] = {
      normalizedRulesets,
      requiredChecks,
      actionsWorkflowPermissions,
      repositoryIdentityDefaultBranch,
      environmentPolicy,
    }
    desiredBindings[scope] = {
      normalizedRulesetsDigest: sha256(stableJson(normalizedRulesets)),
      requiredChecksDigest: sha256(stableJson(requiredChecks)),
      actionsWorkflowPermissionsDigest: sha256(stableJson(actionsWorkflowPermissions)),
      repositoryIdentityDefaultBranchDigest: sha256(stableJson(repositoryIdentityDefaultBranch)),
      environmentPolicyDigest: sha256(stableJson(environmentPolicy)),
    }
  }
  return { desiredBindings, projections }
}

export function deriveGithubMutationBoundaryDesiredBindings({ desired, inventory, contract } = {}) {
  validateGithubMutationBoundaryContract(contract)
  const derived = deriveDesiredBindingsUnchecked({ desired, inventory, contract })
  invariant(stableJson(contract.desiredBindings) === stableJson(derived.desiredBindings), 'committed desired bindings differ from the canonical desired/inventory projection')
  return derived
}

export function loadGithubMutationBoundaryContract({ repoRoot, path = GITHUB_MUTATION_BOUNDARY_CONTRACT_PATH } = {}) {
  invariant(typeof repoRoot === 'string' && repoRoot.length > 0, 'repoRoot is required')
  const root = realpathSync(repoRoot)
  const file = resolve(root, path)
  invariant(file.startsWith(`${root}${sep}`), 'contract path escapes repository root')
  const info = lstatSync(file)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'contract must be one regular non-symlink file')
  const parent = realpathSync(dirname(file))
  invariant(parent === root || parent.startsWith(`${root}${sep}`), 'contract parent escapes repository root')
  const bytes = readFileSync(file)
  let contract
  try { contract = JSON.parse(bytes) } catch (error) { throw new Error(`GitHub mutation-boundary contract invalid:JSON parse failed:${error.message}`) }
  validateGithubMutationBoundaryContract(contract)
  return {
    path,
    bytes,
    bytesSha256: sha256(bytes),
    sha256: sha256(stableJson(contract)),
    contract,
  }
}

export function projectPublicRulesets(rulesets, contract) {
  validateGithubMutationBoundaryContract(contract)
  invariant(Array.isArray(rulesets) && rulesets.length > 0, 'public ruleset response must be a non-empty array')
  const fields = contract.publicRulesetProjection.fields
  const allowed = new Set([...fields, ...contract.publicRulesetProjection.excludedFields])
  const projected = rulesets.map((ruleset, index) => {
    const label = `public ruleset[${index}]`
    invariant(ruleset && typeof ruleset === 'object' && !Array.isArray(ruleset), `${label} must be an object`)
    invariant(Object.keys(ruleset).every(key => allowed.has(key)), `${label} has an unreviewed field`)
    invariant(!Object.hasOwn(ruleset, 'bypass_actors'), `${label} unexpectedly exposed bypass actors to the metadata-only runtime`)
    invariant(fields.every(field => Object.hasOwn(ruleset, field)), `${label} lacks a contracted public field`)
    invariant(Number.isSafeInteger(ruleset.id) && ruleset.id > 0, `${label}.id is invalid`)
    for (const field of ['name', 'target', 'source_type', 'source', 'enforcement', 'node_id']) {
      invariant(typeof ruleset[field] === 'string' && ruleset[field].length > 0, `${label}.${field} is invalid`)
    }
    invariant(ruleset.conditions && typeof ruleset.conditions === 'object' && !Array.isArray(ruleset.conditions), `${label}.conditions is invalid`)
    invariant(Array.isArray(ruleset.rules) && ruleset.rules.length > 0, `${label}.rules is invalid`)
    const createdAt = canonicalTimestamp(ruleset.created_at, `${label}.created_at`)
    const updatedAt = canonicalTimestamp(ruleset.updated_at, `${label}.updated_at`)
    invariant(updatedAt >= createdAt, `${label}.updated_at precedes created_at`)
    return Object.fromEntries(fields.map(field => [field, ruleset[field]]))
  }).sort((left, right) => left.id - right.id)
  invariant(new Set(projected.map(item => item.id)).size === projected.length, 'public ruleset ids are duplicated')
  return { projection: projected, sha256: sha256(stableJson(projected)) }
}

import { compareUtf8Bytes } from '../../infra/governance/lib/common.mjs'

const MANAGED_PREFIX = 'fleet/'

function fail(message) {
  throw new Error(`branch-protection policy invalid:${message}`)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort(compareUtf8Bytes).map(key => [key, stable(value[key])]))
}

function stableString(value) {
  return JSON.stringify(stable(value))
}

function nonEmpty(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`)
}

function normalizedRule(rule, label) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) fail(`${label} must be an object`)
  nonEmpty(rule.type, `${label}.type`)
  const normalized = { type: rule.type }
  if (Object.hasOwn(rule, 'parameters')) {
    if (!rule.parameters || typeof rule.parameters !== 'object' || Array.isArray(rule.parameters)) fail(`${label}.parameters must be an object`)
    normalized.parameters = clone(rule.parameters)
    if (rule.type === 'required_status_checks') {
      const checks = normalized.parameters.required_status_checks
      if (!Array.isArray(checks) || checks.length === 0) fail(`${label} must contain required status checks`)
      for (const [index, check] of checks.entries()) {
        nonEmpty(check?.context, `${label}.required_status_checks[${index}].context`)
        if (!Number.isSafeInteger(check?.integration_id) || check.integration_id <= 0) {
          fail(`${label}.required_status_checks[${index}].integration_id is unresolved`)
        }
      }
      const sorted = [...checks].sort((left, right) => (
        compareUtf8Bytes(left.context, right.context) || left.integration_id - right.integration_id
      ))
      if (new Set(sorted.map(check => check.context)).size !== sorted.length) fail(`${label} contains duplicate required status checks`)
      normalized.parameters.required_status_checks = sorted
      if (normalized.parameters.strict_required_status_checks_policy !== true) {
        fail(`${label} must require strict status checks`)
      }
    }
  }
  return normalized
}

function normalizedRuleset(ruleset, label) {
  if (!ruleset || typeof ruleset !== 'object' || Array.isArray(ruleset)) fail(`${label} must be an object`)
  nonEmpty(ruleset.name, `${label}.name`)
  if (ruleset.target !== 'branch') fail(`${label}.target must be branch`)
  if (ruleset.enforcement !== 'active') fail(`${label}.enforcement must be active`)
  if (!ruleset.conditions || typeof ruleset.conditions !== 'object' || Array.isArray(ruleset.conditions)) fail(`${label}.conditions must be an object`)
  if (!Array.isArray(ruleset.bypass_actors) || ruleset.bypass_actors.length !== 0) fail(`${label} must not have bypass actors`)
  if (!Array.isArray(ruleset.rules) || ruleset.rules.length === 0) fail(`${label}.rules must be non-empty`)
  const rules = ruleset.rules.map((rule, index) => normalizedRule(rule, `${label}.rules[${index}]`))
    .sort((left, right) => compareUtf8Bytes(`${left.type}:${stableString(left)}`, `${right.type}:${stableString(right)}`))
  return {
    name: ruleset.name,
    target: ruleset.target,
    enforcement: ruleset.enforcement,
    conditions: clone(ruleset.conditions),
    bypass_actors: [],
    rules,
  }
}

export function materializeExpectedBranchRulesets(profile, integrations) {
  if (!profile || typeof profile !== 'object' || !Array.isArray(profile.rulesets) || !Array.isArray(profile.requiredChecks)) {
    fail('desired profile is malformed')
  }
  if (!integrations || typeof integrations !== 'object' || Array.isArray(integrations)) fail('integration registry is malformed')
  const required_status_checks = profile.requiredChecks.map((check, index) => {
    nonEmpty(check?.context, `requiredChecks[${index}].context`)
    nonEmpty(check?.integration, `requiredChecks[${index}].integration`)
    const integration = integrations[check.integration]
    if (!Number.isSafeInteger(integration?.id) || integration.id <= 0) fail(`required integration is unresolved:${check.integration}`)
    nonEmpty(integration.slug, `integration ${check.integration}.slug`)
    return { context: check.context, integration_id: integration.id }
  })
  if (new Set(required_status_checks.map(check => check.context)).size !== required_status_checks.length) {
    fail('desired required-check contexts are duplicated')
  }

  const expected = profile.rulesets.filter(ruleset => ruleset.target === 'branch').map(source => {
    const ruleset = clone(source)
    delete ruleset.rollout
    ruleset.enforcement = 'active'
    ruleset.rules = ruleset.rules.map(rule => {
      if (rule.type !== 'required_status_checks' || !rule.parameters?.fromProfile) return rule
      const parameters = clone(rule.parameters)
      delete parameters.fromProfile
      parameters.required_status_checks = clone(required_status_checks)
      return { ...rule, parameters }
    })
    return normalizedRuleset(ruleset, `desired ruleset ${ruleset.name}`)
  }).sort((left, right) => compareUtf8Bytes(left.name, right.name))

  if (expected.length === 0) fail('desired profile has no branch rulesets')
  if (new Set(expected.map(ruleset => ruleset.name)).size !== expected.length) fail('desired branch ruleset names are duplicated')
  const ruleTypes = new Set(expected.flatMap(ruleset => ruleset.rules.map(rule => rule.type)))
  for (const requiredType of ['non_fast_forward', 'pull_request', 'required_status_checks']) {
    if (!ruleTypes.has(requiredType)) fail(`desired branch policy omits ${requiredType}`)
  }
  return expected
}

export function evaluateBranchProtectionPolicy({
  expectedRulesets,
  observedRulesets,
  managedPrefix = MANAGED_PREFIX,
} = {}) {
  const failures = []
  let expected
  try {
    if (!Array.isArray(expectedRulesets) || expectedRulesets.length === 0) fail('expected rulesets are missing')
    expected = expectedRulesets.map((item, index) => normalizedRuleset(item, `expectedRulesets[${index}]`))
      .sort((left, right) => compareUtf8Bytes(left.name, right.name))
    if (new Set(expected.map(item => item.name)).size !== expected.length) fail('expected ruleset names are duplicated')
  } catch (error) {
    return { ok: false, failures: [error.message] }
  }
  if (!Array.isArray(observedRulesets)) return { ok: false, failures: ['observed rulesets are unavailable'] }

  const observedByName = new Map()
  for (const [index, source] of observedRulesets.entries()) {
    const name = source?.name
    if (typeof name !== 'string' || !name) {
      failures.push(`observedRulesets[${index}] has no name`)
      continue
    }
    if (observedByName.has(name)) failures.push(`duplicate observed ruleset:${name}`)
    observedByName.set(name, source)
  }
  const expectedNames = new Set(expected.map(item => item.name))
  for (const source of observedRulesets) {
    if (source?.target === 'branch' && source?.name?.startsWith(managedPrefix) && !expectedNames.has(source.name)) {
      failures.push(`unexpected managed branch ruleset:${source.name}`)
    }
  }
  for (const wanted of expected) {
    const source = observedByName.get(wanted.name)
    if (!source) {
      failures.push(`missing managed branch ruleset:${wanted.name}`)
      continue
    }
    try {
      const actual = normalizedRuleset(source, `observed ruleset ${wanted.name}`)
      if (stableString(actual) !== stableString(wanted)) failures.push(`ruleset differs from exact desired policy:${wanted.name}`)
    } catch (error) {
      failures.push(error.message)
    }
  }
  return { ok: failures.length === 0, failures }
}

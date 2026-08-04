#!/usr/bin/env node
/**
 * Read-only GitHub branch-policy observer. `--check` fails closed on transport,
 * authority, schema, integration-resolution, or exact desired-state drift.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  evaluateBranchProtectionPolicy,
  materializeExpectedBranchRulesets,
} from './lib/branch-protection-policy.mjs'
import {
  captureClosedGitHubToken,
  runClosedGh,
} from './lib/closed-tool-execution.mjs'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_GITHUB_API_VERSION = '2022-11-28'
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const ENVIRONMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  invariant(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has an invalid or open shape`)
}

export function parseBranchProtectionArgs(argv) {
  invariant(Array.isArray(argv), 'branch-protection arguments must be an array')
  let check = false
  let repository = null
  let environment = null
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index]
    if (name === '--check') {
      invariant(check === false, 'duplicate argument: --check')
      check = true
      continue
    }
    if (name === '--repository') {
      invariant(repository === null, 'duplicate argument: --repository')
      const value = argv[index + 1]
      invariant(typeof value === 'string' && value && !value.startsWith('--'), '--repository requires OWNER/REPO')
      invariant(REPOSITORY.test(value), '--repository must be OWNER/REPO')
      repository = value
      index += 1
      continue
    }
    if (name === '--environment') {
      invariant(environment === null, 'duplicate argument: --environment')
      const value = argv[index + 1]
      invariant(typeof value === 'string' && value && !value.startsWith('--'), '--environment requires NAME')
      invariant(ENVIRONMENT.test(value), '--environment must be a closed GitHub environment name')
      environment = value
      index += 1
      continue
    }
    throw new Error(`unknown argument: ${String(name)}`)
  }
  invariant(!check || repository !== null, '--check requires --repository OWNER/REPO')
  invariant(repository === null || check, '--repository is allowed only with --check')
  invariant(environment === null || (check && repository !== null), '--environment is allowed only with --check --repository OWNER/REPO')
  return { check, repository, environment }
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'))
}


let capturedBranchProtectionToken
function gh(args) {
  if (capturedBranchProtectionToken === undefined) {
    capturedBranchProtectionToken = captureClosedGitHubToken({ requireToken: true })
  }
  const result = runClosedGh(args, {
    cwd: ROOT,
    environment: {},
    maxOutputBytes: 16 * 1024 * 1024,
    repoRoot: ROOT,
    token: capturedBranchProtectionToken,
    tokenEnvironmentName: null,
    timeoutMs: 60_000,
  })
  if (result.error || result.signal !== null || result.status !== 0) {
    const detail = (result.error?.message || result.stderr || result.stdout || `exit ${result.status}`).trim().slice(0, 1000)
    throw new Error(`GitHub readback failed:${args.join(' ')}:${detail}`)
  }
  return result.stdout.trim()
}

function ghJsonCommand(args, label) {
  const output = gh(args)
  try {
    return JSON.parse(output)
  } catch (error) {
    throw new Error(`${label} returned invalid JSON:${error.message}`)
  }
}

function apiWith(ghJson, path, apiVersion = DEFAULT_GITHUB_API_VERSION) {
  invariant(apiVersion === DEFAULT_GITHUB_API_VERSION, 'GitHub REST API version differs from the reviewed protocol')
  return ghJson([
    'api', '-X', 'GET',
    '-H', 'Accept: application/vnd.github+json',
    '-H', `X-GitHub-Api-Version: ${apiVersion}`,
    path,
  ], path)
}

function readAllRulesets(slug, api) {
  const summaries = []
  for (let page = 1; page <= 100; page += 1) {
    const items = api(`/repos/${slug}/rulesets?includes_parents=true&per_page=100&page=${page}`)
    if (!Array.isArray(items)) throw new Error('GitHub ruleset summary response is not an array')
    for (const [index, item] of items.entries()) {
      relevantKeys(item, {
        required: ['id'],
        allowed: ['id', 'name', 'target', 'source_type', 'source', 'enforcement', 'created_at', 'updated_at', 'node_id', '_links'],
      }, `GitHub ruleset summary page ${page}[${index}]`)
    }
    summaries.push(...items)
    if (items.length < 100) break
    if (page === 100) throw new Error('GitHub ruleset pagination exceeded the closed limit')
  }
  const ids = new Set()
  return summaries.map((summary, index) => {
    if (!Number.isSafeInteger(summary?.id) || summary.id <= 0 || ids.has(summary.id)) {
      throw new Error(`GitHub ruleset summary ${index} has a missing or duplicate id`)
    }
    ids.add(summary.id)
    const detail = api(`/repos/${slug}/rulesets/${summary.id}`)
    invariant(detail?.id === summary.id, `GitHub ruleset detail identity differs from summary:${summary.id}`)
    invariant(detail.source_type === 'Repository' && detail.source === slug, `parent or foreign ruleset is forbidden:${summary.id}`)
    return detail
  })
}

function normalizeActionsWorkflowPermissions(value, label, { requireRead = false } = {}) {
  exactKeys(value, ['default_workflow_permissions', 'can_approve_pull_request_reviews'], label)
  invariant(['read', 'write'].includes(value.default_workflow_permissions), `${label} default_workflow_permissions is invalid`)
  invariant(typeof value.can_approve_pull_request_reviews === 'boolean', `${label} can_approve_pull_request_reviews is invalid`)
  if (requireRead) invariant(value.default_workflow_permissions === 'read', `${label} must default GITHUB_TOKEN permissions to read`)
  return {
    default_workflow_permissions: value.default_workflow_permissions,
    can_approve_pull_request_reviews: value.can_approve_pull_request_reviews,
  }
}

function relevantKeys(value, { required, allowed }, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value)
  invariant(required.every(key => actual.includes(key)), `${label} is missing required fields`)
  invariant(actual.every(key => allowed.includes(key)), `${label} has an invalid or open shape`)
}

function validateProtectionRuleMetadata(rule, label) {
  if (Object.prototype.hasOwnProperty.call(rule, 'id')) {
    invariant(Number.isSafeInteger(rule.id) && rule.id > 0, `${label}.id is invalid`)
  }
  if (Object.prototype.hasOwnProperty.call(rule, 'node_id')) {
    invariant(typeof rule.node_id === 'string' && rule.node_id.length > 0, `${label}.node_id is invalid`)
  }
}

function normalizedReviewerSet(reviewers, label, { observed = false } = {}) {
  invariant(Array.isArray(reviewers), `${label} must be an array`)
  const normalized = reviewers.map((item, index) => {
    const itemLabel = `${label}[${index}]`
    if (observed) {
      exactKeys(item, ['type', 'reviewer'], itemLabel)
      invariant(item.reviewer && typeof item.reviewer === 'object' && !Array.isArray(item.reviewer), `${itemLabel}.reviewer must be an object`)
      invariant(Number.isSafeInteger(item.reviewer.id) && item.reviewer.id > 0, `${itemLabel}.reviewer.id is invalid`)
      invariant(['User', 'Team'].includes(item.type), `${itemLabel}.type is invalid`)
      return { type: item.type, id: item.reviewer.id }
    }
    exactKeys(item, ['type', 'id'], itemLabel)
    invariant(['User', 'Team'].includes(item.type), `${itemLabel}.type is invalid`)
    invariant(Number.isSafeInteger(item.id) && item.id > 0, `${itemLabel}.id is invalid`)
    return { type: item.type, id: item.id }
  }).sort((left, right) => compareUtf8Bytes(left.type, right.type) || left.id - right.id)
  invariant(new Set(normalized.map(item => `${item.type}:${item.id}`)).size === normalized.length, `${label} contains duplicate reviewers`)
  return normalized
}

function expectedEnvironmentPolicy(profile, environmentName) {
  invariant(Array.isArray(profile.environments), 'selected desired profile environments are missing')
  const matches = profile.environments.filter(item => item?.name === environmentName)
  invariant(matches.length === 1, matches.length === 0
    ? `environment is not declared by selected desired profile:${environmentName}`
    : `selected desired profile environment is ambiguous:${environmentName}`)
  const environment = matches[0]
  invariant(Number.isSafeInteger(environment.waitTimer) && environment.waitTimer >= 0 && environment.waitTimer <= 43_200, `desired environment waitTimer is invalid:${environmentName}`)
  invariant(typeof environment.preventSelfReview === 'boolean', `desired environment preventSelfReview is invalid:${environmentName}`)
  exactKeys(environment.deploymentBranchPolicy, ['protectedBranches', 'customBranchPolicies'], `desired environment deployment branch policy:${environmentName}`)
  invariant(typeof environment.deploymentBranchPolicy.protectedBranches === 'boolean'
    && typeof environment.deploymentBranchPolicy.customBranchPolicies === 'boolean',
  `desired environment deployment branch policy is invalid:${environmentName}`)
  return {
    name: environment.name,
    deploymentBranchPolicy: {
      protectedBranches: environment.deploymentBranchPolicy.protectedBranches,
      customBranchPolicies: environment.deploymentBranchPolicy.customBranchPolicies,
    },
    waitTimer: environment.waitTimer,
    preventSelfReview: environment.preventSelfReview,
    reviewers: normalizedReviewerSet(environment.reviewers, `desired environment reviewers:${environmentName}`),
  }
}

function observedEnvironmentPolicy(value, environmentName) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `GitHub environment response is invalid:${environmentName}`)
  invariant(value.name === environmentName, `GitHub environment name mismatch:${value.name ?? '<missing>'}`)
  exactKeys(value.deployment_branch_policy, ['protected_branches', 'custom_branch_policies'], `GitHub environment deployment branch policy:${environmentName}`)
  invariant(typeof value.deployment_branch_policy.protected_branches === 'boolean'
    && typeof value.deployment_branch_policy.custom_branch_policies === 'boolean',
  `GitHub environment deployment branch policy is invalid:${environmentName}`)
  invariant(Array.isArray(value.protection_rules), `GitHub environment protection_rules are missing:${environmentName}`)

  const byType = new Map()
  for (const [index, rule] of value.protection_rules.entries()) {
    const label = `GitHub environment protection_rules[${index}]`
    invariant(rule && typeof rule === 'object' && !Array.isArray(rule), `${label} must be an object`)
    invariant(['wait_timer', 'required_reviewers', 'branch_policy'].includes(rule.type), `${label} has unexpected type:${String(rule.type)}`)
    invariant(!byType.has(rule.type), `GitHub environment protection rule is duplicated:${rule.type}`)
    byType.set(rule.type, rule)
  }

  const branchPolicyRule = byType.get('branch_policy')
  if (branchPolicyRule) {
    relevantKeys(branchPolicyRule, {
      required: ['type'],
      allowed: ['id', 'node_id', 'type'],
    }, 'GitHub environment branch_policy rule')
    validateProtectionRuleMetadata(branchPolicyRule, 'GitHub environment branch_policy rule')
  }

  const waitRule = byType.get('wait_timer')
  let waitTimer = 0
  if (waitRule) {
    relevantKeys(waitRule, {
      required: ['type', 'wait_timer'],
      allowed: ['id', 'node_id', 'type', 'wait_timer'],
    }, 'GitHub environment wait_timer rule')
    validateProtectionRuleMetadata(waitRule, 'GitHub environment wait_timer rule')
    invariant(Number.isSafeInteger(waitRule.wait_timer) && waitRule.wait_timer >= 0 && waitRule.wait_timer <= 43_200, 'GitHub environment wait_timer is invalid')
    waitTimer = waitRule.wait_timer
  }

  const reviewersRule = byType.get('required_reviewers')
  let preventSelfReview = false
  let reviewers = []
  if (reviewersRule) {
    relevantKeys(reviewersRule, {
      required: ['type', 'reviewers', 'prevent_self_review'],
      allowed: ['id', 'node_id', 'type', 'reviewers', 'prevent_self_review'],
    }, 'GitHub environment required_reviewers rule')
    validateProtectionRuleMetadata(reviewersRule, 'GitHub environment required_reviewers rule')
    invariant(typeof reviewersRule.prevent_self_review === 'boolean', 'GitHub environment prevent_self_review is invalid')
    preventSelfReview = reviewersRule.prevent_self_review
    reviewers = normalizedReviewerSet(reviewersRule.reviewers, `GitHub environment reviewers:${environmentName}`, { observed: true })
  }

  return {
    name: value.name,
    deploymentBranchPolicy: {
      protectedBranches: value.deployment_branch_policy.protected_branches,
      customBranchPolicies: value.deployment_branch_policy.custom_branch_policies,
    },
    waitTimer,
    preventSelfReview,
    reviewers,
  }
}

function environmentPolicyFailures(expected, observed) {
  const failures = []
  if (expected.name !== observed.name) failures.push(`GitHub environment name differs from exact desired profile:${expected.name}`)
  if (JSON.stringify(expected.deploymentBranchPolicy) !== JSON.stringify(observed.deploymentBranchPolicy)) {
    failures.push(`GitHub environment deployment branch policy differs from exact desired profile:${expected.name}`)
  }
  if (expected.waitTimer !== observed.waitTimer) failures.push(`GitHub environment wait_timer differs from exact desired profile:${expected.name}`)
  if (expected.preventSelfReview !== observed.preventSelfReview) failures.push(`GitHub environment prevent_self_review differs from exact desired profile:${expected.name}`)
  if (JSON.stringify(expected.reviewers) !== JSON.stringify(observed.reviewers)) {
    failures.push(`GitHub environment reviewer set differs from exact desired profile:${expected.name}`)
  }
  return failures
}

export function resolveManagedRepositoryPolicy({ inventory, desired, repository }) {
  invariant(REPOSITORY.test(repository || ''), `repository identity is invalid:${repository ?? '<missing>'}`)
  invariant(Array.isArray(inventory?.repositories), 'managed repository inventory is missing')
  const matches = inventory.repositories.filter(candidate => candidate?.github === repository)
  invariant(matches.length === 1, matches.length === 0
    ? `repository is outside managed inventory:${repository}`
    : `managed repository inventory is ambiguous:${repository}`)
  const repo = matches[0]
  invariant(typeof repo.desiredProfile === 'string' && repo.desiredProfile.length > 0, `managed repository desired profile is missing:${repository}`)
  invariant(typeof repo.defaultBranch === 'string' && repo.defaultBranch.length > 0, `managed repository default branch is missing:${repository}`)
  invariant(desired?.profiles && typeof desired.profiles === 'object' && !Array.isArray(desired.profiles), 'desired profile registry is missing')
  invariant(Object.prototype.hasOwnProperty.call(desired.profiles, repo.desiredProfile), `desired profile is missing:${repo.desiredProfile}`)
  const profile = desired.profiles[repo.desiredProfile]
  invariant(profile && typeof profile === 'object' && !Array.isArray(profile), `desired profile is malformed:${repo.desiredProfile}`)
  normalizeActionsWorkflowPermissions(profile.actionsWorkflowPermissions, `desired profile ${repo.desiredProfile} Actions workflow permissions`, { requireRead: true })
  invariant(typeof desired.managedRulesetPrefix === 'string' && desired.managedRulesetPrefix.length > 0, 'desired managed ruleset prefix is missing')
  return { repo, profile, profileName: repo.desiredProfile }
}

function resolveIntegrations(desired, api) {
  invariant(desired?.integrations && typeof desired.integrations === 'object' && !Array.isArray(desired.integrations), 'desired integration registry is missing')
  const resolved = structuredClone(desired.integrations)
  const slugs = new Set()
  const ids = new Set()
  const failures = []
  for (const [name, integration] of Object.entries(resolved)) {
    invariant(integration && typeof integration === 'object' && !Array.isArray(integration), `desired integration is malformed:${name}`)
    invariant(typeof integration.slug === 'string' && /^[A-Za-z0-9_.-]+$/.test(integration.slug), `desired integration slug is invalid:${name}`)
    invariant(!slugs.has(integration.slug), `desired integration slug is ambiguous:${integration.slug}`)
    slugs.add(integration.slug)
    invariant(integration.id === null || (Number.isSafeInteger(integration.id) && integration.id > 0), `desired integration id is invalid:${name}`)
    // Live App-identity attestation is unconditional: a pinned desired id must
    // still match the live slug↔id registry binding, or App substitution behind
    // an unchanged slug would pass unobserved.
    const app = api(`/apps/${encodeURIComponent(integration.slug)}`)
    invariant(Number.isSafeInteger(app?.id) && app.id > 0 && app.slug === integration.slug, `GitHub App identity is unresolved:${integration.slug}`)
    if (integration.id === null) {
      integration.id = app.id
    } else if (app.id !== integration.id) {
      failures.push(`live GitHub App identity differs from exact desired policy:${integration.slug}(live:${app.id} desired:${integration.id})`)
    }
    invariant(!ids.has(integration.id), `desired integration id is ambiguous:${integration.id}`)
    ids.add(integration.id)
  }
  return { integrations: resolved, failures }
}

export function observeBranchProtectionPolicy({
  repository = null,
  environment = null,
  inventory = readJson('infra/governance/inventory/managed-repos.json'),
  desired = readJson('infra/governance/desired/github.json'),
  ghJson = ghJsonCommand,
} = {}) {
  invariant(repository === null || REPOSITORY.test(repository), 'explicit repository identity is invalid')
  invariant(environment === null || ENVIRONMENT.test(environment), 'explicit environment identity is invalid')
  invariant(environment === null || repository !== null, 'environment verification requires an explicit repository')
  invariant(typeof ghJson === 'function', 'GitHub readback transport is missing')
  const selectedRepository = repository
    ?? ghJson(['repo', 'view', '--json', 'nameWithOwner'], 'gh repo view')?.nameWithOwner
  const { repo, profile, profileName } = resolveManagedRepositoryPolicy({ inventory, desired, repository: selectedRepository })
  const expectedEnvironment = environment === null ? null : expectedEnvironmentPolicy(profile, environment)
  const api = path => apiWith(ghJson, path, DEFAULT_GITHUB_API_VERSION)

  const metadata = api(`/repos/${repo.github}`)
  invariant(metadata?.full_name === repo.github, `GitHub repository identity mismatch:${metadata?.full_name ?? '<missing>'}`)
  invariant(metadata?.default_branch === repo.defaultBranch, `GitHub default branch mismatch:${metadata?.default_branch ?? '<missing>'}`)

  const expectedPermissions = normalizeActionsWorkflowPermissions(
    profile.actionsWorkflowPermissions,
    `desired profile ${profileName} Actions workflow permissions`,
    { requireRead: true },
  )
  const observedPermissions = normalizeActionsWorkflowPermissions(
    api(`/repos/${repo.github}/actions/permissions/workflow`),
    `GitHub Actions workflow permissions for ${repo.github}`,
  )

  const { integrations: resolvedIntegrations, failures: integrationFailures } = resolveIntegrations(desired, api)
  const expectedRulesets = materializeExpectedBranchRulesets(profile, resolvedIntegrations)
  const observedRulesets = readAllRulesets(repo.github, api)
  const verdict = evaluateBranchProtectionPolicy({
    expectedRulesets,
    observedRulesets,
    managedPrefix: desired.managedRulesetPrefix,
  })
  const failures = [...integrationFailures, ...verdict.failures]
  if (JSON.stringify(observedPermissions) !== JSON.stringify(expectedPermissions)) {
    failures.push(`GitHub Actions workflow permissions differ from exact desired profile:${profileName}`)
  }
  if (expectedEnvironment) {
    const observedEnvironment = observedEnvironmentPolicy(
      api(`/repos/${repo.github}/environments/${encodeURIComponent(expectedEnvironment.name)}`),
      expectedEnvironment.name,
    )
    failures.push(...environmentPolicyFailures(expectedEnvironment, observedEnvironment))
  }
  return {
    ok: failures.length === 0,
    repository: repo.github,
    defaultBranch: repo.defaultBranch,
    profileName,
    environmentName: expectedEnvironment?.name ?? null,
    failures,
  }
}

function printUnverified(message, check) {
  console.error(`⚠️ branch-protection UNVERIFIED: ${message}`)
  console.error('   Exact managed rulesets, required-check contexts/App IDs, Actions permissions, no-bypass policy, and force-push protection were not certified.')
  return check ? 1 : 0
}

export function runBranchProtectionCli(argv = process.argv.slice(2)) {
  let parsed
  try {
    parsed = parseBranchProtectionArgs(argv)
  } catch (error) {
    console.error('usage: node scripts/check-branch-protection.mjs [--check --repository OWNER/REPO [--environment NAME]]')
    console.error(`❌ ${error.message}`)
    return 2
  }
  try {
    const verdict = observeBranchProtectionPolicy({
      repository: parsed.repository,
      environment: parsed.environment,
    })
    if (!verdict.ok) {
      console.error(`❌ branch-protection UNPROTECTED/DRIFTED(${verdict.repository} ${verdict.defaultBranch})`)
      verdict.failures.forEach(failure => console.error(`   - ${failure}`))
      return parsed.check ? 1 : 0
    }
    const environmentSummary = verdict.environmentName ? ` + exact environment ${verdict.environmentName}` : ''
    console.log(`✅ branch-protection PROTECTED(${verdict.repository} ${verdict.defaultBranch}): exact managed rulesets + exact required checks/App IDs + exact Actions permissions + no bypass + non-fast-forward protection${environmentSummary}`)
    return 0
  } catch (error) {
    return printUnverified(error.message, parsed.check)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runBranchProtectionCli()
}

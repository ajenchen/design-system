#!/usr/bin/env node

import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import {
  GOVERNANCE_ROOT,
  captureClosedGitHubToken,
  compareUtf8Bytes,
  deepEqual,
  invariant,
  parseFlags,
  readJson,
  sha256,
  stableStringify,
  validateInventory,
} from '../lib/common.mjs'
import { validateAttestationPolicy } from '../lib/attestation.mjs'
import {
  createPartialInventoryFixtureValidator,
  validateGovernanceModel,
} from '../lib/model-validation.mjs'
import { validateRequiredCheckProducer } from '../lib/check-run-trust.mjs'
import {
  resolveVerifiedCandidateRelease,
  validateVerifiedReleaseEvidence,
  verifiedReleaseEvidenceDigest as digestVerifiedReleaseEvidence,
} from '../lib/release-evidence.mjs'
import { validateWorkflowIdentity, workflowIdentity } from '../lib/workflow-trust.mjs'
import { loadIssuerRegistry, validateIssuerRegistryLineage } from '../lib/issuer-registry.mjs'
import {
  historicalControlPlaneDigest,
  normalizeHistoricalControlPlane,
  validateHistoricalControlPlane,
  verifyFleetRecoveryAuthorization,
} from '../lib/fleet-recovery-authorization.mjs'
import {
  normalizeRuntimeValidationContext,
  resolveGitHubRuntimeValidationContext,
  runtimeCertificationPaths,
} from '../lib/runtime-certification.mjs'
import { GITHUB_API_VERSION } from '../../../scripts/lib/github-mutation-boundary.mjs'

const DEFAULT_INVENTORY = resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json')
const DEFAULT_DESIRED = resolve(GOVERNANCE_ROOT, 'desired/github.json')
const DEFAULT_RINGS = resolve(GOVERNANCE_ROOT, 'release-rings.json')
const DEFAULT_CERTIFICATIONS = resolve(GOVERNANCE_ROOT, 'providers/certifications.json')
const DEFAULT_WAIVERS = resolve(GOVERNANCE_ROOT, 'waivers.json')
const DEFAULT_PRIVILEGED_POLICY = resolve(GOVERNANCE_ROOT, 'privileged-trust-roots.json')
const DEFAULT_RUNTIME_PROFILE = resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json')
const FLEET_RECONCILE_LOCAL_DURABILITY_CLASS = 'local-content-addressed-fsync-v1'

const clone = value => JSON.parse(JSON.stringify(value))

const GITHUB_API_ORIGIN = 'https://api.github.com'
const GITHUB_API_METHODS = new Set(['DELETE', 'GET', 'PATCH', 'POST', 'PUT'])
const GITHUB_FETCH_CHILD = String.raw`
const [method, path, maxBytesText] = process.argv.slice(1)
const maxBytes = Number(maxBytesText)
const token = process.env.GITHUB_TOKEN
if (!token || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) process.exit(64)
const response = await fetch('https://api.github.com' + path, {
  method,
  redirect: 'error',
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    'User-Agent': 'qijenchen-governance-reconciler',
    'X-GitHub-Api-Version': '${GITHUB_API_VERSION}',
  },
  body: method === 'GET' || method === 'DELETE'
    ? undefined
    : await new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        process.stdin.on('data', chunk => {
          size += chunk.length
          if (size > 16 * 1024 * 1024) reject(new Error('request body exceeds closed limit'))
          else chunks.push(chunk)
        })
        process.stdin.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined))
        process.stdin.on('error', reject)
      }),
  signal: AbortSignal.timeout(55_000),
})
const chunks = []
let size = 0
if (response.body) {
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > maxBytes) throw new Error('response body exceeds closed limit')
    chunks.push(chunk)
  }
}
process.stdout.write(JSON.stringify({
  status: response.status,
  body: Buffer.concat(chunks).toString('base64'),
}))
`

export function githubApiRequestDescriptor(method, path) {
  invariant(GITHUB_API_METHODS.has(method), `GitHub API method is unsupported: ${method}`)
  const rawPathname = typeof path === 'string' ? path.split('?', 1)[0] : ''
  const repositoryBoundary = rawPathname.match(/^\/repos\/([^/]+)\/([^/]+)(?:\/|$)/)
  const parsed = typeof path === 'string' ? new URL(path, GITHUB_API_ORIGIN) : null
  invariant(
    typeof path === 'string'
      && path.startsWith('/repos/')
      && !/[\0\r\n\\]/.test(path)
      && !path.includes('://')
      && !path.includes('#')
      && repositoryBoundary
      && /^[A-Za-z0-9_.-]+$/.test(repositoryBoundary[1])
      && /^[A-Za-z0-9_.-]+$/.test(repositoryBoundary[2])
      && !['.', '..'].includes(repositoryBoundary[1])
      && !['.', '..'].includes(repositoryBoundary[2])
      && parsed.origin === GITHUB_API_ORIGIN
      && parsed.pathname === rawPathname
      && parsed.href === `${GITHUB_API_ORIGIN}${path}`,
    `GitHub API path is outside the closed repository boundary: ${path}`,
  )
  return Object.freeze({
    method,
    path,
    url: `${GITHUB_API_ORIGIN}${path}`,
    headers: Object.freeze({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    }),
  })
}

export class GhApiClient {
  constructor({
    environment = process.env,
    token,
    tokenEnvironmentName = 'GH_TOKEN',
  } = {}) {
    this.token = captureClosedGitHubToken({
      token,
      environment,
      requireToken: false,
      tokenEnvironmentName,
    })
  }

  execute(method, path, {
    input,
    maxOutputBytes = 20 * 1024 * 1024,
    timeoutMs = 60_000,
  } = {}) {
    invariant(this.token !== null, 'GitHub API transport requires one captured GH_TOKEN authority')
    const descriptor = githubApiRequestDescriptor(method, path)
    invariant(
      input === undefined || typeof input === 'string' || Buffer.isBuffer(input),
      'GitHub API request body must be a string or Buffer',
    )
    invariant(
      input === undefined || Buffer.byteLength(input) <= 16 * 1024 * 1024,
      'GitHub API request body exceeds the closed size limit',
    )
    invariant(
      Number.isInteger(maxOutputBytes) && maxOutputBytes > 0 && maxOutputBytes <= 128 * 1024 * 1024,
      'GitHub API response limit is outside the safe range',
    )
    invariant(
      Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 120_000,
      'GitHub API timeout is outside the safe range',
    )
    const result = spawnSync(process.execPath, [
      '--input-type=module',
      '--eval',
      GITHUB_FETCH_CHILD,
      descriptor.method,
      descriptor.path,
      String(maxOutputBytes),
    ], {
      cwd: resolve(GOVERNANCE_ROOT, '../..'),
      encoding: 'utf8',
      env: {
        GITHUB_TOKEN: this.token,
        HOME: '/dev/null',
        LANG: 'C',
        LC_ALL: 'C',
        NO_COLOR: '1',
      },
      input,
      maxBuffer: Math.ceil(maxOutputBytes * 4 / 3) + 64 * 1024,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
      windowsHide: true,
    })
    if (result.error) throw new Error(`GitHub API transport failed for ${method} ${path}: ${result.error.message}`)
    if (result.signal !== null || result.status !== 0) {
      const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim().slice(0, 4000)
      throw new Error(`GitHub API transport failed for ${method} ${path}: ${detail}`)
    }
    try {
      const envelope = JSON.parse(result.stdout)
      invariant(
        Number.isInteger(envelope?.status)
          && envelope.status >= 100
          && envelope.status <= 599
          && typeof envelope.body === 'string',
        'GitHub API transport returned an invalid response envelope',
      )
      return {
        status: envelope.status,
        body: Buffer.from(envelope.body, 'base64'),
      }
    } catch (error) {
      throw new Error(`GitHub API transport returned invalid JSON for ${method} ${path}: ${error.message}`)
    }
  }

  request(method, path, body, options = {}) {
    const result = this.execute(method, path, {
      input: body === undefined ? undefined : JSON.stringify(body),
    })
    if (result.status < 200 || result.status >= 300) {
      const detail = result.body.toString('utf8').trim().slice(0, 4000)
      if (options.allow404 && result.status === 404) return null
      throw new Error(`GitHub API failed closed for ${method} ${path} (HTTP ${result.status}): ${detail}`)
    }
    const output = result.body.toString('utf8').trim()
    if (!output) return null
    try {
      return JSON.parse(output)
    } catch (error) {
      throw new Error(`GitHub API returned invalid JSON for ${method} ${path}: ${error.message}`)
    }
  }

  requestBytes(method, path, { maxOutputBytes = 20 * 1024 * 1024 } = {}) {
    const result = this.execute(method, path, {
      maxOutputBytes,
    })
    if (result.status < 200 || result.status >= 300) {
      const detail = result.body.toString('utf8').trim().slice(0, 1000)
      throw new Error(`GitHub binary API failed closed for ${method} ${path} (HTTP ${result.status}): ${detail}`)
    }
    return Buffer.from(result.body)
  }
}

export class FixtureApiClient {
  constructor(directory) {
    this.routes = readJson(resolve(directory, 'routes.json'))
    this.calls = []
  }

  request(method, path, body, options = {}) {
    this.calls.push({ method, path, body: body === undefined ? undefined : clone(body) })
    const route = this.routes[`${method} ${path}`]
    if (!route && options.allow404) return null
    if (!route) throw new Error(`Fixture API has no route for ${method} ${path}`)
    if (route.error) throw new Error(`Fixture API error for ${method} ${path}: ${route.error}`)
    return clone(route.response ?? null)
  }
}

function assertTrustedLiveGitHubClient(client, label) {
  invariant(
    client instanceof GhApiClient && Object.getPrototypeOf(client) === GhApiClient.prototype,
    `${label} requires the canonical live GitHub client`,
  )
  return client
}

function resolveRuntimeValidationContextCore({ client, inventory, certifications = { certifications: [] }, runtimeProfile, repoRoot = runtimeCertificationPaths.repoRoot, runtimeValidationContext = {} }, productionLive) {
  return resolveGitHubRuntimeValidationContext({
    client,
    inventory,
    certifications,
    runtimeProfile,
    repoRoot,
    runtimeValidationContext,
    live: productionLive,
  })
}

function assertLiveIdentitySnapshot(productionLive, repositories, observations, runtimeValidationContext) {
  if (!productionLive) return true
  invariant(repositories.length === observations.length, 'Live GitHub identity readback coverage is incomplete')
  for (let index = 0; index < repositories.length; index += 1) {
    const repository = repositories[index]
    const observation = observations[index]
    const identity = runtimeValidationContext.externalRepositoryIdentities?.[repository.id]
    invariant(identity
      && observation.defaultBranchHeadSha === identity.gitCommit
      && observation.defaultBranchTreeSha === identity.gitTree,
    `Live GitHub default-branch commit/tree changed during reconciliation preflight for ${repository.id}`)
  }
  return true
}

export class CommandOffHostMirror {
  constructor(commandPath, { credential = null } = {}) {
    invariant(
      typeof commandPath === 'string'
        && commandPath.length > 0
        && resolve(commandPath) === commandPath,
      'Off-host mirror command path must be one absolute normalized path',
    )
    invariant(
      credential === null
        || (
          typeof credential === 'string'
          && credential.length >= 8
          && credential.length <= 4096
          && !/[\0\r\n]/.test(credential)
        ),
      'Off-host mirror credential is malformed',
    )
    const sourceInfoBefore = lstatSync(commandPath, { bigint: true })
    invariant(
      sourceInfoBefore.isFile()
        && !sourceInfoBefore.isSymbolicLink()
        && sourceInfoBefore.nlink === 1n
        && (sourceInfoBefore.mode & 0o111n) !== 0n
        && (sourceInfoBefore.mode & 0o022n) === 0n
        && realpathSync(commandPath) === commandPath,
      'Off-host mirror command must be one canonical non-writable executable file',
    )
    const bytes = readFileSync(commandPath)
    const sourceInfoAfter = lstatSync(commandPath, { bigint: true })
    invariant(
      ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
        .every(key => sourceInfoBefore[key] === sourceInfoAfter[key]),
      'Off-host mirror command changed while it was authenticated',
    )
    const privateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'qijenchen-off-host-mirror-')))
    chmodSync(privateRoot, 0o700)
    const privateCommand = join(privateRoot, 'mirror-adapter')
    let descriptor
    try {
      descriptor = openSync(privateCommand, 'wx', 0o500)
      writeFileSync(descriptor, bytes)
      fsyncSync(descriptor)
      closeSync(descriptor)
      descriptor = undefined
    } finally {
      if (descriptor !== undefined) closeSync(descriptor)
    }
    const privateInfo = lstatSync(privateCommand, { bigint: true })
    invariant(
      privateInfo.isFile()
        && !privateInfo.isSymbolicLink()
        && privateInfo.nlink === 1n
        && (privateInfo.mode & 0o777n) === 0o500n
        && sha256(readFileSync(privateCommand)) === sha256(bytes),
      'Off-host mirror private command materialization failed',
    )
    process.once('exit', () => {
      try { rmSync(privateRoot, { recursive: true, force: true }) } catch {}
    })
    this.commandPath = commandPath
    this.commandInfo = sourceInfoAfter
    this.privateCommand = privateCommand
    this.privateCommandInfo = privateInfo
    this.privateRoot = privateRoot
    this.credential = credential
    this.adapterCommandSha256 = sha256(bytes)
  }

  invoke(envelope, operation) {
    invariant(this.credential !== null, `Off-host mirror ${operation} requires one explicitly captured credential`)
    const currentSource = lstatSync(this.commandPath, { bigint: true })
    const currentPrivate = lstatSync(this.privateCommand, { bigint: true })
    invariant(
      ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
        .every(key => currentSource[key] === this.commandInfo[key]),
      `Off-host mirror ${operation} source command changed after authentication`,
    )
    invariant(
      ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
        .every(key => currentPrivate[key] === this.privateCommandInfo[key])
        && sha256(readFileSync(this.privateCommand)) === this.adapterCommandSha256,
      `Off-host mirror ${operation} private command changed after authentication`,
    )
    const result = spawnSync(this.privateCommand, [], {
      cwd: this.privateRoot,
      encoding: 'utf8',
      env: {
        GOVERNANCE_OFF_HOST_MIRROR_TOKEN: this.credential,
        HOME: this.privateRoot,
        LANG: 'C',
        LC_ALL: 'C',
        NO_COLOR: '1',
        PATH: '/usr/bin:/bin',
        XDG_CONFIG_HOME: this.privateRoot,
      },
      input: `${stableStringify(envelope)}\n`,
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30_000,
    })
    if (result.error || result.status !== 0) throw new Error(`Off-host mirror ${operation} failed: ${result.error?.message ?? (result.stderr || result.stdout || `exit ${result.status}`).trim()}`)
    try {
      return JSON.parse(result.stdout)
    } catch (error) {
      throw new Error(`Off-host mirror ${operation} returned invalid JSON: ${error.message}`)
    }
  }

  append(eventEnvelope) {
    return this.invoke(eventEnvelope, 'append acknowledgement')
  }

  verify(headEnvelope) {
    return this.invoke(headEnvelope, 'live head verification')
  }
}

const validatePartialInventoryFixtureGovernanceModel = createPartialInventoryFixtureValidator()

function validateModelCore(inventory, desired, rings, certifications, waivers, now, issuerRegistry, runtimeProfile, runtimeValidationContext, productionLive) {
  const context = normalizeRuntimeValidationContext(runtimeValidationContext, { inventory })
  const validator = productionLive
    ? validateGovernanceModel
    : validatePartialInventoryFixtureGovernanceModel
  return validator({
    inventory,
    desired,
    rings,
    certifications,
    waivers,
    now,
    issuerRegistry,
    runtimeProfile,
    repoRoot: context.repoRoot,
    runtimeIdentity: context.runtimeIdentity,
    externalRepositoryIdentities: context.externalRepositoryIdentities,
  })
}

export function validateModel(inventory, desired, rings, certifications, waivers, now = new Date(), issuerRegistry = loadIssuerRegistry(), runtimeProfile, runtimeValidationContext = {}) {
  return validateModelCore(inventory, desired, rings, certifications, waivers, now, issuerRegistry, runtimeProfile, runtimeValidationContext, true)
}

export function materializeProfile(repo, desired, rings, eligibility) {
  const profile = desired.profiles[repo.desiredProfile]
  const active = eligibility.eligible || eligibility.promoted
  const requiredStatusChecks = profile.requiredChecks.map(check => ({
    context: check.context,
    integration_id: desired.integrations[check.integration].id,
  }))
  const rulesets = profile.rulesets.map(source => {
    const ruleset = clone(source)
    delete ruleset.rollout
    if (source.rollout === 'on-promotion' && !active) ruleset.enforcement = 'disabled'
    ruleset.rules = ruleset.rules.map(rule => {
      if (rule.type !== 'required_status_checks' || !rule.parameters?.fromProfile) return rule
      const parameters = clone(rule.parameters)
      delete parameters.fromProfile
      parameters.required_status_checks = requiredStatusChecks
      return { ...rule, parameters }
    })
    return ruleset
  })
  const environments = profile.environments
    .filter(environment => environment.rollout === 'always' || active)
    .map(environment => ({
      name: environment.name,
      wait_timer: environment.waitTimer,
      prevent_self_review: environment.preventSelfReview,
      reviewers: clone(environment.reviewers),
      deployment_branch_policy: {
        protected_branches: environment.deploymentBranchPolicy.protectedBranches,
        custom_branch_policies: environment.deploymentBranchPolicy.customBranchPolicies,
      },
    }))
  return {
    profile,
    actionsWorkflowPermissions: clone(profile.actionsWorkflowPermissions),
    rulesets,
    environments,
    declaredEnvironments: profile.environments,
    requiredChecks: profile.requiredChecks,
    immutableReleases: profile.immutableReleases,
    tagPolicy: profile.tagPolicy,
    assignment: rings.assignments[repo.id],
    eligibility,
  }
}

function sortRules(rules) {
  return clone(rules ?? []).map(rule => {
    if (rule.type === 'required_status_checks' && Array.isArray(rule.parameters?.required_status_checks)) {
      rule.parameters.required_status_checks.sort((a, b) => compareUtf8Bytes(a.context, b.context))
    }
    if (rule.type === 'pull_request' && rule.parameters) {
      if (Object.hasOwn(rule.parameters, 'required_reviewers')) {
        invariant(Array.isArray(rule.parameters.required_reviewers)
          && rule.parameters.required_reviewers.length === 0,
        'GitHub pull-request ruleset synthesized non-empty required reviewers')
        delete rule.parameters.required_reviewers
      }
      if (Object.hasOwn(rule.parameters, 'allowed_merge_methods')) {
        const methods = rule.parameters.allowed_merge_methods
        invariant(Array.isArray(methods)
          && new Set(methods).size === methods.length
          && deepEqual([...methods].sort(compareUtf8Bytes), ['merge', 'rebase', 'squash']),
        'GitHub pull-request ruleset synthesized an unexpected merge-method closure')
        delete rule.parameters.allowed_merge_methods
      }
    }
    return rule
  }).sort((a, b) => compareUtf8Bytes(`${a.type}:${stableStringify(a, 0)}`, `${b.type}:${stableStringify(b, 0)}`))
}

function normalizeRuleset(ruleset) {
  return {
    name: ruleset.name,
    target: ruleset.target,
    enforcement: ruleset.enforcement,
    conditions: clone(ruleset.conditions ?? {}),
    bypass_actors: clone(ruleset.bypass_actors ?? []).sort((a, b) => compareUtf8Bytes(stableStringify(a, 0), stableStringify(b, 0))),
    rules: sortRules(ruleset.rules),
  }
}

function normalizeEnvironment(environment) {
  const rules = environment.protection_rules ?? []
  const wait = rules.find(rule => rule.type === 'wait_timer')
  const reviewers = rules.find(rule => rule.type === 'required_reviewers')
  const reviewerValues = environment.reviewers ?? reviewers?.reviewers ?? []
  invariant(Array.isArray(reviewerValues), `GitHub environment ${environment.name} reviewers are invalid`)
  const normalizedReviewers = reviewerValues.map((reviewer, index) => {
    invariant(reviewer && typeof reviewer === 'object' && !Array.isArray(reviewer), `GitHub environment ${environment.name} reviewer ${index} is invalid`)
    const observedIdentity = reviewer.reviewer
    const reviewerKeys = Object.keys(reviewer).sort(compareUtf8Bytes)
    const expectedReviewerKeys = (observedIdentity === undefined ? ['id', 'type'] : ['reviewer', 'type']).sort(compareUtf8Bytes)
    invariant(
      reviewerKeys.length === expectedReviewerKeys.length
        && reviewerKeys.every((key, keyIndex) => key === expectedReviewerKeys[keyIndex]),
      `GitHub environment ${environment.name} reviewer ${index} has an invalid or open shape`,
    )
    const id = observedIdentity === undefined ? reviewer.id : observedIdentity?.id
    invariant(
      ['User', 'Team'].includes(reviewer.type)
        && Number.isSafeInteger(id)
        && id > 0,
      `GitHub environment ${environment.name} reviewer ${index} identity is invalid`,
    )
    return { type: reviewer.type, id }
  }).sort((left, right) => compareUtf8Bytes(left.type, right.type) || left.id - right.id)
  invariant(
    new Set(normalizedReviewers.map(reviewer => `${reviewer.type}:${reviewer.id}`)).size === normalizedReviewers.length,
    `GitHub environment ${environment.name} reviewers are duplicated`,
  )
  return {
    name: environment.name,
    wait_timer: environment.wait_timer ?? wait?.wait_timer ?? 0,
    prevent_self_review: environment.prevent_self_review ?? reviewers?.prevent_self_review ?? false,
    reviewers: normalizedReviewers,
    deployment_branch_policy: clone(environment.deployment_branch_policy ?? null),
  }
}

function normalizeActionsWorkflowPermissions(settings) {
  invariant(settings && typeof settings === 'object' && !Array.isArray(settings), 'GitHub Actions workflow-permissions response is invalid')
  invariant(
    Object.keys(settings).sort(compareUtf8Bytes).join(',') === 'can_approve_pull_request_reviews,default_workflow_permissions',
    'GitHub Actions workflow-permissions response has an invalid or open shape',
  )
  invariant(settings.default_workflow_permissions === 'read' || settings.default_workflow_permissions === 'write', 'GitHub Actions default workflow permission is invalid')
  invariant(typeof settings.can_approve_pull_request_reviews === 'boolean', 'GitHub Actions pull-request workflow permission is invalid')
  return {
    default_workflow_permissions: settings.default_workflow_permissions,
    can_approve_pull_request_reviews: settings.can_approve_pull_request_reviews,
  }
}

function decodeContent(response) {
  if (typeof response?.text === 'string') return response.text
  if (!response?.content || response.encoding !== 'base64') return null
  return Buffer.from(response.content.replace(/\n/g, ''), 'base64').toString('utf8')
}

function immutableEnabled(response) {
  return response?.enabled === true || response?.immutable_releases_enabled === true
}

function workflowRunIdFromDetailsUrl(detailsUrl, repo) {
  if (typeof detailsUrl !== 'string') return null
  let url
  try { url = new URL(detailsUrl) } catch { return null }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null
  const escaped = repo.github.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = url.pathname.match(new RegExp(`^/${escaped}/actions/runs/([1-9][0-9]*)(?:/job/[1-9][0-9]*)?/?$`))
  return match?.[1] ?? null
}

const GITHUB_OWNED_DEPENDABOT_WORKFLOW = /^dynamic\/dependabot\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?(?:\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)*$/
const REPOSITORY_WORKFLOW = /^\.github\/workflows\/[^/\r\n]+\.ya?ml(?:@[^\r\n]+)?$/

function classifyWorkflowRun(response, slug, runId) {
  const path = response?.path
  const dynamicEvent = response?.event === 'dynamic'
  const dynamicPath = typeof path === 'string' && path.startsWith('dynamic/')
  if (dynamicEvent || dynamicPath) {
    invariant(
      dynamicEvent && GITHUB_OWNED_DEPENDABOT_WORKFLOW.test(path),
      `GitHub workflow-run dynamic identity is invalid for ${slug}/${runId}`,
    )
    return 'github-owned-dependabot'
  }
  invariant(typeof path === 'string' && REPOSITORY_WORKFLOW.test(path), `GitHub workflow-run path is invalid for ${slug}/${runId}`)
  return 'repository-workflow'
}

function fetchCompleteCollection(client, path, {
  select,
  label,
  totalCount = value => value?.total_count,
  identity = item => (item?.id === undefined ? `name:${item?.name}` : `id:${item.id}`),
}) {
  const collected = []
  const identities = new Set()
  let expectedTotal = null
  for (let page = 1; page <= 10_000; page += 1) {
    const response = client.request('GET', page === 1 ? path : `${path}&page=${page}`)
    const items = select(response)
    invariant(Array.isArray(items), `${label} response page ${page} is invalid`)
    const declaredTotal = totalCount(response)
    if (Number.isInteger(declaredTotal)) {
      if (expectedTotal === null) expectedTotal = declaredTotal
      else invariant(declaredTotal === expectedTotal, `${label} total_count changed during pagination`)
    }
    for (const item of items) {
      const itemIdentity = identity(item)
      invariant(typeof itemIdentity === 'string' && itemIdentity.length > 0
        && itemIdentity !== 'name:undefined' && !identities.has(itemIdentity),
      `${label} pagination returned a missing or duplicate identity ${itemIdentity}`)
      identities.add(itemIdentity)
      collected.push(item)
    }
    if (items.length < 100) {
      invariant(expectedTotal === null || collected.length === expectedTotal, `${label} pagination count ${collected.length} differs from declared total ${expectedTotal}`)
      return collected
    }
  }
  throw new Error(`${label} pagination exceeded the fail-closed page limit`)
}

export function fetchRepositoryState(client, repo, materialized, desired) {
  const slug = repo.github
  const metadata = client.request('GET', `/repos/${slug}`)
  const defaultBranchCommit = client.request('GET', `/repos/${slug}/commits/${encodeURIComponent(repo.defaultBranch)}`)
  invariant(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(defaultBranchCommit?.sha ?? ''), `GitHub default-branch commit response is invalid for ${slug}`)
  invariant(Number.isFinite(new Date(defaultBranchCommit?.commit?.committer?.date).getTime()), `GitHub default-branch commit timestamp is invalid for ${slug}`)
  const actionsWorkflowPermissions = normalizeActionsWorkflowPermissions(
    client.request('GET', `/repos/${slug}/actions/permissions/workflow`),
  )
  const summaries = fetchCompleteCollection(client, `/repos/${slug}/rulesets?per_page=100`, {
    select: value => value,
    totalCount: () => null,
    label: `GitHub rulesets for ${slug}`,
  })
  const environments = fetchCompleteCollection(client, `/repos/${slug}/environments?per_page=100`, {
    select: value => value?.environments,
    label: `GitHub environments for ${slug}`,
  })
  const checkRuns = fetchCompleteCollection(client, `/repos/${slug}/commits/${defaultBranchCommit.sha}/check-runs?per_page=100`, {
    select: value => value?.check_runs,
    label: `GitHub check-runs for ${slug}`,
  })
  const resolvedCheckRuns = clone(checkRuns)
  const githubActions = desired.integrations.githubActions
  const workflowRuns = new Map()
  for (const run of resolvedCheckRuns) {
    const matchesGitHubActionsId = run.app?.id === githubActions?.id
    const matchesGitHubActionsSlug = run.app?.slug === githubActions?.slug
    invariant(matchesGitHubActionsId === matchesGitHubActionsSlug, `GitHub Actions check-run App identity mismatch for ${slug}/${run.id}`)
    const runId = workflowRunIdFromDetailsUrl(run.details_url, repo)
    if (!matchesGitHubActionsId) {
      if (runId) {
        const nonActionsIntegrations = Object.entries(desired.integrations).filter(([name]) => name !== 'githubActions')
        const knownNonActionsApp = nonActionsIntegrations.some(([, integration]) => (
          Number.isInteger(integration.id)
          && run.app?.id === integration.id
          && run.app?.slug === integration.slug
        ))
        invariant(knownNonActionsApp, `Untrusted check-run App claims a GitHub Actions workflow run for ${slug}/${run.id}`)
      }
      continue
    }
    if (!runId) continue
    if (!workflowRuns.has(runId)) {
      const response = client.request('GET', `/repos/${slug}/actions/runs/${runId}`)
      invariant(response && String(response.id) === runId, `GitHub workflow-run response identity mismatch for ${slug}/${runId}`)
      const classification = classifyWorkflowRun(response, slug, runId)
      workflowRuns.set(runId, classification === 'github-owned-dependabot' ? null : {
        id: response.id,
        path: response.path,
        head_sha: response.head_sha,
        event: response.event,
        status: response.status,
        conclusion: response.conclusion,
      })
    }
    const workflowRun = workflowRuns.get(runId)
    if (workflowRun) run.workflowRun = clone(workflowRun)
  }

  const rulesets = []
  for (const summary of summaries) {
    invariant(summaries.filter(item => item.name === summary.name).length <= 1, `Multiple remote rulesets named ${summary.name} in ${slug}`)
    rulesets.push(client.request('GET', `/repos/${slug}/rulesets/${summary.id}`))
  }
  const environmentDetails = []
  for (const summary of environments) {
    invariant(environments.filter(item => item.name === summary.name).length <= 1, `Multiple remote environments named ${summary.name} in ${slug}`)
    environmentDetails.push(client.request('GET', `/repos/${slug}/environments/${encodeURIComponent(summary.name)}`))
  }

  const paths = new Set([
    ...materialized.requiredChecks.map(check => check.workflow).filter(Boolean),
    ...materialized.declaredEnvironments.map(environment => environment.workflow),
    ...(materialized.tagPolicy.sourceWorkflow ? [materialized.tagPolicy.sourceWorkflow] : []),
  ])
  const workflowContents = {}
  for (const path of paths) {
    const response = client.request('GET', `/repos/${slug}/contents/${path}?ref=${encodeURIComponent(repo.defaultBranch)}`, undefined, { allow404: true })
    const content = decodeContent(response)
    workflowContents[path] = content === null ? null : {
      content,
      declaredBlobSha: response?.sha ?? null,
      identity: workflowIdentity(content, response?.sha ?? null),
    }
  }
  const immutableReleases = materialized.immutableReleases
    ? client.request('GET', `/repos/${slug}/immutable-releases`, undefined, { allow404: true })
    : null
  return {
    metadata,
    defaultBranchHeadSha: defaultBranchCommit.sha,
    defaultBranchTreeSha: defaultBranchCommit?.commit?.tree?.sha ?? null,
    defaultBranchCommittedAt: defaultBranchCommit.commit.committer.date,
    rulesetSummaries: summaries,
    rulesets,
    environmentSummaries: environments,
    environments: environmentDetails,
    checkRuns: resolvedCheckRuns,
    workflowContents,
    actionsWorkflowPermissions,
    immutableReleases,
  }
}

function workflowPreflight(check, workflow) {
  const failures = []
  if (!workflow) return [`required workflow missing from protected base: ${check.workflow}`]
  const { identity } = workflow
  failures.push(...validateWorkflowIdentity(check.workflowIdentity, identity).map(failure => `${check.context}: ${failure}`))
  const triggers = identity.semantics.on
  for (const event of check.requiredEvents) {
    if (!(event in triggers)) failures.push(`${check.context} workflow lacks ${event} trigger`)
    if (check.requireUnconditionalPullRequest) {
      const trigger = triggers[event]
      if (trigger && typeof trigger === 'object' && ('paths' in trigger || 'paths-ignore' in trigger)) failures.push(`${check.context} PR trigger is path-filtered and can leave a required context absent`)
    }
  }
  const semanticText = stableStringify(identity.semantics, 0)
  if (check.forbidCandidateControlledSkip && /(?:\[skip-|skip-(?:visual|composition)|pull_request\.title|head_commit\.message[^\n]*skip)/i.test(semanticText)) {
    failures.push(`${check.context} workflow contains a candidate-controlled skip path`)
  }
  if (check.trustSource === 'protected-base-workflow') {
    const verify = identity.semantics.jobs['verify-candidate']
    const verdict = identity.semantics.jobs['publish-app-verdict']
    const tokenStep = verdict?.steps.find(step => /^actions\/create-github-app-token@[a-f0-9]{40}$/.test(step.uses ?? ''))
    const verifyText = stableStringify(verify ?? null, 0)
    const verdictText = stableStringify(verdict ?? null, 0)
    if (
      !verify
      || !verdict
      || verdict.if !== 'always()'
      || verdict.needs !== 'verify-candidate'
      || workflowEnvironmentName(verdict) !== 'governance-check-verdict'
      || verifyText.includes('secrets.')
      || verifyText.includes('create-github-app-token')
      || !tokenStep
      || tokenStep.with?.['app-id'] !== '${{ secrets.GOVERNANCE_CHECK_APP_ID }}'
      || tokenStep.with?.['private-key'] !== '${{ secrets.GOVERNANCE_CHECK_APP_PRIVATE_KEY }}'
      || tokenStep.with?.['permission-checks'] !== 'write'
      || verdictText.includes('GOVERNANCE_WRITER_APP')
      || verdictText.includes('permission-contents')
      || verdictText.includes('permission-pull-requests')
      || !workflow.content.includes(check.context)
      || !workflow.content.includes('github.event.pull_request.head.sha')
      || !workflow.content.includes('/check-runs')
    ) failures.push(`${check.context} lacks a protected-base credential-free verifier and environment-isolated Check App verdict chain`)
  }
  return failures
}

function workflowEnvironmentName(job) {
  if (typeof job.environment === 'string') return job.environment
  if (job.environment && typeof job.environment === 'object') return job.environment.name ?? null
  return null
}

function environmentWorkflowPreflight(environment, workflow, integrations) {
  if (!workflow) return [`environment workflow missing: ${environment.workflow}`]
  const failures = validateWorkflowIdentity(environment.workflowIdentity, workflow.identity)
    .map(failure => `environment ${environment.name}: ${failure}`)
  const environmentJobs = Object.values(workflow.identity.semantics.jobs)
    .filter(job => workflowEnvironmentName(job) === environment.name)
  if (environmentJobs.length === 0) failures.push(`environment ${environment.name} is not structurally wired in ${environment.workflow}`)
  if (environment.credentialIntegration) {
    const integration = integrations[environment.credentialIntegration]
    const prefix = integration?.secretPrefix
    const steps = environmentJobs.flatMap(job => job.steps)
    const tokenStep = steps.find(step => /^actions\/create-github-app-token@[a-f0-9]{40}$/.test(step.uses ?? ''))
    const appIdMatches = tokenStep?.with?.['app-id'] === `\${{ secrets.${prefix}_ID }}`
    const privateKeyMatches = tokenStep?.with?.['private-key'] === `\${{ secrets.${prefix}_PRIVATE_KEY }}`
    if (integration?.capability === 'check-only') {
      if (
        integration.operationMode !== 'base-trusted-isolated-workflow'
        || environment.name !== 'governance-check-verdict'
        || !prefix
        || !tokenStep
        || !appIdMatches
        || !privateKeyMatches
        || tokenStep.with?.['permission-checks'] !== 'write'
        || tokenStep.with?.['permission-contents'] === 'write'
        || tokenStep.with?.['permission-pull-requests'] === 'write'
        || stableStringify(workflow.identity.semantics, 0).includes('GOVERNANCE_WRITER_APP')
      ) failures.push(`environment ${environment.name} lacks an isolated check-only App chain in ${environment.workflow}`)
    } else if (
      integration?.capability !== 'writer'
      || integration?.operationMode !== 'github-actions-environment'
      || !prefix
      || !tokenStep
      || !appIdMatches
      || !privateKeyMatches
      || tokenStep.with?.['permission-contents'] !== 'write'
      || tokenStep.with?.['permission-pull-requests'] !== 'write'
      || tokenStep.with?.['permission-checks'] === 'write'
      || stableStringify(workflow.identity.semantics, 0).includes('GOVERNANCE_CHECK_APP')
    ) failures.push(`environment ${environment.name} lacks a distinct writer-only App chain in ${environment.workflow}`)
  }
  return failures
}

function state(value) {
  const snapshot = value === null ? { state: 'absent' } : { state: 'present', value: clone(value) }
  return { ...snapshot, digest: sha256(stableStringify(snapshot, 0)) }
}

function managedAction(action, beforeValue, compensation) {
  const beforeImage = state(beforeValue)
  const expectedValue = action.kind === 'delete-stale-ruleset' || action.kind === 'delete-stale-environment'
    ? null
    : action.kind === 'enable-immutable-releases'
      ? { enabled: true }
      : action.kind.endsWith('environment')
        ? { name: action.resource, ...action.body }
        : action.body
  return {
    ...action,
    beforeImage,
    expectedApplied: state(expectedValue),
    compensation: compensation ?? { safety: 'blocked', reason: `${action.kind} has no safe automatic compensation` },
  }
}

export function stageActionTransaction(actions) {
  invariant(Array.isArray(actions), 'Managed action transaction must be an array')
  const irreversible = actions.filter(action => action.compensation?.safety === 'blocked')
  invariant(irreversible.length <= 1, 'Managed action transaction contains multiple irreversible actions; each requires its own signed plan')
  if (irreversible.length === 0 || actions.length === 1) return { actions, deferredActions: [] }
  return {
    actions: actions.filter(action => action.compensation?.safety !== 'blocked'),
    deferredActions: irreversible,
  }
}

export function validateActionTransactionClass(actions) {
  invariant(Array.isArray(actions) && actions.length > 0, 'Apply refused: transaction contains no managed action')
  const irreversible = actions.filter(action => action.compensation?.safety === 'blocked')
  invariant(
    irreversible.length === 0 || (irreversible.length === 1 && actions.length === 1),
    'Apply refused: an irreversible action requires an isolated, explicitly signed one-action transaction after all reversible drift is aligned',
  )
  return true
}

function currentSuccessfulCheck(repo, observed, check, integration, desired, now) {
  const committedAt = new Date(observed.defaultBranchCommittedAt)
  const minimumCompletedAt = new Date(now.getTime() - desired.checkRunMaxAgeMinutes * 60 * 1000)
  const maximumCompletedAt = new Date(now.getTime() + desired.checkRunClockSkewSeconds * 1000)
  return observed.checkRuns.find(run => {
    const completedAt = new Date(run.completed_at)
    return run.name === check.context
      && run.app?.id === integration.id
      && run.head_sha === observed.defaultBranchHeadSha
      && run.status === 'completed'
      && run.conclusion === 'success'
      && Number.isFinite(completedAt.getTime())
      && completedAt >= committedAt
      && completedAt >= minimumCompletedAt
      && completedAt <= maximumCompletedAt
      && validateRequiredCheckProducer({ run, check, integration, repo, observed }).length === 0
  })
}

function observedStateDigest(repo, observed) {
  return sha256(stableStringify({
    repository: repo.github,
    defaultBranchHeadSha: observed.defaultBranchHeadSha,
    metadata: {
      fullName: observed.metadata.full_name,
      defaultBranch: observed.metadata.default_branch,
      visibility: observed.metadata.visibility,
    },
    rulesets: observed.rulesets.map(normalizeRuleset).sort((left, right) => compareUtf8Bytes(left.name, right.name)),
    environments: observed.environments.map(normalizeEnvironment).sort((left, right) => compareUtf8Bytes(left.name, right.name)),
    actionsWorkflowPermissions: normalizeActionsWorkflowPermissions(observed.actionsWorkflowPermissions),
    workflows: Object.fromEntries(Object.entries(observed.workflowContents).sort(([left], [right]) => compareUtf8Bytes(left, right)).map(([path, workflow]) => [path, workflow ? {
      contentSha256: workflow.identity.contentSha256,
      gitBlobSha: workflow.identity.gitBlobSha,
      semanticSha256: workflow.identity.semanticSha256,
    } : null])),
    immutableReleases: observed.immutableReleases === null ? null : immutableEnabled(observed.immutableReleases),
  }, 0))
}

export function diffRepository(repo, materialized, observed, desired, now = new Date()) {
  const conflicts = [...materialized.eligibility.blockers]
  const actions = []
  for (const [name, integration] of Object.entries(desired.integrations)) {
    if (integration.required && !Number.isInteger(integration.id)) conflicts.push(`required integration unresolved: ${name}`)
  }
  if (observed.metadata.full_name !== repo.github) conflicts.push(`API identity mismatch: expected ${repo.github}, got ${observed.metadata.full_name}`)
  if (observed.metadata.default_branch !== repo.defaultBranch) conflicts.push(`Default branch mismatch: expected ${repo.defaultBranch}, got ${observed.metadata.default_branch}`)
  if (observed.metadata.visibility !== repo.visibility) conflicts.push(`Visibility mismatch: expected ${repo.visibility}, got ${observed.metadata.visibility}`)

  for (const check of materialized.requiredChecks) {
    const integration = desired.integrations[check.integration]
    if (!Number.isInteger(integration.id)) {
      conflicts.push(`required integration unresolved: ${check.integration} for ${check.context}`)
    } else {
      const history = currentSuccessfulCheck(repo, observed, check, integration, desired, now)
      if (!history) conflicts.push(`required check lacks a fresh successful run from integration ${integration.id} on current head ${observed.defaultBranchHeadSha}: ${check.context}`)
    }
    if (check.trustSource === 'repository-workflow' || check.trustSource === 'protected-base-workflow') conflicts.push(...workflowPreflight(check, observed.workflowContents[check.workflow]))
    else if (check.trustSource !== 'external-github-app' || integration.operationMode !== 'external-service') conflicts.push(`${check.context} does not use an external Governance Check App trust source`)
  }

  for (const environment of materialized.declaredEnvironments) {
    if (environment.independentReviewRequired && environment.reviewers.length === 0) conflicts.push(`environment ${environment.name} requires at least one independently administered reviewer before activation`)
    // 1B(2026-07-29):App 整合可 required=false(standalone 可選),但**被環境引用**
    // 即為該 profile 的啟用必要條件 —— 未解析(id=null)必 conflict,不得靜默略過。
    if (environment.credentialIntegration && !Number.isInteger(desired.integrations[environment.credentialIntegration]?.id)) {
      conflicts.push(`required integration unresolved: ${environment.credentialIntegration} for environment ${environment.name}`)
    }
    conflicts.push(...environmentWorkflowPreflight(environment, observed.workflowContents[environment.workflow], desired.integrations))
  }

  if (materialized.tagPolicy.allowCreation && materialized.tagPolicy.sourceWorkflow) {
    const sourceWorkflow = observed.workflowContents[materialized.tagPolicy.sourceWorkflow]
    conflicts.push(...validateWorkflowIdentity(materialized.tagPolicy.sourceWorkflowIdentity, sourceWorkflow?.identity)
      .map(failure => `release tag source workflow: ${failure}`))
    const content = sourceWorkflow?.content
    const provesAncestry = Boolean(content && /merge-base\s+--is-ancestor/.test(content) && /refs\/remotes\/origin\/main/.test(content))
    const provesExactProtectedHead = Boolean(content
      && /tag_commit=/.test(content)
      && /main_commit=/.test(content)
      && /test\s+"\$tag_commit"\s+=\s+"\$main_commit"/.test(content))
    if (!provesAncestry && !provesExactProtectedHead) {
      conflicts.push(`release tag source workflow does not prove main ancestry: ${materialized.tagPolicy.sourceWorkflow}`)
    }
  }

  const desiredActionsWorkflowPermissions = normalizeActionsWorkflowPermissions(materialized.actionsWorkflowPermissions)
  const observedActionsWorkflowPermissions = normalizeActionsWorkflowPermissions(observed.actionsWorkflowPermissions)
  if (!deepEqual(observedActionsWorkflowPermissions, desiredActionsWorkflowPermissions)) {
    const path = `/repos/${repo.github}/actions/permissions/workflow`
    actions.push(managedAction(
      {
        kind: 'update-actions-workflow-permissions',
        method: 'PUT',
        path,
        body: desiredActionsWorkflowPermissions,
        resource: 'actions-workflow-permissions',
      },
      observedActionsWorkflowPermissions,
      { safety: 'automatic', method: 'PUT', path, body: observedActionsWorkflowPermissions },
    ))
  }

  for (const desiredRuleset of materialized.rulesets) {
    const summary = observed.rulesetSummaries.find(item => item.name === desiredRuleset.name)
    const remote = observed.rulesets.find(item => item.name === desiredRuleset.name)
    const body = normalizeRuleset(desiredRuleset)
    if (!summary) actions.push(managedAction(
      { kind: 'create-ruleset', method: 'POST', path: `/repos/${repo.github}/rulesets`, body, resource: desiredRuleset.name },
      null,
      { safety: 'automatic', method: 'DELETE', pathSource: 'readbackPath' },
    ))
    else if (!deepEqual(normalizeRuleset(remote), body)) actions.push(managedAction(
      { kind: 'update-ruleset', method: 'PUT', path: `/repos/${repo.github}/rulesets/${summary.id}`, body, resource: desiredRuleset.name },
      normalizeRuleset(remote),
      { safety: 'automatic', method: 'PUT', path: `/repos/${repo.github}/rulesets/${summary.id}`, body: normalizeRuleset(remote) },
    ))
  }
  const desiredRulesetNames = new Set(materialized.rulesets.map(item => item.name))
  for (const stale of observed.rulesetSummaries.filter(item => item.name.startsWith(desired.managedRulesetPrefix) && !desiredRulesetNames.has(item.name))) {
    const remote = observed.rulesets.find(item => item.name === stale.name)
    invariant(remote, `Missing before-image for stale ruleset ${repo.github}/${stale.name}`)
    actions.push(managedAction(
      { kind: 'delete-stale-ruleset', method: 'DELETE', path: `/repos/${repo.github}/rulesets/${stale.id}`, body: undefined, resource: stale.name },
      normalizeRuleset(remote),
      { safety: 'automatic', method: 'POST', path: `/repos/${repo.github}/rulesets`, body: normalizeRuleset(remote), recreatedResource: true },
    ))
  }

  for (const desiredEnvironment of materialized.environments) {
    const remote = observed.environments.find(item => item.name === desiredEnvironment.name)
    const body = clone(desiredEnvironment)
    delete body.name
    if (!remote || !deepEqual(normalizeEnvironment(remote), desiredEnvironment)) {
      actions.push(managedAction(
        { kind: remote ? 'update-environment' : 'create-environment', method: 'PUT', path: `/repos/${repo.github}/environments/${encodeURIComponent(desiredEnvironment.name)}`, body, resource: desiredEnvironment.name },
        remote ? normalizeEnvironment(remote) : null,
        remote
          ? { safety: 'automatic', method: 'PUT', path: `/repos/${repo.github}/environments/${encodeURIComponent(desiredEnvironment.name)}`, body: (() => { const previous = normalizeEnvironment(remote); delete previous.name; return previous })() }
          : { safety: 'automatic', method: 'DELETE', path: `/repos/${repo.github}/environments/${encodeURIComponent(desiredEnvironment.name)}` },
      ))
    }
  }
  const declaredNames = new Set(materialized.declaredEnvironments.map(item => item.name))
  for (const stale of observed.environmentSummaries.filter(item => desired.managedEnvironmentNames.includes(item.name) && !declaredNames.has(item.name))) {
    const remote = observed.environments.find(item => item.name === stale.name)
    invariant(remote, `Missing before-image for stale environment ${repo.github}/${stale.name}`)
    const previous = normalizeEnvironment(remote)
    const body = clone(previous)
    delete body.name
    actions.push(managedAction(
      { kind: 'delete-stale-environment', method: 'DELETE', path: `/repos/${repo.github}/environments/${encodeURIComponent(stale.name)}`, body: undefined, resource: stale.name },
      previous,
      { safety: 'automatic', method: 'PUT', path: `/repos/${repo.github}/environments/${encodeURIComponent(stale.name)}`, body },
    ))
  }
  if (materialized.immutableReleases && !immutableEnabled(observed.immutableReleases)) {
    actions.push(managedAction(
      { kind: 'enable-immutable-releases', method: 'PUT', path: `/repos/${repo.github}/immutable-releases`, body: {}, resource: 'immutable-releases' },
      { enabled: false },
      { safety: 'blocked', reason: 'GitHub immutable releases enablement has no modeled safe inverse; manual recovery is required' },
    ))
  }

  const staged = stageActionTransaction(actions)

  return {
    repoId: repo.id,
    github: repo.github,
    ring: materialized.eligibility.ring,
    defaultBranchHeadSha: observed.defaultBranchHeadSha,
    observedStateDigest: observedStateDigest(repo, observed),
    eligibility: materialized.eligibility,
    requiredChecks: materialized.requiredChecks.map(check => check.context),
    conflicts: [...new Set(conflicts)],
    actions: staged.actions,
    deferredActions: staged.deferredActions,
  }
}

function buildPlanCore({ inventory, desired, rings, certifications, waivers, client, verifiedReleaseEvidence = null, repoId, now = new Date(), issuerRegistry = loadIssuerRegistry(), runtimeProfile, runtimeValidationContext = {} }, productionLive) {
  const validateCandidateReleaseEvidence = () => {
    if (rings.candidateRelease === null) invariant(verifiedReleaseEvidence === null, 'verified release evidence must be null without a candidate release')
    else validateVerifiedReleaseEvidence(verifiedReleaseEvidence, rings.candidateRelease)
    return rings.candidateRelease === null
      ? null
      : digestVerifiedReleaseEvidence(verifiedReleaseEvidence, rings.candidateRelease)
  }
  let releaseEvidenceDigest
  if (productionLive) releaseEvidenceDigest = validateCandidateReleaseEvidence()
  const effectiveRuntimeValidationContext = resolveRuntimeValidationContextCore({
    client,
    inventory,
    certifications,
    runtimeProfile,
    runtimeValidationContext,
  }, productionLive)
  validateModelCore(inventory, desired, rings, certifications, waivers, now, issuerRegistry, runtimeProfile, effectiveRuntimeValidationContext, productionLive)
  if (!productionLive) releaseEvidenceDigest = validateCandidateReleaseEvidence()
  const repositories = repoId ? inventory.repositories.filter(repo => repo.id === repoId) : inventory.repositories
  invariant(repositories.length > 0, `Unknown repository id ${repoId}`)
  const prepared = repositories.map(repo => {
    const assignment = rings.assignments[repo.id]
    // Diffing always materializes the converged protected target. Manual holds
    // surface as conflicts so a held repository can never be mutated.
    const eligibility = { eligible: true, promoted: true, ring: assignment.ring, wave: assignment.wave, blockers: [...(assignment.manualBlockers ?? [])] }
    return { repo, materialized: materializeProfile(repo, desired, rings, eligibility) }
  })
  // Transaction preflight: every repository is fully read before any mutation can begin.
  const observed = prepared.map(item => fetchRepositoryState(client, item.repo, item.materialized, desired))
  assertLiveIdentitySnapshot(productionLive, prepared.map(item => item.repo), observed, effectiveRuntimeValidationContext)
  const candidates = prepared.map((item, index) => diffRepository(item.repo, item.materialized, observed[index], desired, now))
  const repoPlans = candidates.map(candidate => {
    const assignment = rings.assignments[candidate.repoId]
    return {
      ...candidate,
      wave: assignment.wave,
      candidateActions: clone(candidate.actions),
      eligibility: {
        eligible: candidate.conflicts.length === 0,
        promoted: candidate.conflicts.length === 0 && candidate.actions.length === 0 && candidate.deferredActions.length === 0,
        ring: assignment.ring,
        wave: assignment.wave,
        blockers: [],
      },
    }
  })
  const plan = {
    schemaVersion: 7,
    mode: 'plan',
    readOnly: true,
    scope: {
      coverage: repoId ? 'registered-opt-in-subset' : inventory.fleetScope.coverage,
      enrollment: inventory.fleetScope.enrollment,
      unregisteredDescendants: inventory.fleetScope.unregisteredDescendants,
      registeredRepositoryCount: inventory.repositories.length,
      plannedRepositoryCount: repoPlans.length,
    },
    inventoryDigest: sha256(stableStringify(inventory, 0)),
    desiredDigest: sha256(stableStringify(desired, 0)),
    attestationPolicyDigest: sha256(stableStringify(rings.attestationPolicy, 0)),
    candidateRelease: clone(rings.candidateRelease),
    verifiedReleaseEvidenceDigest: releaseEvidenceDigest,
    repoPlans,
    summary: {
      registeredInventory: {
        repositories: repoPlans.length,
        managedChanges: repoPlans.reduce((sum, item) => sum + item.candidateActions.length + item.deferredActions.length, 0),
        candidateActions: repoPlans.reduce((sum, item) => sum + item.candidateActions.length, 0),
        deferredActions: repoPlans.reduce((sum, item) => sum + item.deferredActions.length, 0),
        conflicts: repoPlans.reduce((sum, item) => sum + item.conflicts.length, 0),
      },
    },
  }
  plan.planDigest = sha256(stableStringify(plan, 0))
  return plan
}

const JOURNAL_GENESIS_DIGEST = '0'.repeat(64)
const JOURNAL_EVENT_KEYS = ['schemaVersion', 'sequence', 'transactionId', 'type', 'subjectActionId', 'at', 'previousDigest', 'authorizationEnvelopeDigest', 'runtimeState', 'stateDigest', 'mirrorRequestNonce', 'eventDigest']

function journalStateDigest(journal) {
  return sha256(`fleet-reconcile-state-v2\n${stableStringify({
    authorizationEnvelopeDigest: journal.authorizationEnvelopeDigest,
    runtimeState: journalRuntimeState(journal),
  }, 0)}`)
}

function journalRuntimeState(journal) {
  return {
    transactionState: journal.state,
    completedAt: journal.completedAt ?? null,
    failedAt: journal.failedAt ?? null,
    error: journal.error ?? null,
    rollbackAttempted: journal.rollbackAttempted,
    recoveredAt: journal.recoveredAt ?? null,
    recoveryFailures: clone(journal.recoveryFailures ?? null),
    rollbackAuthorizationEventHeadDigest: journal.rollbackAuthorizationEventHeadDigest ?? null,
    rollbackStartedAt: journal.rollbackStartedAt ?? null,
    rollbackCompletedAt: journal.rollbackCompletedAt ?? null,
    rollbackBlockers: clone(journal.rollbackBlockers ?? null),
    actions: journal.actions.map(action => ({
      actionId: action.actionId,
      status: action.status,
      responseId: action.responseId ?? null,
      readbackPath: action.readbackPath ?? null,
      recoveryObservation: clone(action.recoveryObservation ?? null),
      rollbackStatus: action.rollbackStatus ?? null,
    })),
  }
}

const RUNTIME_ROOT_KEYS = ['transactionState', 'completedAt', 'failedAt', 'error', 'rollbackAttempted', 'recoveredAt', 'recoveryFailures', 'rollbackAuthorizationEventHeadDigest', 'rollbackStartedAt', 'rollbackCompletedAt', 'rollbackBlockers', 'actions']
const RUNTIME_ACTION_KEYS = ['actionId', 'status', 'responseId', 'readbackPath', 'recoveryObservation', 'rollbackStatus']

function changedKeys(before, after, ignored = new Set()) {
  return Object.keys(after).filter(key => !ignored.has(key) && !deepEqual(before?.[key], after[key]))
}

function validateRuntimeStateShape(runtimeState, actionIds) {
  assertClosedKeys(runtimeState, new Set(RUNTIME_ROOT_KEYS), 'Transaction journal event runtime state has an invalid or open shape')
  invariant(Object.keys(runtimeState).length === RUNTIME_ROOT_KEYS.length, 'Transaction journal event runtime state is incomplete')
  invariant(Array.isArray(runtimeState.actions) && runtimeState.actions.length === actionIds.length, 'Transaction journal event runtime action set is incomplete')
  for (let index = 0; index < runtimeState.actions.length; index += 1) {
    const action = runtimeState.actions[index]
    assertClosedKeys(action, new Set(RUNTIME_ACTION_KEYS), `Transaction journal event runtime action ${index} has an invalid or open shape`)
    invariant(Object.keys(action).length === RUNTIME_ACTION_KEYS.length && action.actionId === actionIds[index], `Transaction journal event runtime action ${index} identity/order mismatch`)
  }
}

function validateRuntimeTransition(previous, current, type, subjectActionId, at) {
  const rootChanges = changedKeys(previous, current, new Set(['actions']))
  const changedActions = current.actions.map((action, index) => ({ action, before: previous?.actions?.[index] }))
    .filter(({ action, before }) => !deepEqual(action, before))
  const exactRootChanges = allowed => invariant(rootChanges.length === allowed.length && rootChanges.every(key => allowed.includes(key)), `Transaction journal event ${type} changed disallowed transaction fields: ${rootChanges.join(',')}`)
  const oneAction = allowed => {
    invariant(changedActions.length === 1, `Transaction journal event ${type} must change exactly one action`)
    const changes = changedKeys(changedActions[0].before, changedActions[0].action, new Set(['actionId']))
    invariant(changes.length > 0 && changes.every(key => allowed.includes(key)), `Transaction journal event ${type} changed disallowed action fields: ${changes.join(',')}`)
    return { ...changedActions[0], changes }
  }
  if (!previous) {
    invariant(type === 'prepared' && subjectActionId === null && current.transactionState === 'prepared' && current.rollbackAttempted === false
      && current.actions.every(action => action.status === 'pending' && action.responseId === null && action.readbackPath === null && action.recoveryObservation === null && action.rollbackStatus === null), 'Transaction journal genesis runtime state is invalid')
    return true
  }
  if (type === 'applying') {
    invariant(subjectActionId === null, 'Transaction journal applying transition cannot target an action')
    exactRootChanges(['transactionState'])
    invariant(previous.transactionState === 'prepared' && current.transactionState === 'applying' && changedActions.length === 0, 'Transaction journal applying transition is invalid')
  } else if (type === 'action-applying') {
    exactRootChanges([])
    const change = oneAction(['status'])
    invariant(change.action.actionId === subjectActionId && change.before.status === 'pending' && change.action.status === 'applying', 'Transaction journal action-applying status transition is invalid')
  } else if (type === 'action-applied-unverified') {
    exactRootChanges([])
    const change = oneAction(['status', 'responseId', 'readbackPath'])
    invariant(change.action.actionId === subjectActionId && change.before.status === 'applying' && change.action.status === 'applied-unverified' && change.action.readbackPath !== null, 'Transaction journal action-applied-unverified transition is invalid')
  } else if (type === 'action-verified') {
    exactRootChanges([])
    const change = oneAction(['status'])
    invariant(change.action.actionId === subjectActionId && change.before.status === 'applied-unverified' && change.action.status === 'verified', 'Transaction journal action-verified transition is invalid')
  } else if (type === 'verified') {
    invariant(subjectActionId === null, 'Transaction journal verified transition cannot target an action')
    exactRootChanges(['transactionState', 'completedAt'])
    invariant(previous.transactionState === 'applying' && current.transactionState === 'verified' && current.completedAt === at && changedActions.length === 0 && current.actions.every(action => action.status === 'verified'), 'Transaction journal verified transition is invalid')
  } else if (type === 'failed-partial-state-possible') {
    invariant(subjectActionId === null, 'Transaction journal failure transition cannot target an action')
    exactRootChanges(['transactionState', 'failedAt', 'error'])
    invariant(['applying', 'verified'].includes(previous.transactionState) && current.transactionState === 'failed-partial-state-possible' && current.failedAt === at && typeof current.error === 'string' && current.error.length > 0 && changedActions.length === 0, 'Transaction journal failure transition is invalid')
  } else if (type === 'recovery-observed' || type === 'manual-recovery-required') {
    invariant(subjectActionId === null, `Transaction journal ${type} transition cannot target one action`)
    exactRootChanges(['transactionState', 'recoveredAt', 'recoveryFailures'])
    invariant(current.transactionState === type && current.recoveredAt === at
      && Array.isArray(current.recoveryFailures)
      && changedActions.every(({ action, before }) => changedKeys(before, action, new Set(['actionId'])).every(key => ['status', 'recoveryObservation'].includes(key))), `Transaction journal ${type} transition is invalid`)
  } else if (type === 'rolling-back') {
    invariant(subjectActionId === null, 'Transaction journal rolling-back transition cannot target an action')
    invariant(rootChanges.every(key => ['transactionState', 'rollbackAttempted', 'rollbackAuthorizationEventHeadDigest', 'rollbackStartedAt'].includes(key))
      && ['transactionState', 'rollbackAuthorizationEventHeadDigest'].every(key => rootChanges.includes(key)), `Transaction journal rolling-back changed disallowed or incomplete transaction fields: ${rootChanges.join(',')}`)
    invariant(['failed-partial-state-possible', 'manual-recovery-required', 'recovery-observed', 'rollback-blocked'].includes(previous.transactionState)
      && current.transactionState === 'rolling-back' && current.rollbackAttempted === true && current.rollbackStartedAt === at
      && /^[a-f0-9]{64}$/.test(current.rollbackAuthorizationEventHeadDigest ?? '') && changedActions.length === 0, 'Transaction journal rolling-back transition is invalid')
  } else if (['rollback-already-restored', 'rollback-blocked-drift', 'rollback-blocked-manual', 'rollback-compensating', 'rollback-action-verified', 'rollback-blocked-error'].includes(type)) {
    exactRootChanges([])
    const expected = {
      'rollback-already-restored': 'already-at-before-image',
      'rollback-blocked-drift': 'blocked-drift',
      'rollback-blocked-manual': 'blocked-manual',
      'rollback-compensating': 'compensating',
      'rollback-action-verified': 'rolled-back-verified',
      'rollback-blocked-error': 'blocked-error',
    }[type]
    invariant(changedActions.length <= 1, `Transaction journal event ${type} changed more than one action`)
    const action = changedActions.length === 1 ? oneAction(['rollbackStatus', 'readbackPath']).action : current.actions.find(item => item.actionId === subjectActionId)
    invariant(typeof subjectActionId === 'string' && action?.actionId === subjectActionId && current.transactionState === 'rolling-back' && action.rollbackStatus === expected, `Transaction journal ${type} action transition is invalid`)
  } else if (type === 'rolled-back-verified' || type === 'rollback-blocked') {
    invariant(subjectActionId === null, `Transaction journal ${type} terminal transition cannot target an action`)
    invariant(rootChanges.every(key => ['transactionState', 'rollbackCompletedAt', 'rollbackBlockers'].includes(key))
      && ['transactionState', 'rollbackBlockers'].every(key => rootChanges.includes(key)), `Transaction journal event ${type} changed disallowed or incomplete transaction fields: ${rootChanges.join(',')}`)
    invariant(previous.transactionState === 'rolling-back' && current.transactionState === type && current.rollbackCompletedAt === at
      && Array.isArray(current.rollbackBlockers) && changedActions.length === 0
      && (type === 'rolled-back-verified' ? current.rollbackBlockers.length === 0 : current.rollbackBlockers.length > 0), `Transaction journal ${type} terminal transition is invalid`)
  } else invariant(false, `Transaction journal event type has no transition reducer: ${type}`)
  return true
}

function eventDigest(event) {
  const unsigned = clone(event)
  delete unsigned.eventDigest
  return sha256(`fleet-reconcile-event-v1\n${stableStringify(unsigned, 0)}`)
}

function readLiveTime(clock, label, notBefore = null) {
  invariant(typeof clock === 'function', `${label} requires a live clock source`)
  const at = clock()
  invariant(at instanceof Date && Number.isFinite(at.getTime()), `${label} clock returned an invalid time`)
  invariant(!notBefore || at >= notBefore, `${label} clock regressed`)
  return at
}

const RELOADABLE_GOVERNANCE_KEYS = [
  'inventory', 'desired', 'rings', 'certifications', 'waivers', 'runtimeProfile', 'issuerRegistry',
]

function assertCurrentGovernanceReload(reloadCurrentGovernance, baseline) {
  if (!reloadCurrentGovernance) return true
  const current = reloadCurrentGovernance()
  invariant(current && typeof current === 'object' && !Array.isArray(current), 'Current governance reload returned an invalid model')
  for (const key of RELOADABLE_GOVERNANCE_KEYS) {
    invariant(Object.prototype.hasOwnProperty.call(current, key), `Current governance reload omitted ${key}`)
    invariant(deepEqual(current[key], baseline[key]), `Apply refused: canonical governance SSOT changed during transaction: ${key}`)
  }
  return true
}

function assertCurrentRollbackReload(reloadCurrentGovernance, baseline) {
  if (!reloadCurrentGovernance) return true
  const current = reloadCurrentGovernance()
  invariant(current && typeof current === 'object' && !Array.isArray(current), 'Current rollback governance reload returned an invalid model')
  for (const key of ['inventory', 'desired', 'rings', 'privilegedPolicy', 'issuerRegistry']) {
    invariant(Object.prototype.hasOwnProperty.call(current, key), `Current rollback governance reload omitted ${key}`)
    invariant(deepEqual(current[key], baseline[key]), `Rollback refused: canonical governance SSOT changed during transaction: ${key}`)
  }
  return true
}

function writeJournalSnapshot(path, journal, { create = false } = {}) {
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true })
  if (create) invariant(!existsSync(path), `Apply refused: transaction journal path already exists and is immutable: ${path}`)
  else {
    invariant(existsSync(path), `Transaction journal disappeared before append: ${path}`)
    const previous = readJson(path)
    invariant(previous.transactionId === journal.transactionId, 'Transaction journal identity changed during append')
    invariant(Array.isArray(previous.events) && Array.isArray(journal.events)
      && stableStringify(journal.events.slice(0, previous.events.length), 0) === stableStringify(previous.events, 0), 'Transaction journal event chain was rewritten or truncated')
  }
  const temporary = `${path}.${randomUUID()}.tmp`
  const body = `${stableStringify(journal)}\n`
  const descriptor = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(descriptor, body)
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  if (create) {
    try {
      linkSync(temporary, path)
    } finally {
      unlinkSync(temporary)
    }
  } else renameSync(temporary, path)
  const directoryDescriptor = openSync(directory, 'r')
  try {
    fsyncSync(directoryDescriptor)
  } finally {
    closeSync(directoryDescriptor)
  }
  invariant(readFileSync(path, 'utf8') === body, `Transaction journal exact readback failed: ${path}`)
}

function appendJournalEvent(path, journal, {
  type,
  subjectActionId = null,
  at,
  create = false,
}) {
  invariant(at instanceof Date && Number.isFinite(at.getTime()), 'Transaction journal event time is invalid')
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true })
  const lockPath = `${path}.append.lock`
  let lockDescriptor
  try {
    lockDescriptor = openSync(lockPath, 'wx', 0o600)
  } catch (error) {
    throw new Error(`Transaction journal append lock is already held or unavailable: ${lockPath}: ${error.message}`)
  }
  try {
    const event = {
      schemaVersion: 1,
      sequence: journal.events.length + 1,
      transactionId: journal.transactionId,
      type,
      subjectActionId,
      at: at.toISOString(),
      previousDigest: journal.eventHeadDigest,
      authorizationEnvelopeDigest: journal.authorizationEnvelopeDigest,
      runtimeState: journalRuntimeState(journal),
      stateDigest: journalStateDigest(journal),
      mirrorRequestNonce: null,
      eventDigest: null,
    }
    if (journal.events.length > 0) invariant(at >= new Date(journal.events.at(-1).at), 'Transaction journal event clock regressed')
    event.eventDigest = eventDigest(event)
    journal.events.push(event)
    journal.eventHeadDigest = event.eventDigest
    writeJournalSnapshot(path, journal, { create })
    return event
  } finally {
    closeSync(lockDescriptor)
    unlinkSync(lockPath)
  }
}

function readbackPath(action, response) {
  if (action.kind === 'create-ruleset') return `/repos/${action.github}/rulesets/${response?.id}`
  return action.path
}

function observeActionState(client, action) {
  if (action.kind === 'create-ruleset' && !action.readbackPath) {
    const summaries = client.request('GET', action.path)
    invariant(Array.isArray(summaries), `Ruleset observation is invalid for ${action.repoId}/${action.resource}`)
    const matches = summaries.filter(item => item.name === action.resource)
    invariant(matches.length <= 1, `Ruleset observation is ambiguous for ${action.repoId}/${action.resource}`)
    if (matches.length === 0) return state(null)
    return state(normalizeRuleset(client.request('GET', `/repos/${action.github}/rulesets/${matches[0].id}`)))
  }
  const path = action.readbackPath ?? action.path
  const remote = client.request('GET', path, undefined, { allow404: true })
  if (action.kind === 'update-actions-workflow-permissions') return state(normalizeActionsWorkflowPermissions(remote))
  if (action.kind === 'enable-immutable-releases') return state({ enabled: immutableEnabled(remote) })
  if (remote === null) return state(null)
  if (action.kind.endsWith('ruleset')) return state(normalizeRuleset(remote))
  if (action.kind.endsWith('environment')) return state(normalizeEnvironment(remote))
  throw new Error(`Unsupported action observation ${action.kind}`)
}

function verifyAppliedAction(client, action) {
  return deepEqual(observeActionState(client, action), action.expectedApplied)
}

function rollbackPlanFor(actions) {
  return [...actions].reverse().map(action => ({
    actionId: action.actionId,
    repoId: action.repoId,
    resource: action.resource,
    beforeImageDigest: action.beforeImage.digest,
    expectedAppliedDigest: action.expectedApplied.digest,
    compensation: clone(action.compensation),
  }))
}

function rollbackPlanDigest(rollbackPlan) {
  return sha256(stableStringify(rollbackPlan, 0))
}

const JOURNAL_ROOT_KEYS = new Set([
  'schemaVersion', 'transactionId', 'planDigest', 'candidateRelease', 'verifiedReleaseEvidenceDigest',
  'evidenceDurabilityClass',
  'state', 'startedAt', 'completedAt', 'failedAt', 'error',
  'rollbackAttempted', 'recoveryInstruction', 'actions', 'rollbackPlan', 'rollbackPlanDigest',
  'inventoryDigest', 'desiredDigest', 'attestationPolicyDigest',
  'historicalControlPlane', 'historicalControlPlaneDigest',
  'authorizationEnvelopeDigest', 'recoveredAt', 'recoveryFailures', 'rollbackStartedAt',
  'rollbackCompletedAt', 'rollbackBlockers',
  'events', 'eventHeadDigest', 'rollbackAuthorizationEventHeadDigest',
])
const ACTION_RUNTIME_KEYS = new Set(['status', 'responseId', 'readbackPath', 'recoveryObservation', 'rollbackStatus'])
const ACTION_FIXED_KEYS = new Set(['kind', 'method', 'path', 'body', 'resource', 'beforeImage', 'expectedApplied', 'compensation', 'actionId', 'github', 'repoId'])
const ACTION_KINDS = new Map([
  ['update-actions-workflow-permissions', 'PUT'],
  ['create-ruleset', 'POST'],
  ['update-ruleset', 'PUT'],
  ['delete-stale-ruleset', 'DELETE'],
  ['create-environment', 'PUT'],
  ['update-environment', 'PUT'],
  ['delete-stale-environment', 'DELETE'],
  ['enable-immutable-releases', 'PUT'],
])

function assertClosedKeys(value, allowed, message) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), message)
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${message}: unexpected field ${key}`)
}

function fixedAction(action) {
  return Object.fromEntries(Object.entries(action).filter(([key]) => ACTION_FIXED_KEYS.has(key)))
}

function originalPlanAction(action) {
  const result = {
    kind: action.kind,
    method: action.method,
    path: action.path,
    resource: action.resource,
    beforeImage: clone(action.beforeImage),
    expectedApplied: clone(action.expectedApplied),
    compensation: clone(action.compensation),
  }
  if (Object.prototype.hasOwnProperty.call(action, 'body')) result.body = clone(action.body)
  return result
}

function validateStateSnapshot(snapshot, label) {
  assertClosedKeys(snapshot, new Set(['state', 'value', 'digest']), `${label} snapshot is invalid`)
  invariant(snapshot.state === 'absent' || snapshot.state === 'present', `${label} snapshot state is invalid`)
  invariant(snapshot.state === 'present' ? Object.prototype.hasOwnProperty.call(snapshot, 'value') : !Object.prototype.hasOwnProperty.call(snapshot, 'value'), `${label} snapshot value disagrees with state`)
  const unsigned = snapshot.state === 'present' ? { state: 'present', value: snapshot.value } : { state: 'absent' }
  invariant(snapshot.digest === sha256(stableStringify(unsigned, 0)), `${label} snapshot digest mismatch`)
}

function validateManagedAction(action, repoById, desired) {
  assertClosedKeys(action, new Set([...ACTION_FIXED_KEYS, ...ACTION_RUNTIME_KEYS]), 'Journal action has an invalid or open shape')
  for (const key of ['kind', 'method', 'path', 'resource', 'beforeImage', 'expectedApplied', 'compensation', 'actionId', 'github', 'repoId', 'status']) invariant(Object.prototype.hasOwnProperty.call(action, key), `Journal action is missing ${key}`)
  const repo = repoById.get(action.repoId)
  invariant(repo && repo.github === action.github, `Journal action references unmanaged repository ${action.repoId}/${action.github}`)
  invariant(ACTION_KINDS.get(action.kind) === action.method, `Journal action kind/method mismatch for ${action.actionId}`)
  invariant(action.actionId.startsWith(`${action.repoId}:`), `Journal action id is outside repository scope for ${action.repoId}`)
  invariant(['pending', 'applying', 'applied-unverified', 'verified', 'not-applied'].includes(action.status), `Journal action status is invalid for ${action.actionId}`)
  if (Object.prototype.hasOwnProperty.call(action, 'responseId')) invariant(action.responseId === null || Number.isInteger(action.responseId) || (typeof action.responseId === 'string' && action.responseId.length > 0), `Journal response id is invalid for ${action.actionId}`)
  if (Object.prototype.hasOwnProperty.call(action, 'recoveryObservation')) validateStateSnapshot(action.recoveryObservation, `${action.actionId} recovery observation`)
  if (Object.prototype.hasOwnProperty.call(action, 'rollbackStatus')) invariant(['already-at-before-image', 'blocked-drift', 'blocked-manual', 'compensating', 'rolled-back-verified', 'blocked-error'].includes(action.rollbackStatus), `Journal rollback status is invalid for ${action.actionId}`)
  validateStateSnapshot(action.beforeImage, `${action.actionId} before-image`)
  validateStateSnapshot(action.expectedApplied, `${action.actionId} expected-applied`)
  assertClosedKeys(action.compensation, new Set(['safety', 'method', 'path', 'pathSource', 'body', 'recreatedResource', 'reason']), `Journal compensation is invalid for ${action.actionId}`)
  invariant(action.compensation.safety === 'automatic' || action.compensation.safety === 'blocked', `Journal compensation safety is invalid for ${action.actionId}`)

  const base = `/repos/${repo.github}`
  if (Object.prototype.hasOwnProperty.call(action, 'readbackPath') && action.readbackPath !== null) {
    invariant(typeof action.readbackPath === 'string', `Journal readback path is invalid for ${action.actionId}`)
    if (action.kind.endsWith('ruleset')) {
      const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      invariant(new RegExp(`^${escapedBase}/rulesets/[0-9]+$`).test(action.readbackPath), `Journal readback endpoint is outside managed scope: ${action.readbackPath}`)
    } else {
      invariant(action.readbackPath === action.path, `Journal readback endpoint differs from the managed action: ${action.readbackPath}`)
    }
  }
  if (action.kind === 'create-ruleset' && action.readbackPath) invariant(action.responseId !== null && String(action.responseId) === action.readbackPath.split('/').at(-1), `Journal create-ruleset response/readback correlation is invalid for ${action.actionId}`)
  if (action.kind === 'create-ruleset') invariant(action.path === `${base}/rulesets` && action.resource.startsWith(desired.managedRulesetPrefix), `Journal create-ruleset endpoint is outside managed scope: ${action.path}`)
  if (action.kind === 'update-ruleset' || action.kind === 'delete-stale-ruleset') invariant(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/rulesets/[0-9]+$`).test(action.path) && action.resource.startsWith(desired.managedRulesetPrefix), `Journal ruleset endpoint is outside managed scope: ${action.path}`)
  if (action.kind.endsWith('environment')) {
    const environment = decodeURIComponent(action.path.slice(`${base}/environments/`.length))
    invariant(action.path.startsWith(`${base}/environments/`) && environment === action.resource && desired.managedEnvironmentNames.includes(environment), `Journal environment endpoint is outside managed scope: ${action.path}`)
  }
  if (action.kind === 'update-actions-workflow-permissions') invariant(action.path === `${base}/actions/permissions/workflow` && action.resource === 'actions-workflow-permissions', `Journal Actions workflow-permissions endpoint is outside managed scope: ${action.path}`)
  if (action.kind === 'enable-immutable-releases') invariant(action.path === `${base}/immutable-releases` && action.resource === 'immutable-releases', `Journal immutable-release endpoint is outside managed scope: ${action.path}`)

  const expectedValue = action.kind === 'delete-stale-ruleset' || action.kind === 'delete-stale-environment'
    ? null
    : action.kind === 'enable-immutable-releases'
      ? { enabled: true }
      : action.kind.endsWith('environment')
        ? { name: action.resource, ...action.body }
        : action.body
  invariant(deepEqual(action.expectedApplied, state(expectedValue)), `Journal expected-applied state is not derived from the managed action for ${action.actionId}`)
  if (action.kind === 'create-ruleset') invariant(action.compensation.safety === 'automatic' && action.compensation.method === 'DELETE' && action.compensation.pathSource === 'readbackPath' && !action.compensation.path, `Journal create-ruleset compensation is not exact for ${action.actionId}`)
  if (action.kind === 'update-ruleset') invariant(action.compensation.safety === 'automatic' && action.compensation.method === 'PUT' && action.compensation.path === action.path && deepEqual(action.compensation.body, action.beforeImage.value), `Journal update-ruleset compensation is not exact for ${action.actionId}`)
  if (action.kind === 'delete-stale-ruleset') invariant(action.compensation.safety === 'automatic' && action.compensation.method === 'POST' && action.compensation.path === `${base}/rulesets` && action.compensation.recreatedResource === true && deepEqual(action.compensation.body, action.beforeImage.value), `Journal delete-ruleset compensation is not exact for ${action.actionId}`)
  if (action.kind === 'create-environment') invariant(action.compensation.safety === 'automatic' && action.compensation.method === 'DELETE' && action.compensation.path === action.path, `Journal create-environment compensation is not exact for ${action.actionId}`)
  if (action.kind === 'update-environment') {
    const before = clone(action.beforeImage.value)
    delete before.name
    invariant(action.compensation.safety === 'automatic' && action.compensation.method === 'PUT' && action.compensation.path === action.path && deepEqual(action.compensation.body, before), `Journal update-environment compensation is not exact for ${action.actionId}`)
  }
  if (action.kind === 'delete-stale-environment') {
    const before = clone(action.beforeImage.value)
    delete before.name
    invariant(action.compensation.safety === 'automatic' && action.compensation.method === 'PUT' && action.compensation.path === action.path && deepEqual(action.compensation.body, before), `Journal delete-environment compensation is not exact for ${action.actionId}`)
  }
  if (action.kind === 'update-actions-workflow-permissions') {
    invariant(action.beforeImage.state === 'present', `Journal Actions workflow-permissions before-image must be present for ${action.actionId}`)
    invariant(deepEqual(action.beforeImage.value, normalizeActionsWorkflowPermissions(action.beforeImage.value)), `Journal Actions workflow-permissions before-image is invalid for ${action.actionId}`)
    invariant(deepEqual(action.body, normalizeActionsWorkflowPermissions(action.body)), `Journal Actions workflow-permissions body is invalid for ${action.actionId}`)
    invariant(action.compensation.safety === 'automatic' && action.compensation.method === 'PUT' && action.compensation.path === action.path && deepEqual(action.compensation.body, action.beforeImage.value), `Journal Actions workflow-permissions compensation is not exact for ${action.actionId}`)
  }
  if (action.kind === 'enable-immutable-releases') invariant(action.compensation.safety === 'blocked' && typeof action.compensation.reason === 'string' && action.compensation.reason.length > 0, `Journal immutable-release compensation must remain blocked for ${action.actionId}`)
}

function authorizationEnvelope(journal) {
  return {
    historicalControlPlaneDigest: journal.historicalControlPlaneDigest,
    inventoryDigest: journal.inventoryDigest,
    desiredDigest: journal.desiredDigest,
    attestationPolicyDigest: journal.attestationPolicyDigest,
    planDigest: journal.planDigest,
    candidateRelease: journal.candidateRelease,
    verifiedReleaseEvidenceDigest: journal.verifiedReleaseEvidenceDigest,
    evidenceDurabilityClass: journal.evidenceDurabilityClass,
    actions: journal.actions.map(fixedAction),
    rollbackPlan: journal.rollbackPlan,
  }
}

export function journalAuthorizationEnvelopeDigest(journal) {
  return sha256(stableStringify(authorizationEnvelope(journal), 0))
}

function validateHistoricalInventory(inventory) {
  const requirements = inventory?.repositories?.flatMap(repo => repo.providerSurfacesRequired ?? []) ?? []
  const providerIds = new Set()
  const providerSurfaces = new Set()
  const providerRuntimeKinds = new Map()
  for (const requirement of requirements) {
    const [provider, runtimeKind, surface] = String(requirement).split('/')
    if (!providerRuntimeKinds.has(provider)) providerRuntimeKinds.set(provider, new Set())
    providerIds.add(provider)
    providerRuntimeKinds.get(provider).add(runtimeKind)
    providerSurfaces.add(surface)
  }
  validateInventory(inventory, { providerIds, providerRuntimeKinds, providerSurfaces })
}

export function validateTransactionJournal(journal, {
  inventory,
  desired,
  rings,
  now = new Date(),
  issuerRegistry,
  mode = 'current-apply',
} = {}) {
  assertClosedKeys(journal, JOURNAL_ROOT_KEYS, 'Transaction journal has an invalid or open shape')
  for (const key of ['schemaVersion', 'transactionId', 'planDigest', 'candidateRelease', 'verifiedReleaseEvidenceDigest', 'evidenceDurabilityClass', 'state', 'startedAt', 'rollbackAttempted', 'recoveryInstruction', 'actions', 'rollbackPlan', 'rollbackPlanDigest', 'inventoryDigest', 'desiredDigest', 'attestationPolicyDigest', 'historicalControlPlane', 'historicalControlPlaneDigest', 'authorizationEnvelopeDigest', 'events', 'eventHeadDigest']) invariant(Object.prototype.hasOwnProperty.call(journal, key), `Transaction journal is missing ${key}`)
  invariant(journal.schemaVersion === 7, 'Transaction journal schemaVersion must be 7')
  invariant(typeof journal.transactionId === 'string' && /^github-reconcile-[0-9]+-[a-f0-9]{12}$/.test(journal.transactionId), 'Transaction journal id is invalid')
  invariant(/^[a-f0-9]{64}$/.test(journal.planDigest ?? ''), 'Transaction journal plan digest is invalid')
  if (journal.candidateRelease === null) invariant(journal.verifiedReleaseEvidenceDigest === null, 'Transaction journal verified release evidence digest must be null without a candidate release')
  else invariant(/^[a-f0-9]{64}$/.test(journal.verifiedReleaseEvidenceDigest ?? ''), 'Transaction journal verified release evidence digest is invalid')
  invariant(journal.evidenceDurabilityClass === FLEET_RECONCILE_LOCAL_DURABILITY_CLASS,
    `Unknown fleet journal evidence durability class: ${journal.evidenceDurabilityClass}`)
  const canonicalJournalTime = (field, required = false) => {
    if (!Object.prototype.hasOwnProperty.call(journal, field)) {
      invariant(!required, `Transaction journal is missing ${field}`)
      return null
    }
    const parsed = new Date(journal[field])
    invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === journal[field], `Transaction journal ${field} is invalid`)
    return parsed
  }
  canonicalJournalTime('startedAt', true)
  for (const field of ['completedAt', 'failedAt', 'recoveredAt', 'rollbackStartedAt', 'rollbackCompletedAt']) canonicalJournalTime(field)
  if (Object.prototype.hasOwnProperty.call(journal, 'rollbackAuthorizationEventHeadDigest')) invariant(/^[a-f0-9]{64}$/.test(journal.rollbackAuthorizationEventHeadDigest), 'Transaction journal rollback authorization head digest is invalid')
  if (Object.prototype.hasOwnProperty.call(journal, 'recoveryFailures')) invariant(Array.isArray(journal.recoveryFailures) && journal.recoveryFailures.every(item => typeof item === 'string' && item.length > 0), 'Transaction journal recovery failures are invalid')
  if (Object.prototype.hasOwnProperty.call(journal, 'rollbackBlockers')) invariant(Array.isArray(journal.rollbackBlockers) && journal.rollbackBlockers.every(item => typeof item === 'string' && item.length > 0), 'Transaction journal rollback blockers are invalid')
  invariant(['prepared', 'applying', 'verified', 'failed-partial-state-possible', 'recovery-observed', 'manual-recovery-required', 'rolling-back', 'rolled-back-verified', 'rollback-blocked'].includes(journal.state), 'Transaction journal state is invalid')
  invariant(mode === 'current-apply' || mode === 'historical-observation', `Unknown transaction-journal validation mode ${mode}`)
  validateActionTransactionClass(journal.actions)
  invariant(Array.isArray(journal.events) && journal.events.length > 0, 'Transaction journal must contain an append-only event chain')
  let previousDigest = JOURNAL_GENESIS_DIGEST
  let previousAt = null
  let previousRuntimeState = null
  const runtimeActionIds = journal.actions.map(action => action.actionId)
  for (let index = 0; index < journal.events.length; index += 1) {
    const event = journal.events[index]
    assertClosedKeys(event, new Set(JOURNAL_EVENT_KEYS), `Transaction journal event ${index} has an invalid or open shape`)
    invariant(event.schemaVersion === 1
      && event.sequence === index + 1
      && event.transactionId === journal.transactionId
      && typeof event.type === 'string'
      && /^[a-z][a-z0-9-]*$/.test(event.type)
      && event.previousDigest === previousDigest
      && event.authorizationEnvelopeDigest === journal.authorizationEnvelopeDigest
      && /^[a-f0-9]{64}$/.test(event.stateDigest ?? '')
      && event.mirrorRequestNonce === null
      && event.eventDigest === eventDigest(event), `Transaction journal event ${index} chain binding is invalid`)
    const at = new Date(event.at)
    invariant(Number.isFinite(at.getTime()) && at.toISOString() === event.at && (!previousAt || at >= previousAt), `Transaction journal event ${index} time is invalid or regressed`)
    validateRuntimeStateShape(event.runtimeState, runtimeActionIds)
    invariant(event.stateDigest === sha256(`fleet-reconcile-state-v2\n${stableStringify({ authorizationEnvelopeDigest: event.authorizationEnvelopeDigest, runtimeState: event.runtimeState }, 0)}`), `Transaction journal event ${index} state digest is invalid`)
    validateRuntimeTransition(previousRuntimeState, event.runtimeState, event.type, event.subjectActionId, event.at)
    previousDigest = event.eventDigest
    previousAt = at
    previousRuntimeState = event.runtimeState
  }
  invariant(journal.eventHeadDigest === previousDigest, 'Transaction journal event-head digest mismatch')
  invariant(journal.events.at(-1).stateDigest === journalStateDigest(journal), 'Transaction journal latest event does not bind the current state snapshot')
  invariant(deepEqual(journal.events.at(-1).runtimeState, journalRuntimeState(journal)), 'Transaction journal latest event does not replay to the current runtime state')
  if (journal.state === 'verified') invariant(typeof journal.completedAt === 'string' && journal.actions.every(action => action.status === 'verified'), 'Verified transaction journal is incomplete')
  if (journal.state === 'failed-partial-state-possible') invariant(typeof journal.failedAt === 'string' && typeof journal.error === 'string', 'Failed transaction journal lacks failure evidence')
  if (['recovery-observed', 'manual-recovery-required'].includes(journal.state)) invariant(typeof journal.recoveredAt === 'string' && Array.isArray(journal.recoveryFailures), 'Recovered transaction journal lacks observation evidence')
  if (['rolling-back', 'rolled-back-verified', 'rollback-blocked'].includes(journal.state)) invariant(journal.rollbackAttempted === true && typeof journal.rollbackStartedAt === 'string', 'Rollback journal lacks rollback start evidence')
  if (['rolled-back-verified', 'rollback-blocked'].includes(journal.state)) invariant(typeof journal.rollbackCompletedAt === 'string' && Array.isArray(journal.rollbackBlockers), 'Rollback journal lacks completion evidence')

  const signatureTime = new Date(journal.startedAt)
  validateHistoricalControlPlane(journal.historicalControlPlane)
  invariant(journal.historicalControlPlaneDigest === historicalControlPlaneDigest(journal.historicalControlPlane), 'Historical control-plane bundle digest mismatch')
  const historical = journal.historicalControlPlane
  validateHistoricalInventory(historical.inventory)
  validateAttestationPolicy(historical.attestationPolicy, { issuerRegistry: historical.issuerRegistry, now: signatureTime, allowUnactivated: false })
  invariant(journal.inventoryDigest === sha256(stableStringify(historical.inventory, 0)), 'Transaction journal historical inventory digest mismatch')
  invariant(journal.desiredDigest === sha256(stableStringify(historical.desired, 0)), 'Transaction journal historical desired-state digest mismatch')
  invariant(journal.attestationPolicyDigest === sha256(stableStringify(historical.attestationPolicy, 0)), 'Transaction journal historical attestation-policy digest mismatch')

  if (mode === 'current-apply') {
    invariant(inventory && desired && rings, 'Current-apply journal validation requires current inventory, desired state, and release-ring policy')
    const verificationRegistry = issuerRegistry ?? loadIssuerRegistry()
    validateInventory(inventory)
    invariant(journal.inventoryDigest === sha256(stableStringify(inventory, 0)), 'Transaction journal inventory digest mismatch')
    invariant(journal.desiredDigest === sha256(stableStringify(desired, 0)), 'Transaction journal desired-state digest mismatch')
    invariant(journal.attestationPolicyDigest === sha256(stableStringify(rings.attestationPolicy, 0)), 'Transaction journal attestation-policy digest mismatch')
    invariant(historicalControlPlaneDigest(normalizeHistoricalControlPlane({ inventory, desired, attestationPolicy: rings.attestationPolicy, issuerRegistry: verificationRegistry })) === journal.historicalControlPlaneDigest, 'Transaction journal historical bundle differs from the current apply control plane')
  } else {
    const currentLineageRegistry = issuerRegistry ?? loadIssuerRegistry()
    validateIssuerRegistryLineage(historical.issuerRegistry, currentLineageRegistry, { historicalAt: signatureTime })
  }
  invariant(Array.isArray(journal.actions) && journal.actions.length > 0, 'Transaction journal must contain managed actions')
  const repoById = new Map(historical.inventory.repositories.map(repo => [repo.id, repo]))
  for (const action of journal.actions) validateManagedAction(action, repoById, historical.desired)
  const actionIds = new Set(journal.actions.map(action => action.actionId))
  invariant(actionIds.size === journal.actions.length, 'Transaction journal contains duplicate action ids')
  const expectedRollback = rollbackPlanFor(journal.actions)
  invariant(deepEqual(expectedRollback, journal.rollbackPlan), 'Transaction journal rollback plan differs from managed actions')
  invariant(rollbackPlanDigest(journal.rollbackPlan) === journal.rollbackPlanDigest, 'Rollback plan digest mismatch')
  invariant(journal.authorizationEnvelopeDigest === journalAuthorizationEnvelopeDigest(journal), 'Transaction journal authorization envelope digest mismatch')
  return true
}

function recomputeApplyGuard({ plan, journal, client, inventory, desired, rings, certifications, waivers, runtimeProfile, runtimeValidationContext, issuerRegistry, at, productionLive }) {
  const effectiveRuntimeValidationContext = resolveRuntimeValidationContextCore({
    client,
    inventory,
    certifications,
    runtimeProfile,
    runtimeValidationContext,
  }, productionLive)
  validateModelCore(inventory, desired, rings, certifications, waivers, at, issuerRegistry, runtimeProfile, effectiveRuntimeValidationContext, productionLive)
  const candidateByRepo = new Map()
  const observedByRepo = new Map()
  for (const repoPlan of plan.repoPlans) {
    const repo = inventory.repositories.find(item => item.id === repoPlan.repoId)
    invariant(repo?.github === repoPlan.github, `Apply refused: inventory repository identity drift for ${repoPlan.repoId}`)
    const assignment = rings.assignments[repo.id]
    const materialized = materializeProfile(repo, desired, rings, {
      eligible: true,
      promoted: true,
      ring: assignment.ring,
      wave: assignment.wave,
      blockers: [...(assignment.manualBlockers ?? [])],
    })
    const observed = fetchRepositoryState(client, repo, materialized, desired)
    candidateByRepo.set(repo.id, diffRepository(repo, materialized, observed, desired, at))
    observedByRepo.set(repo.id, observed)
  }
  assertLiveIdentitySnapshot(
    productionLive,
    plan.repoPlans.map(repoPlan => inventory.repositories.find(repository => repository.id === repoPlan.repoId)),
    plan.repoPlans.map(repoPlan => observedByRepo.get(repoPlan.repoId)),
    effectiveRuntimeValidationContext,
  )
  for (const repoPlan of plan.repoPlans) {
    const candidate = candidateByRepo.get(repoPlan.repoId)
    invariant(candidate.defaultBranchHeadSha === repoPlan.defaultBranchHeadSha, `Apply refused: default-branch head drift for ${repoPlan.repoId}`)
    if (repoPlan.candidateActions.length === 0) {
      invariant(candidate.observedStateDigest === repoPlan.observedStateDigest
        && deepEqual(candidate.actions, repoPlan.candidateActions)
        && deepEqual(candidate.deferredActions, repoPlan.deferredActions)
        && deepEqual(candidate.conflicts, repoPlan.conflicts), `Apply refused: non-selected fleet state drift for ${repoPlan.repoId}`)
      continue
    }
    const remaining = journal
      ? journal.actions.filter(action => action.repoId === repoPlan.repoId && action.status !== 'verified').map(originalPlanAction)
      : repoPlan.candidateActions
    invariant(candidate.conflicts.length === 0
      && deepEqual(candidate.actions, remaining)
      && deepEqual(candidate.deferredActions, repoPlan.deferredActions), `Apply refused: selected fleet full-state drift for ${repoPlan.repoId}`)
  }
  return true
}

function applyPlanCore(plan, client, {
  journalPath,
  inventory,
  desired,
  rings,
  certifications,
  waivers,
  runtimeProfile,
  runtimeValidationContext = {},
  verifiedReleaseEvidence,
  now = new Date(),
  clock = () => new Date(),
  reloadCurrentGovernance,
  issuerRegistry = loadIssuerRegistry(),
}, productionLive) {
  invariant(journalPath, 'Apply requires a transaction journal path')
  invariant(inventory && desired && rings && certifications && waivers && runtimeProfile,
    'Apply requires the complete current governance model')
  invariant(typeof clock === 'function', 'Apply requires a live clock source')
  const injectedRuntimeValidationContext = normalizeRuntimeValidationContext(runtimeValidationContext, { inventory })
  invariant(!productionLive || Object.keys(injectedRuntimeValidationContext).length === 0,
    'Live GitHub apply refuses an injected runtime validation identity')
  invariant(!productionLive || typeof reloadCurrentGovernance === 'function', 'Live GitHub apply requires per-write canonical governance SSOT reload')
  const governanceBaseline = clone({ inventory, desired, rings, certifications, waivers, runtimeProfile, issuerRegistry })
  assertCurrentGovernanceReload(reloadCurrentGovernance, governanceBaseline)
  invariant(!existsSync(journalPath), `Apply refused: transaction journal path already exists and is immutable: ${journalPath}`)
  invariant(plan.inventoryDigest === sha256(stableStringify(inventory, 0)), 'Apply refused: inventory digest mismatch')
  invariant(plan.desiredDigest === sha256(stableStringify(desired, 0)), 'Apply refused: desired-state digest mismatch')
  invariant(plan.attestationPolicyDigest === sha256(stableStringify(rings.attestationPolicy, 0)), 'Apply refused: attestation trust-policy digest mismatch')
  if (rings.candidateRelease === null) {
    invariant(verifiedReleaseEvidence === null || verifiedReleaseEvidence === undefined, 'Apply refused: verified release evidence must be null without a candidate release')
    invariant(plan.verifiedReleaseEvidenceDigest === null, 'Apply refused: verified release evidence drifted')
  } else {
    validateVerifiedReleaseEvidence(verifiedReleaseEvidence, rings.candidateRelease)
    invariant(plan.verifiedReleaseEvidenceDigest === digestVerifiedReleaseEvidence(verifiedReleaseEvidence, rings.candidateRelease), 'Apply refused: verified release evidence drifted')
  }
  const planPayload = clone(plan)
  delete planPayload.planDigest
  invariant(sha256(stableStringify(planPayload, 0)) === plan.planDigest, 'Apply refused: reconciliation plan digest mismatch')
  invariant(plan.schemaVersion === 7 && plan.mode === 'plan', 'Apply refused: reconciliation plan identity is invalid')
  invariant(plan.scope?.coverage === 'registered-opt-in-inventory'
    && plan.scope.registeredRepositoryCount === inventory.repositories.length
    && plan.scope.plannedRepositoryCount === inventory.repositories.length
    && plan.scope.unregisteredDescendants === 'not-covered', 'Apply refused: plan is not the full registered opt-in inventory scope')
  const conflicted = plan.repoPlans.filter(repo => repo.conflicts.length > 0)
  invariant(conflicted.length === 0, `Apply refused: fleet preflight has conflicts: ${conflicted.map(repo => repo.repoId).join(', ')}`)
  const selectedPlans = plan.repoPlans.filter(repo => repo.candidateActions.length > 0)
  invariant(selectedPlans.length > 0, 'Apply refused: plan contains no managed action')
  validateActionTransactionClass(selectedPlans.flatMap(repo => repo.candidateActions))
  const initialAt = readLiveTime(clock, 'Apply')
  const actions = selectedPlans.flatMap(repo => repo.candidateActions.map((action, index) => ({
    ...clone(action),
    actionId: `${repo.repoId}:${String(index + 1).padStart(3, '0')}:${action.kind}:${action.resource}`,
    github: repo.github,
    repoId: repo.repoId,
    status: 'pending',
  })))
  const rollbackPlan = rollbackPlanFor(actions)
  const historicalControlPlane = normalizeHistoricalControlPlane({
    inventory,
    desired,
    attestationPolicy: rings.attestationPolicy,
    issuerRegistry,
  })
  const journal = {
    schemaVersion: 7,
    transactionId: `github-reconcile-${initialAt.getTime()}-${plan.planDigest.slice(0, 12)}`,
    planDigest: plan.planDigest,
    candidateRelease: clone(plan.candidateRelease),
    verifiedReleaseEvidenceDigest: plan.verifiedReleaseEvidenceDigest,
    evidenceDurabilityClass: FLEET_RECONCILE_LOCAL_DURABILITY_CLASS,
    inventoryDigest: plan.inventoryDigest,
    desiredDigest: plan.desiredDigest,
    attestationPolicyDigest: plan.attestationPolicyDigest,
    historicalControlPlane,
    historicalControlPlaneDigest: historicalControlPlaneDigest(historicalControlPlane),
    state: 'prepared',
    startedAt: initialAt.toISOString(),
    rollbackAttempted: false,
    recoveryInstruction: 'Use --recover-journal for historical-bundle-bound observation only. --rollback-journal additionally requires a fresh profile-bound --rollback-authorization under the current apply and privileged root policies.',
    actions,
    rollbackPlan,
    rollbackPlanDigest: rollbackPlanDigest(rollbackPlan),
    authorizationEnvelopeDigest: null,
    events: [],
    eventHeadDigest: JOURNAL_GENESIS_DIGEST,
  }
  journal.authorizationEnvelopeDigest = journalAuthorizationEnvelopeDigest(journal)
  recomputeApplyGuard({ plan, journal: null, client, inventory, desired, rings, certifications, waivers, runtimeProfile, runtimeValidationContext, issuerRegistry, at: initialAt, productionLive })
  appendJournalEvent(journalPath, journal, { type: 'prepared', at: initialAt, create: true })
  validateTransactionJournal(journal, { inventory, desired, rings, now: initialAt, issuerRegistry })
  let lastEventAt = initialAt
  try {
    journal.state = 'applying'
    appendJournalEvent(journalPath, journal, { type: 'applying', at: initialAt })
    for (const action of journal.actions) {
      const writeAt = readLiveTime(clock, 'Apply', lastEventAt)
      assertCurrentGovernanceReload(reloadCurrentGovernance, governanceBaseline)
      validateTransactionJournal(journal, { inventory, desired, rings, now: writeAt, issuerRegistry })
      recomputeApplyGuard({ plan, journal, client, inventory, desired, rings, certifications, waivers, runtimeProfile, runtimeValidationContext, issuerRegistry, at: writeAt, productionLive })
      const decisionAt = readLiveTime(clock, 'Apply', writeAt)
      assertCurrentGovernanceReload(reloadCurrentGovernance, governanceBaseline)
      if (decisionAt.getTime() !== writeAt.getTime()) {
        recomputeApplyGuard({ plan, journal, client, inventory, desired, rings, certifications, waivers, runtimeProfile, runtimeValidationContext, issuerRegistry, at: decisionAt, productionLive })
      }
      const before = observeActionState(client, action)
      invariant(deepEqual(before, action.beforeImage), `Pre-apply drift for ${action.repoId}/${action.resource}`)
      action.status = 'applying'
      appendJournalEvent(journalPath, journal, { type: 'action-applying', subjectActionId: action.actionId, at: decisionAt })
      lastEventAt = decisionAt
      const mutationAt = readLiveTime(clock, 'Apply mutation', decisionAt)
      lastEventAt = mutationAt
      assertCurrentGovernanceReload(reloadCurrentGovernance, governanceBaseline)
      validateTransactionJournal(journal, { inventory, desired, rings, now: mutationAt, issuerRegistry })
      recomputeApplyGuard({ plan, journal, client, inventory, desired, rings, certifications, waivers, runtimeProfile, runtimeValidationContext, issuerRegistry, at: mutationAt, productionLive })
      const mutationBefore = observeActionState(client, action)
      invariant(deepEqual(mutationBefore, action.beforeImage), `Pre-apply drift at mutation boundary for ${action.repoId}/${action.resource}`)
      const response = client.request(action.method, action.path, action.body)
      action.responseId = response?.id ?? null
      action.readbackPath = readbackPath(action, response)
      action.status = 'applied-unverified'
      appendJournalEvent(journalPath, journal, { type: 'action-applied-unverified', subjectActionId: action.actionId, at: mutationAt })
      invariant(verifyAppliedAction(client, action), `Exact readback mismatch for ${action.repoId}/${action.resource}`)
      action.status = 'verified'
      appendJournalEvent(journalPath, journal, { type: 'action-verified', subjectActionId: action.actionId, at: mutationAt })
    }
    journal.state = 'verified'
    const completedAt = readLiveTime(clock, 'Apply', lastEventAt)
    journal.completedAt = completedAt.toISOString()
    appendJournalEvent(journalPath, journal, { type: 'verified', at: completedAt })
    validateTransactionJournal(journal, { inventory, desired, rings, now: completedAt, issuerRegistry })
    return { applied: true, transactionId: journal.transactionId, journalPath, actions: journal.actions.map(action => ({ repoId: action.repoId, kind: action.kind, resource: action.resource })) }
  } catch (error) {
    journal.state = 'failed-partial-state-possible'
    const failedAt = readLiveTime(clock, 'Apply failure journal', lastEventAt)
    journal.failedAt = failedAt.toISOString()
    journal.error = error.message
    appendJournalEvent(journalPath, journal, { type: 'failed-partial-state-possible', at: failedAt })
    throw new Error(`Reconciliation failed; no rollback was claimed or attempted. Inspect ${journalPath}, then use --rollback-journal only if its compensations remain safe: ${error.message}`, { cause: error })
  }
}

function recoverTransactionCore(journalPath, client, {
  issuerRegistry = loadIssuerRegistry(),
  clock = () => new Date(),
  reloadIssuerRegistry,
} = {}, productionLive) {
  invariant(!productionLive || typeof reloadIssuerRegistry === 'function', 'Live GitHub recovery requires current issuer-registry SSOT reload')
  const issuerRegistryBaseline = clone(issuerRegistry)
  const assertIssuerRegistryCurrent = () => {
    if (reloadIssuerRegistry) invariant(deepEqual(reloadIssuerRegistry(), issuerRegistryBaseline), 'Recovery refused: canonical issuer registry changed during observation')
  }
  assertIssuerRegistryCurrent()
  const journal = readJson(journalPath)
  validateTransactionJournal(journal, { mode: 'historical-observation', issuerRegistry })
  const lastEventAt = new Date(journal.events.at(-1).at)
  const observationAt = readLiveTime(clock, 'Recovery', lastEventAt)
  const failures = []
  for (const action of journal.actions ?? []) {
    try {
      const remote = observeActionState(client, action)
      action.recoveryObservation = remote
      if (deepEqual(remote, action.expectedApplied)) action.status = 'verified'
      else if (deepEqual(remote, action.beforeImage)) action.status = 'not-applied'
      else failures.push(`${action.repoId}/${action.resource}: remote state matches neither before-image nor expected applied state`)
    } catch (error) {
      failures.push(`${action.repoId}/${action.resource}: ${error.message}`)
    }
  }
  journal.state = failures.length === 0 ? 'recovery-observed' : 'manual-recovery-required'
  assertIssuerRegistryCurrent()
  const recoveredAt = readLiveTime(clock, 'Recovery', observationAt)
  journal.recoveredAt = recoveredAt.toISOString()
  journal.recoveryFailures = failures
  appendJournalEvent(journalPath, journal, {
    type: journal.state,
    at: recoveredAt,
  })
  validateTransactionJournal(journal, { mode: 'historical-observation', issuerRegistry })
  return { observed: failures.length === 0, rolledBack: false, failures, journalPath }
}

function rollbackTransactionCore(journalPath, client, {
  inventory,
  desired,
  rings,
  privilegedPolicy,
  recoveryAuthorization,
  clock = () => new Date(),
  reloadCurrentGovernance,
  issuerRegistry = loadIssuerRegistry(),
}, productionLive) {
  const journal = readJson(journalPath)
  validateTransactionJournal(journal, { mode: 'historical-observation', issuerRegistry })
  invariant(journal.schemaVersion === 7, 'Rollback requires a v7 transaction journal')
  invariant(['failed-partial-state-possible', 'manual-recovery-required', 'recovery-observed', 'rollback-blocked'].includes(journal.state), `Rollback refused from journal state ${journal.state}`)
  invariant(rollbackPlanDigest(journal.rollbackPlan) === journal.rollbackPlanDigest, 'Rollback plan digest mismatch')
  invariant(inventory && desired && rings?.attestationPolicy && privilegedPolicy, 'Rollback requires the current inventory, desired state, apply policy, and privileged root policy')
  invariant(recoveryAuthorization, 'Rollback requires a fresh current profile-bound recovery authorization')
  invariant(!productionLive || typeof reloadCurrentGovernance === 'function', 'Live GitHub rollback requires per-write canonical governance SSOT reload')
  const governanceBaseline = clone({
    inventory,
    desired,
    rings,
    privilegedPolicy,
    issuerRegistry,
  })
  assertCurrentRollbackReload(reloadCurrentGovernance, governanceBaseline)
  validateInventory(inventory)
  const lastJournalEventAt = new Date(journal.events.at(-1).at)
  const authorizationAt = readLiveTime(clock, 'Rollback', lastJournalEventAt)
  verifyFleetRecoveryAuthorization(recoveryAuthorization, {
    journal,
    inventory,
    desired,
    attestationPolicy: rings.attestationPolicy,
    privilegedPolicy,
    issuerRegistry,
    now: authorizationAt,
  })
  journal.rollbackAuthorizationEventHeadDigest = recoveryAuthorization.journalEventHeadDigest
  const byId = new Map(journal.actions.map(action => [action.actionId, action]))
  const blocked = []
  journal.rollbackAttempted = true
  const rollbackStartedAt = authorizationAt
  journal.rollbackStartedAt = rollbackStartedAt.toISOString()
  journal.state = 'rolling-back'
  appendJournalEvent(journalPath, journal, { type: 'rolling-back', at: rollbackStartedAt })
  let lastEventAt = rollbackStartedAt
  for (const step of journal.rollbackPlan) {
    const action = byId.get(step.actionId)
    invariant(action, `Rollback plan references missing action ${step.actionId}`)
    const writeAt = readLiveTime(clock, 'Rollback', lastEventAt)
    assertCurrentRollbackReload(reloadCurrentGovernance, governanceBaseline)
    try {
      verifyFleetRecoveryAuthorization(recoveryAuthorization, {
        journal,
        inventory,
        desired,
        attestationPolicy: rings.attestationPolicy,
        privilegedPolicy,
        issuerRegistry,
        expectedJournalEventHeadDigest: journal.rollbackAuthorizationEventHeadDigest,
        now: writeAt,
      })
      const remote = observeActionState(client, action)
      if (deepEqual(remote, action.beforeImage)) {
        action.rollbackStatus = 'already-at-before-image'
        appendJournalEvent(journalPath, journal, { type: 'rollback-already-restored', subjectActionId: action.actionId, at: writeAt })
        lastEventAt = writeAt
        continue
      }
      if (!deepEqual(remote, action.expectedApplied)) {
        blocked.push(`${action.repoId}/${action.resource}: rollback drift; remote no longer matches this transaction`)
        action.rollbackStatus = 'blocked-drift'
        appendJournalEvent(journalPath, journal, { type: 'rollback-blocked-drift', subjectActionId: action.actionId, at: writeAt })
        lastEventAt = writeAt
        continue
      }
      if (step.compensation.safety !== 'automatic') {
        blocked.push(`${action.repoId}/${action.resource}: ${step.compensation.reason}`)
        action.rollbackStatus = 'blocked-manual'
        appendJournalEvent(journalPath, journal, { type: 'rollback-blocked-manual', subjectActionId: action.actionId, at: writeAt })
        lastEventAt = writeAt
        continue
      }
      const path = step.compensation.pathSource === 'readbackPath' ? action.readbackPath : step.compensation.path
      invariant(path, `Rollback path unavailable for ${action.repoId}/${action.resource}`)
      action.rollbackStatus = 'compensating'
      appendJournalEvent(journalPath, journal, { type: 'rollback-compensating', subjectActionId: action.actionId, at: writeAt })
      lastEventAt = writeAt
      const mutationAt = readLiveTime(clock, 'Rollback mutation', writeAt)
      lastEventAt = mutationAt
      assertCurrentRollbackReload(reloadCurrentGovernance, governanceBaseline)
      validateTransactionJournal(journal, { mode: 'historical-observation', issuerRegistry })
      verifyFleetRecoveryAuthorization(recoveryAuthorization, {
        journal,
        inventory,
        desired,
        attestationPolicy: rings.attestationPolicy,
        privilegedPolicy,
        issuerRegistry,
        expectedJournalEventHeadDigest: journal.rollbackAuthorizationEventHeadDigest,
        now: mutationAt,
      })
      const mutationRemote = observeActionState(client, action)
      if (deepEqual(mutationRemote, action.beforeImage)) {
        action.rollbackStatus = 'already-at-before-image'
        appendJournalEvent(journalPath, journal, { type: 'rollback-already-restored', subjectActionId: action.actionId, at: mutationAt })
        continue
      }
      if (!deepEqual(mutationRemote, action.expectedApplied)) {
        blocked.push(`${action.repoId}/${action.resource}: rollback drift at mutation boundary; remote no longer matches this transaction`)
        action.rollbackStatus = 'blocked-drift'
        appendJournalEvent(journalPath, journal, { type: 'rollback-blocked-drift', subjectActionId: action.actionId, at: mutationAt })
        continue
      }
      const response = client.request(step.compensation.method, path, step.compensation.body)
      if (step.compensation.recreatedResource && response?.id) action.readbackPath = `/repos/${action.github}/rulesets/${response.id}`
      const restored = observeActionState(client, action)
      invariant(deepEqual(restored, action.beforeImage), `Rollback exact readback mismatch for ${action.repoId}/${action.resource}`)
      action.rollbackStatus = 'rolled-back-verified'
      appendJournalEvent(journalPath, journal, { type: 'rollback-action-verified', subjectActionId: action.actionId, at: mutationAt })
    } catch (error) {
      blocked.push(`${action.repoId}/${action.resource}: ${error.message}`)
      action.rollbackStatus = 'blocked-error'
      const blockedAt = readLiveTime(clock, 'Rollback failure journal', lastEventAt)
      appendJournalEvent(journalPath, journal, { type: 'rollback-blocked-error', subjectActionId: action.actionId, at: blockedAt })
      lastEventAt = blockedAt
    }
  }
  const rollbackCompletedAt = readLiveTime(clock, 'Rollback', lastEventAt)
  journal.rollbackCompletedAt = rollbackCompletedAt.toISOString()
  journal.rollbackBlockers = blocked
  journal.state = blocked.length === 0 ? 'rolled-back-verified' : 'rollback-blocked'
  appendJournalEvent(journalPath, journal, { type: journal.state, at: rollbackCompletedAt })
  validateTransactionJournal(journal, { mode: 'historical-observation', issuerRegistry })
  return { rolledBack: blocked.length === 0, blocked, journalPath }
}

// Production entrypoints always enforce live identity derivation. The fixture seam is
// separately named and cannot weaken these entrypoints through a caller-supplied flag
// or by substituting a client with a misleading prototype.
export function resolveRuntimeValidationContext(options) {
  return resolveRuntimeValidationContextCore(options, true)
}

export function buildPlan(options) {
  return buildPlanCore(options, true)
}

export function applyPlan(plan, client, options) {
  return applyPlanCore(plan, client, options, true)
}

export function recoverTransaction(journalPath, client, options) {
  return recoverTransactionCore(journalPath, client, options, true)
}

export function rollbackTransaction(journalPath, client, options) {
  return rollbackTransactionCore(journalPath, client, options, true)
}

export const reconcileFixtureTestHarness = Object.freeze({
  validatePartialInventoryModel(inventory, desired, rings, certifications, waivers, now = new Date(), issuerRegistry = loadIssuerRegistry(), runtimeProfile, runtimeValidationContext = {}) {
    return validateModelCore(inventory, desired, rings, certifications, waivers, now, issuerRegistry, runtimeProfile, runtimeValidationContext, false)
  },
  resolveRuntimeValidationContext(options) {
    return resolveRuntimeValidationContextCore(options, false)
  },
  buildPlan(options) {
    return buildPlanCore(options, false)
  },
  applyPlan(plan, client, options) {
    return applyPlanCore(plan, client, options, false)
  },
  recoverTransaction(journalPath, client, options) {
    return recoverTransactionCore(journalPath, client, options, false)
  },
  rollbackTransaction(journalPath, client, options) {
    return rollbackTransactionCore(journalPath, client, options, false)
  },
})

function printPlan(plan) {
  const inventory = plan.summary.registeredInventory
  console.log(`GitHub reconciliation plan ${plan.planDigest}: registered opt-in scope ${inventory.repositories}/${plan.scope.registeredRepositoryCount} repo(s), ${inventory.managedChanges} managed change(s) (${inventory.candidateActions} reversible candidate, ${inventory.deferredActions} deferred irreversible), ${inventory.conflicts} repository conflict(s). Unregistered descendants are not covered.`)
  for (const repo of plan.repoPlans) {
    console.log(`\n${repo.repoId} (${repo.github}) [eligible=${repo.eligibility.eligible}]`)
    for (const conflict of repo.conflicts) console.log(`  BLOCK ${conflict}`)
    for (const action of repo.candidateActions) console.log(`  ${action.kind} ${action.resource}`)
    for (const action of repo.deferredActions) console.log(`  DEFER irreversible ${action.kind} ${action.resource}`)
    if (repo.candidateActions.length === 0 && repo.deferredActions.length === 0 && repo.conflicts.length === 0) console.log('  aligned')
  }
}

export async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv, {
    apply: 'boolean', json: 'boolean', repo: 'string', inventory: 'string', desired: 'string', rings: 'string', certifications: 'string', waivers: 'string', journal: 'string', 'recover-journal': 'string', 'rollback-journal': 'string', 'rollback-authorization': 'string', 'privileged-policy': 'string', 'issuer-registry': 'string', 'fixture-dir': 'string',
  })
  invariant(flags._.length === 0, `Unexpected arguments: ${flags._.join(' ')}`)
  invariant(!(flags['fixture-dir'] && (flags.apply || flags['recover-journal'] || flags['rollback-journal'])), 'Fixture API clients are plan/test-only and cannot produce apply, recovery, or rollback artifacts')
  const client = flags['fixture-dir'] ? new FixtureApiClient(resolve(flags['fixture-dir'])) : new GhApiClient()
  if (flags['recover-journal']) {
    invariant(!flags.apply && !flags['rollback-journal'], '--recover-journal cannot be combined with --apply or --rollback-journal')
    const recoveryJournalPath = resolve(flags['recover-journal'])
    const recoveryIssuerRegistryPath = flags['issuer-registry'] ? resolve(flags['issuer-registry']) : null
    const recoveryIssuerRegistry = recoveryIssuerRegistryPath ? loadIssuerRegistry(recoveryIssuerRegistryPath) : loadIssuerRegistry()
    const result = recoverTransaction(recoveryJournalPath, client, {
      issuerRegistry: recoveryIssuerRegistry,
      reloadIssuerRegistry: () => recoveryIssuerRegistryPath ? loadIssuerRegistry(recoveryIssuerRegistryPath) : loadIssuerRegistry(),
    })
    console.log(flags.json ? stableStringify(result) : `${result.observed ? 'Recovery state observed (no rollback claimed)' : 'Manual recovery required'}: ${result.journalPath}`)
    if (!result.observed) process.exitCode = 2
    return { result, client }
  }
  const inventoryPath = resolve(flags.inventory ?? DEFAULT_INVENTORY)
  const desiredPath = resolve(flags.desired ?? DEFAULT_DESIRED)
  const ringsPath = resolve(flags.rings ?? DEFAULT_RINGS)
  const certificationsPath = resolve(flags.certifications ?? DEFAULT_CERTIFICATIONS)
  const waiversPath = resolve(flags.waivers ?? DEFAULT_WAIVERS)
  const runtimeProfilePath = resolve(DEFAULT_RUNTIME_PROFILE)
  const issuerRegistryPath = flags['issuer-registry'] ? resolve(flags['issuer-registry']) : null
  const inventory = readJson(inventoryPath)
  const desired = readJson(desiredPath)
  const rings = readJson(ringsPath)
  const certifications = readJson(certificationsPath)
  const waivers = readJson(waiversPath)
  const runtimeProfile = readJson(runtimeProfilePath)
  const issuerRegistry = issuerRegistryPath ? loadIssuerRegistry(issuerRegistryPath) : loadIssuerRegistry()
  if (flags['rollback-journal']) {
    invariant(!flags.apply, '--rollback-journal cannot be combined with --apply')
    const rollbackJournalPath = resolve(flags['rollback-journal'])
    invariant(flags['rollback-authorization'], '--rollback-journal requires --rollback-authorization')
    const liveRuntimeValidationContext = resolveRuntimeValidationContext({ client, inventory, certifications, runtimeProfile })
    validateModel(inventory, desired, rings, certifications, waivers, new Date(), issuerRegistry, runtimeProfile, liveRuntimeValidationContext)
    const recoveryAuthorization = readJson(resolve(flags['rollback-authorization']))
    const privilegedPolicyPath = resolve(flags['privileged-policy'] ?? DEFAULT_PRIVILEGED_POLICY)
    const privilegedPolicy = readJson(privilegedPolicyPath)
    const result = rollbackTransaction(rollbackJournalPath, client, {
      inventory,
      desired,
      rings,
      privilegedPolicy,
      recoveryAuthorization,
      issuerRegistry,
      reloadCurrentGovernance: () => ({
        inventory: readJson(inventoryPath),
        desired: readJson(desiredPath),
        rings: readJson(ringsPath),
        privilegedPolicy: readJson(privilegedPolicyPath),
        issuerRegistry: issuerRegistryPath ? loadIssuerRegistry(issuerRegistryPath) : loadIssuerRegistry(),
      }),
    })
    console.log(flags.json ? stableStringify(result) : `${result.rolledBack ? 'Compensating rollback readback-verified' : 'Rollback blocked'}: ${result.journalPath}`)
    if (!result.rolledBack) process.exitCode = 2
    return { result, client }
  }
  // Network resolution is explicit and completes before the pure plan builder runs.
  const verifiedReleaseEvidence = rings.candidateRelease
    ? await resolveVerifiedCandidateRelease(rings.candidateRelease)
    : null
  const planBuilder = flags['fixture-dir'] ? reconcileFixtureTestHarness.buildPlan : buildPlan
  const plan = planBuilder({ inventory, desired, rings, certifications, waivers, client, verifiedReleaseEvidence, repoId: flags.repo, issuerRegistry, runtimeProfile })
  if (flags.apply) {
    invariant(!flags.repo, '--apply requires full-fleet preflight; --repo is plan-only')
    const journalPath = resolve(flags.journal ?? resolve(GOVERNANCE_ROOT, `runtime/reconcile-journal-${Date.now()}-${plan.planDigest.slice(0, 12)}.json`))
    const result = applyPlan(plan, client, {
      journalPath,
      inventory,
      desired,
      rings,
      certifications,
      waivers,
      runtimeProfile,
      verifiedReleaseEvidence,
      issuerRegistry,
      reloadCurrentGovernance: () => ({
        inventory: readJson(inventoryPath),
        desired: readJson(desiredPath),
        rings: readJson(ringsPath),
        certifications: readJson(certificationsPath),
        waivers: readJson(waiversPath),
        runtimeProfile: readJson(runtimeProfilePath),
        issuerRegistry: issuerRegistryPath ? loadIssuerRegistry(issuerRegistryPath) : loadIssuerRegistry(),
      }),
    })
    console.log(flags.json ? stableStringify({ plan, result }) : `Applied and readback-verified ${result.actions.length} action(s); journal=${journalPath}`)
    return { plan, result, client }
  }
  if (flags.json) console.log(stableStringify(plan))
  else printPlan(plan)
  if (plan.summary.registeredInventory.conflicts > 0) process.exitCode = 2
  return { plan, client }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) main().catch(error => { console.error(`ERROR: ${error.message}`); process.exitCode = 1 })

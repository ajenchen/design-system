#!/usr/bin/env node

import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compareUtf8Bytes, GOVERNANCE_ROOT, invariant, readJson, sha256, stableStringify } from '../infra/governance/lib/common.mjs'
import {
  EXTERNAL_ACTIVATION_REQUIREMENTS_PATH,
  RELEASE_TAG_AUTHORIZATION_POLICY_PATH,
  releaseTrustPreflightEvidenceDigest,
  resolveReleaseTrustPreflight,
  validateReleaseTrustPreflightEvidence,
} from '../infra/governance/lib/release-trust-preflight.mjs'
import { DEFAULT_ISSUER_REGISTRY_PATH } from '../infra/governance/lib/issuer-registry.mjs'
import {
  EXTERNAL_ACTIVATION_POLICY_DIGEST,
  GITHUB_MUTATION_BOUNDARY_CONTRACT_PATH,
  externalActivationPolicyDigest,
  loadExternalActivationPolicy,
  validateExternalActivationRequirements,
} from '../infra/governance/lib/external-activation.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULTS = {
  inventory: resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json'),
  desired: resolve(GOVERNANCE_ROOT, 'desired/github.json'),
  rings: resolve(GOVERNANCE_ROOT, 'release-rings.json'),
  certifications: resolve(GOVERNANCE_ROOT, 'providers/certifications.json'),
  waivers: resolve(GOVERNANCE_ROOT, 'waivers.json'),
  requirements: resolve(ROOT, EXTERNAL_ACTIVATION_REQUIREMENTS_PATH),
  activationPolicy: resolve(GOVERNANCE_ROOT, 'external-activation-policy.json'),
  issuerRegistry: DEFAULT_ISSUER_REGISTRY_PATH,
  releaseTagPolicy: resolve(ROOT, RELEASE_TAG_AUTHORIZATION_POLICY_PATH),
  runtimeProfile: resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json'),
  mutationBoundaryContract: resolve(ROOT, GITHUB_MUTATION_BOUNDARY_CONTRACT_PATH),
}

function args(argv) {
  const allowed = new Set([
    '--verify', '--verify-issued', '--expected-digest', '--expected-authorization-digest',
    '--repository', '--release-tag', '--release-commit', '--release-tree', '--run-id', '--run-attempt',
    '--output', '--retain-exact', '--github-output', '--inventory', '--desired', '--activation-inventory', '--activation-desired', '--rings', '--certifications', '--waivers', '--requirements',
    '--event', '--issuer-registry', '--release-tag-policy', '--runtime-profile', '--external-activation-policy', '--mutation-boundary-contract',
  ])
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    invariant(allowed.has(name) && value && !value.startsWith('--'), `invalid argument ${name || '<missing>'}`)
    invariant(result[name] === undefined, `duplicate argument ${name}`)
    result[name] = value
  }
  for (const name of ['--repository', '--release-tag', '--release-commit', '--release-tree', '--run-id', '--run-attempt']) invariant(result[name], `${name} is required`)
  invariant(!(result['--verify'] && result['--verify-issued']), '--verify and --verify-issued are mutually exclusive')
  if (result['--verify'] || result['--verify-issued']) invariant(result['--expected-digest'], '--expected-digest is required when verifying')
  else invariant(result['--output'] && result['--github-output'], '--output and --github-output are required when resolving trust')
  if (result['--verify-issued']) invariant(result['--expected-authorization-digest'], '--expected-authorization-digest is required with --verify-issued')
  if (result['--retain-exact']) invariant(result['--verify-issued'], '--retain-exact is only valid with --verify-issued')
  if (result['--expected-authorization-digest']) invariant(/^[a-f0-9]{64}$/.test(result['--expected-authorization-digest']), '--expected-authorization-digest must be a lowercase SHA-256')
  return result
}

function readRegularJson(path, label) {
  const absolute = resolve(path)
  const stat = lstatSync(absolute)
  invariant(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular non-symlink file`)
  try {
    return JSON.parse(readFileSync(absolute, 'utf8'))
  } catch (error) {
    throw new Error(`${label} must contain valid JSON: ${error.message}`)
  }
}

export function readReleaseTagAuthorizationEvent(path, releaseTag) {
  invariant(path, '--event or GITHUB_EVENT_PATH is required when resolving trust')
  const event = readRegularJson(path, 'GitHub event')
  invariant(event && typeof event === 'object' && !Array.isArray(event), 'GitHub event must be an object')
  invariant(event.action === 'stage-protected-release', 'GitHub event action is not stage-protected-release')
  const payload = event.client_payload
  invariant(payload && typeof payload === 'object' && !Array.isArray(payload), 'GitHub event client_payload must be an object')
  invariant(Object.keys(payload).sort(compareUtf8Bytes).join(',') === 'releaseTagAuthorization,tag', 'GitHub event client_payload has an invalid or open shape')
  invariant(payload.tag === releaseTag, 'GitHub event release tag does not match --release-tag')
  invariant(payload.releaseTagAuthorization && typeof payload.releaseTagAuthorization === 'object' && !Array.isArray(payload.releaseTagAuthorization), 'GitHub event releaseTagAuthorization must be an object')
  return payload.releaseTagAuthorization
}

function readRequirements(path, { inventory, desired, mutationBoundaryContract, rings, issuerRegistry, activationPolicy, expectedActivationPolicyDigest, now, managedCiValidationContext }) {
  const bytes = readFileSync(path)
  const value = JSON.parse(bytes.toString('utf8'))
  validateExternalActivationRequirements(value, {
    inventory,
    desired,
    mutationBoundaryContract,
    rings,
    issuerRegistry,
    policy: activationPolicy,
    expectedPolicyDigest: expectedActivationPolicyDigest,
    now,
    managedCiValidationContext,
  })
  return { value, sha256: sha256(bytes) }
}

function expected(values, now, injectedActivationPolicy = null, managedCiValidationContext = null) {
  const inventory = readJson(resolve(values['--inventory'] ?? DEFAULTS.inventory))
  const desired = readJson(resolve(values['--desired'] ?? DEFAULTS.desired))
  const activationInventory = values['--activation-inventory']
    ? readJson(resolve(values['--activation-inventory']))
    : inventory
  const activationDesired = values['--activation-desired']
    ? readJson(resolve(values['--activation-desired']))
    : desired
  const rings = readJson(resolve(values['--rings'] ?? DEFAULTS.rings))
  const issuerRegistry = readRegularJson(values['--issuer-registry'] ?? DEFAULTS.issuerRegistry, 'issuer registry')
  const activationPolicy = injectedActivationPolicy ?? loadExternalActivationPolicy(
    resolve(values['--external-activation-policy'] ?? DEFAULTS.activationPolicy),
  )
  const mutationBoundaryContract = readRegularJson(
    values['--mutation-boundary-contract'] ?? DEFAULTS.mutationBoundaryContract,
    'GitHub mutation-boundary contract',
  )
  const expectedActivationPolicyDigest = injectedActivationPolicy
    ? externalActivationPolicyDigest(injectedActivationPolicy)
    : EXTERNAL_ACTIVATION_POLICY_DIGEST
  const requirements = readRequirements(resolve(values['--requirements'] ?? DEFAULTS.requirements), {
    inventory: activationInventory,
    desired: activationDesired,
    mutationBoundaryContract,
    rings,
    issuerRegistry,
    activationPolicy,
    expectedActivationPolicyDigest,
    now,
    managedCiValidationContext,
  })
  const releaseTagAuthorizationPolicy = readRegularJson(values['--release-tag-policy'] ?? DEFAULTS.releaseTagPolicy, 'release-tag authorization policy')
  const runtimeProfile = readRegularJson(values['--runtime-profile'] ?? DEFAULTS.runtimeProfile, 'runtime conformance profile')
  return {
    inventory,
    desired,
    activationInventory,
    activationDesired,
    rings,
    requirements,
    activationPolicy,
    mutationBoundaryContract,
    expectedActivationPolicyDigest,
    issuerRegistry,
    releaseTagAuthorizationPolicy,
    runtimeProfile,
    expected: {
      repository: values['--repository'],
      releaseTag: values['--release-tag'],
      releaseCommit: values['--release-commit'],
      releaseTree: values['--release-tree'],
      desired,
      inventory,
      activationRequirements: requirements.value,
      activationInventory,
      activationDesired,
      activationPolicy,
      expectedActivationPolicyDigest,
      mutationBoundaryContract,
      rings,
      requirementsSha256: requirements.sha256,
      releaseTagAuthorizationPolicy,
      issuerRegistry,
      runId: values['--run-id'],
      runAttempt: values['--run-attempt'],
      managedCiValidationContext,
    },
  }
}

function writeNewFile(path, body) {
  const absolute = resolve(path)
  mkdirSync(dirname(absolute), { recursive: true })
  invariant(!existsSync(absolute), `refusing to overwrite release trust evidence: ${absolute}`)
  writeFileSync(absolute, body, { flag: 'wx', mode: 0o600 })
}

export async function run(argv = process.argv.slice(2), {
  client = null,
  now = new Date(),
  activationPolicy = null,
  runtimeValidationContext = null,
  managedCiValidationContext = null,
} = {}) {
  invariant(client !== null || managedCiValidationContext === null, 'CLI release trust preflight refuses an injected managed CI validation context')
  invariant(client !== null || runtimeValidationContext === null, 'CLI release trust preflight refuses an injected runtime validation context')
  const values = args(argv)
  const issuedAt = values['--verify-issued']
    ? new Date(readRegularJson(values['--verify-issued'], 'issued release trust evidence').verifiedAt)
    : now
  invariant(issuedAt instanceof Date && Number.isFinite(issuedAt.getTime()), 'issued release trust evidence verifiedAt is invalid')
  const context = expected(values, issuedAt, activationPolicy, managedCiValidationContext)
  if (values['--verify'] || values['--verify-issued']) {
    const issuedEvidence = Boolean(values['--verify-issued'])
    const path = resolve(values['--verify'] ?? values['--verify-issued'])
    const stat = lstatSync(path)
    invariant(stat.isFile() && !stat.isSymbolicLink(), 'release trust evidence must be a regular non-symlink file')
    const evidenceBytes = readFileSync(path)
    const evidenceFileSha256 = sha256(evidenceBytes)
    const evidence = JSON.parse(evidenceBytes.toString('utf8'))
    // Finalization can happen after the original freshness window. In that case
    // revalidate the immutable evidence at its own issuance time while the
    // separately resolved original workflow run proves that attempt completed
    // successfully. This never refreshes or extends the original authorization.
    const validationNow = issuedEvidence ? new Date(evidence.verifiedAt) : now
    const digest = releaseTrustPreflightEvidenceDigest(evidence, { ...context.expected, now: validationNow })
    invariant(digest === values['--expected-digest'], 'release trust preflight evidence digest mismatch')
    if (values['--expected-authorization-digest']) {
      invariant(
        evidence.releaseTagAuthorization?.authorizationDigest === values['--expected-authorization-digest'],
        'release trust preflight authorization digest mismatch',
      )
    }
    if (values['--retain-exact']) writeNewFile(values['--retain-exact'], evidenceBytes)
    if (values['--github-output']) {
      appendFileSync(
        resolve(values['--github-output']),
        `tag_object=${evidence.release.tagObject}\nevidence_file_sha256=${evidenceFileSha256}\n`,
      )
    }
    return { evidence, digest, evidenceFileSha256 }
  }
  const releaseTagAuthorization = readReleaseTagAuthorizationEvent(
    values['--event'] ?? process.env.GITHUB_EVENT_PATH,
    values['--release-tag'],
  )
  if (!client) {
    const { GhApiClient } = await import('../infra/governance/bin/reconcile-github.mjs')
    client = new GhApiClient()
  }
  const evidence = await resolveReleaseTrustPreflight({
    inventory: context.inventory,
    desired: context.desired,
    rings: context.rings,
    certifications: readJson(resolve(values['--certifications'] ?? DEFAULTS.certifications)),
    waivers: readJson(resolve(values['--waivers'] ?? DEFAULTS.waivers)),
    client,
    repository: values['--repository'],
    releaseTag: values['--release-tag'],
    releaseCommit: values['--release-commit'],
    releaseTree: values['--release-tree'],
    activationRequirements: context.requirements.value,
    activationInventory: context.activationInventory,
    activationDesired: context.activationDesired,
    activationPolicy: context.activationPolicy,
    expectedActivationPolicyDigest: context.expectedActivationPolicyDigest,
    mutationBoundaryContract: context.mutationBoundaryContract,
    requirementsSha256: context.requirements.sha256,
    releaseTagAuthorization,
    releaseTagAuthorizationPolicy: context.releaseTagAuthorizationPolicy,
    runId: values['--run-id'],
    runAttempt: values['--run-attempt'],
    now,
    issuerRegistry: context.issuerRegistry,
    runtimeProfile: context.runtimeProfile,
    runtimeValidationContext,
    managedCiValidationContext,
  })
  validateReleaseTrustPreflightEvidence(evidence, { ...context.expected, now })
  const digest = releaseTrustPreflightEvidenceDigest(evidence, { ...context.expected, now })
  const evidenceBytes = Buffer.from(`${stableStringify(evidence)}\n`)
  const evidenceFileSha256 = sha256(evidenceBytes)
  writeNewFile(values['--output'], evidenceBytes)
  writeFileSync(
    resolve(values['--github-output']),
    `evidence_digest=${digest}\nevidence_file_sha256=${evidenceFileSha256}\nauthorization_digest=${evidence.releaseTagAuthorization.authorizationDigest}\ntag_object=${evidence.release.tagObject}\n`,
    { flag: 'a' },
  )
  return { evidence, digest, evidenceFileSha256 }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  try { await run() } catch (error) {
    console.error(`RELEASE-TRUST-PREFLIGHT: ${error.message}`)
    console.error(`External activation requirements: ${EXTERNAL_ACTIVATION_REQUIREMENTS_PATH}`)
    process.exitCode = 1
  }
}

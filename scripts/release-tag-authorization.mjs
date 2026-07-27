#!/usr/bin/env node

import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { GOVERNANCE_ROOT, invariant, parseFlags, stableStringify } from '../infra/governance/lib/common.mjs'
import {
  createReleaseTagAuthorization,
  signReleaseTagAuthorization,
  validateReleaseTagAuthorizationEnvelope,
  validateReleaseTagAuthorizationPolicy,
  verifyReleaseTagAuthorization,
} from '../infra/governance/lib/release-tag-authorization.mjs'
import {
  DEFAULT_ISSUER_REGISTRY_PATH,
  resolvePolicyIssuer,
} from '../infra/governance/lib/issuer-registry.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_POLICY = resolve(GOVERNANCE_ROOT, 'release-tag-authorization-policy.json')
const OPTIONS = {
  create: 'boolean',
  sign: 'boolean',
  verify: 'boolean',
  input: 'string',
  output: 'string',
  policy: 'string',
  'issuer-registry': 'string',
  repository: 'string',
  tag: 'string',
  'tag-object': 'string',
  commit: 'string',
  tree: 'string',
  'issued-at': 'string',
  'expires-at': 'string',
  nonce: 'string',
  'signer-key-id': 'string',
  subject: 'string',
  'private-key': 'string',
}

function readRegular(path, label) {
  const absolute = resolve(path)
  const stat = lstatSync(absolute)
  invariant(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular non-symlink file`)
  return { absolute, stat, bytes: readFileSync(absolute) }
}

function readJson(path, label) {
  const { bytes } = readRegular(path, label)
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new Error(`${label} must contain valid JSON: ${error.message}`)
  }
}

function writeNewJson(path, value) {
  const absolute = resolve(path)
  mkdirSync(dirname(absolute), { recursive: true })
  invariant(!existsSync(absolute), `refusing to overwrite release-tag authorization output: ${absolute}`)
  writeFileSync(absolute, `${stableStringify(value)}\n`, { flag: 'wx', mode: 0o600 })
}

function required(flags, names) {
  for (const name of names) invariant(flags[name], `--${name} is required`)
}

function expected(flags) {
  required(flags, ['repository', 'tag', 'tag-object', 'commit', 'tree'])
  return {
    repository: flags.repository,
    tag: flags.tag,
    tagObject: flags['tag-object'],
    commit: flags.commit,
    tree: flags.tree,
  }
}

export function run(argv = process.argv.slice(2), { now = new Date() } = {}) {
  const flags = parseFlags(argv, OPTIONS)
  invariant(flags._.length === 0, `unexpected positional arguments: ${flags._.join(' ')}`)
  const modes = ['create', 'sign', 'verify'].filter(mode => flags[mode])
  invariant(modes.length === 1, 'exactly one of --create, --sign, or --verify is required')
  const mode = modes[0]
  const policy = readJson(flags.policy ?? DEFAULT_POLICY, 'release-tag authorization policy')
  const issuerRegistry = readJson(flags['issuer-registry'] ?? DEFAULT_ISSUER_REGISTRY_PATH, 'issuer registry')
  const boundIdentity = expected(flags)

  if (mode === 'create') {
    required(flags, ['output', 'issued-at', 'expires-at', 'nonce'])
    validateReleaseTagAuthorizationPolicy(policy, { issuerRegistry, now, allowUnactivated: false })
    const authorization = createReleaseTagAuthorization({
      ...boundIdentity,
      policy,
      issuerRegistry,
      issuedAt: flags['issued-at'],
      expiresAt: flags['expires-at'],
      nonce: flags.nonce,
    })
    validateReleaseTagAuthorizationEnvelope(authorization, { expected: boundIdentity, policy, issuerRegistry, now })
    writeNewJson(flags.output, authorization)
    return authorization
  }

  required(flags, ['input'])
  const authorization = readJson(flags.input, 'release-tag authorization input')
  if (mode === 'verify') {
    verifyReleaseTagAuthorization(authorization, { expected: boundIdentity, policy, issuerRegistry, now })
    process.stdout.write(`${authorization.authorizationDigest}\n`)
    return authorization
  }

  required(flags, ['output', 'signer-key-id', 'subject', 'private-key'])
  const { issuedAt, expiresAt } = validateReleaseTagAuthorizationEnvelope(authorization, {
    expected: boundIdentity,
    policy,
    issuerRegistry,
    now,
  })
  const issuer = resolvePolicyIssuer(policy, issuerRegistry, flags['signer-key-id'], {
    role: 'release-tag-authorizer',
    at: issuedAt,
    validThrough: expiresAt,
  })
  invariant(issuer.subject === flags.subject, `Release-tag authorization signer subject mismatch for ${issuer.keyId}`)
  const privateKey = readRegular(flags['private-key'], 'release-tag authorization private key')
  invariant((privateKey.stat.mode & 0o077) === 0, 'release-tag authorization private key must not be group/world accessible')
  signReleaseTagAuthorization(authorization, {
    signerKeyId: flags['signer-key-id'],
    subject: flags.subject,
    privateKey: privateKey.bytes,
  })
  writeNewJson(flags.output, authorization)
  return authorization
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  try { run() } catch (error) {
    console.error(`RELEASE-TAG-AUTHORIZATION: ${error.message}`)
    process.exitCode = 1
  }
}

#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'

const CLASSES = new Set(['dependency-acquisition', 'deterministic-hook-audit', 'model-broker', 'github-observer'])
const HEX40 = /^[a-f0-9]{40}$/
const HEX64 = /^[a-f0-9]{64}$/
const RUN_ID = /^[1-9][0-9]*$/
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const CONTROL_PLANE_ROOT = '/opt/qijenchen/managed-ci/control-plane'

function fail(message) {
  throw new Error(`managed CI executor blocked:${message}`)
}

function parse(argv) {
  const values = new Map()
  const positionals = []
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      positionals.push(token)
      continue
    }
    if (values.has(token)) fail(`duplicate option:${token}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) fail(`${token} requires one value`)
    values.set(token, value)
    index += 1
  }
  return { values, positionals }
}

function requireValue(parsed, name) {
  const value = parsed.values.get(name)
  if (!value) fail(`missing ${name}`)
  return value
}

function safeFile(root, path, label) {
  const canonicalRoot = realpathSync(root)
  const target = resolve(canonicalRoot, path)
  const rel = relative(canonicalRoot, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`${label} escapes its root`)
  let cursor = canonicalRoot
  for (const part of rel.split(sep)) {
    cursor = resolve(cursor, part)
    if (!existsSync(cursor)) fail(`${label} is missing`)
    const stat = lstatSync(cursor)
    if (stat.isSymbolicLink()) fail(`${label} crosses a symbolic link`)
    if (cursor === target && (!stat.isFile() || stat.nlink !== 1)) fail(`${label} is not one regular file`)
  }
  return target
}

function provenance(parsed) {
  const definitionRef = requireValue(parsed, '--workflow-definition-ref')
  const definitionCommit = requireValue(parsed, '--workflow-definition-commit')
  const definitionTree = requireValue(parsed, '--workflow-definition-tree')
  const subjectCommit = requireValue(parsed, '--subject-commit')
  const subjectTree = requireValue(parsed, '--subject-tree')
  const manifest = requireValue(parsed, '--manifest-sha256')
  const subjectRunId = requireValue(parsed, '--subject-run-id')
  const frozenArtifactName = requireValue(parsed, '--frozen-artifact-name')
  const frozenArtifactId = requireValue(parsed, '--frozen-artifact-id')
  const frozenArtifactLocator = requireValue(parsed, '--frozen-artifact-locator')
  const frozenArtifactSha256 = requireValue(parsed, '--frozen-artifact-sha256')
  const frozenArtifactSize = requireValue(parsed, '--frozen-artifact-size')
  const frozenLineageDigest = requireValue(parsed, '--frozen-lineage-digest')
  const workflowRunId = requireValue(parsed, '--workflow-run-id')
  const runAttempt = requireValue(parsed, '--workflow-run-attempt')
  const executionClass = requireValue(parsed, '--oidc-request-class')
  const trustedRoot = requireValue(parsed, '--trusted-control-plane-root')
  const policyPath = requireValue(parsed, '--oidc-broker-policy')
  if (definitionRef !== 'ajenchen/design-system/.github/workflows/deep-audit-managed.yml@refs/heads/main') fail('workflow definition ref is not protected main')
  if (!HEX40.test(definitionCommit) || !HEX40.test(definitionTree) || !HEX40.test(subjectCommit) || !HEX40.test(subjectTree)) fail('commit/tree shape is invalid')
  if (definitionCommit === subjectCommit) fail('workflow definition and subject commits must differ')
  if (!HEX64.test(manifest) || !UUID_V4.test(subjectRunId)) fail('subject manifest/run identity is invalid')
  if (frozenArtifactName !== `managed-ci-frozen-subject-${workflowRunId}-${runAttempt}`
    || !RUN_ID.test(frozenArtifactId)
    || frozenArtifactLocator !== `github-actions-artifact://ajenchen/design-system/${frozenArtifactId}`
    || !HEX64.test(frozenArtifactSha256) || !RUN_ID.test(frozenArtifactSize)
    || !HEX64.test(frozenLineageDigest)) fail('frozen subject artifact lineage is invalid')
  if (!RUN_ID.test(workflowRunId) || !RUN_ID.test(runAttempt)) fail('workflow run identity is invalid')
  if (!CLASSES.has(executionClass)) fail('execution class is invalid')
  if (realpathSync(trustedRoot) !== realpathSync(CONTROL_PLANE_ROOT)) fail('trusted control-plane mount is invalid')
  const expectedPolicy = safeFile(CONTROL_PLANE_ROOT, 'infra/governance/providers/managed-ci-oidc-broker-policy.json', 'OIDC policy')
  if (realpathSync(policyPath) !== expectedPolicy) fail('OIDC policy is not the mounted canonical policy')
  if (requireValue(parsed, '--oidc-audience') !== 'qijenchen-managed-deep-audit-authority-v1') fail('OIDC audience is invalid')
  if (requireValue(parsed, '--subject-trust-mode') !== 'exact-mounted-activation-bundle') fail('subject trust mode is invalid')
  return {
    definitionCommit, definitionTree, subjectCommit, subjectTree, manifest, subjectRunId,
    frozenArtifactName, frozenArtifactId, frozenArtifactLocator, frozenArtifactSha256,
    frozenArtifactSize, frozenLineageDigest, workflowRunId, runAttempt, executionClass,
  }
}

function validateRepository(parsed, subjectCommit) {
  const repositoryRoot = requireValue(parsed, '--repository-root')
  if (repositoryRoot === 'none') return
  const marker = safeFile(repositoryRoot, '.managed-ci-subject-commit', 'subject commit marker')
  if (readFileSync(marker, 'utf8').trim() !== subjectCommit) fail('read-only subject mount does not match the requested commit')
}

function validateOnly(parsed) {
  const projection = provenance(parsed)
  validateRepository(parsed, projection.subjectCommit)
  process.stdout.write(`${JSON.stringify({ kind: 'managed-ci-provenance-validation', ...projection })}\n`)
}

function executeClass(parsed) {
  if (parsed.positionals.join(' ') !== 'execute') fail('run-class requires exactly the execute operation')
  const requested = requireValue(parsed, '--class')
  const projection = provenance(parsed)
  if (requested !== projection.executionClass) fail('class and OIDC request class differ')
  validateRepository(parsed, projection.subjectCommit)
  const adapter = safeFile(CONTROL_PLANE_ROOT, `infra/governance/managed-ci-class-adapters/${requested}.mjs`, 'class adapter')
  const child = spawnSync(process.execPath, [adapter, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: {
      PATH: process.env.PATH ?? '/opt/qijenchen/managed-ci/bin:/usr/local/bin:/usr/bin:/bin',
      HOME: '/tmp/managed-ci-home',
      LANG: 'C.UTF-8',
      NODE_ENV: 'production',
      MANAGED_CI_EXTERNAL_SANDBOX: '1',
    },
  })
  if (child.error || child.signal || child.status !== 0) fail(`trusted class adapter failed:${child.error?.message ?? child.signal ?? child.status}`)
}

try {
  const program = basename(process.argv[1])
  const parsed = parse(process.argv.slice(2))
  if (program === 'validate-provenance') validateOnly(parsed)
  else if (program === 'run-class' || program === 'managed-ci-runtime') executeClass(parsed)
  else fail(`unknown installed program:${program}`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}

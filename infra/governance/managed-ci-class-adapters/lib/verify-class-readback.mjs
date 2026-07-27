import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

const HEX40 = /^[a-f0-9]{40}$/
const HEX64 = /^[a-f0-9]{64}$/
const RUN_ID = /^[1-9][0-9]*$/
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const OPTION_NAMES = Object.freeze([
  '--class', '--workflow-definition-ref', '--workflow-definition-commit', '--workflow-definition-tree',
  '--subject-commit', '--subject-tree', '--manifest-sha256', '--subject-run-id',
  '--frozen-artifact-name', '--frozen-artifact-id', '--frozen-artifact-locator',
  '--frozen-artifact-sha256', '--frozen-artifact-size', '--frozen-lineage-digest',
  '--workflow-run-id', '--workflow-run-attempt', '--oidc-request-class', '--trusted-control-plane-root',
  '--oidc-broker-policy', '--oidc-audience', '--subject-trust-mode', '--repository-root',
  '--input-root', '--output-root', '--receipt-root',
])

function fail(message) { throw new Error(`managed CI class adapter blocked:${message}`) }
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

function parse(argv) {
  const options = new Map()
  const positionals = []
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) { positionals.push(token); continue }
    if (!OPTION_NAMES.includes(token) || options.has(token)) fail(`unknown or duplicate option:${token}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) fail(`${token} requires one value`)
    options.set(token, value)
    index += 1
  }
  if (positionals.join(' ') !== 'execute') fail('exactly one execute operation is required')
  for (const name of OPTION_NAMES) if (!options.has(name)) fail(`missing ${name}`)
  return options
}

function regularFile(root, relativePath, label) {
  const canonicalRoot = realpathSync(root)
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\') || relativePath.includes('\0')
    || isAbsolute(relativePath) || relativePath.split('/').some(part => !part || part === '.' || part === '..')) fail(`${label} path is unsafe`)
  const target = resolve(canonicalRoot, relativePath)
  const rel = relative(canonicalRoot, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`${label} escapes its root`)
  let cursor = canonicalRoot
  for (const part of rel.split(sep)) {
    cursor = resolve(cursor, part)
    if (!existsSync(cursor)) fail(`${label} is missing`)
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) fail(`${label} crosses a symbolic link`)
    if (cursor === target && (!info.isFile() || info.nlink !== 1)) fail(`${label} is not one unique regular file`)
  }
  return target
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(`${label} has an open or incomplete shape`)
}

function readJson(path, label) {
  const bytes = readFileSync(path)
  try { return { bytes, value: JSON.parse(bytes) } } catch { fail(`${label} is not JSON`) }
}

function validateNoAmbientAuthority() {
  const forbidden = [
    'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'GITHUB_TOKEN', 'GH_TOKEN',
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
  ]
  if (forbidden.some(name => process.env[name])) fail('ambient token or provider credential entered the candidate namespace')
  if (process.env.MANAGED_CI_EXTERNAL_SANDBOX !== '1') fail('external sandbox marker is absent')
}

export function assertCanonicalRawReceiptPath(expectedClass, observedPath) {
  const expectedPath = `${expectedClass}.json`
  if (observedPath !== expectedPath) fail(`class raw receipt path must be the uploaded canonical artifact:${expectedPath}`)
  return expectedPath
}

export function verifyClassReadback(expectedClass, expectedOperationId, argv = process.argv.slice(2)) {
  validateNoAmbientAuthority()
  const options = parse(argv)
  if (options.get('--class') !== expectedClass || options.get('--oidc-request-class') !== expectedClass) fail('execution class is detached')
  if (options.get('--workflow-definition-ref') !== 'ajenchen/design-system/.github/workflows/deep-audit-managed.yml@refs/heads/main') fail('workflow definition is not protected main')
  for (const name of ['--workflow-definition-commit', '--workflow-definition-tree', '--subject-commit', '--subject-tree']) {
    if (!HEX40.test(options.get(name))) fail(`${name} is invalid`)
  }
  if (options.get('--workflow-definition-commit') === options.get('--subject-commit')) fail('workflow and subject commits must be distinct')
  for (const name of ['--manifest-sha256', '--frozen-artifact-sha256', '--frozen-lineage-digest']) {
    if (!HEX64.test(options.get(name))) fail(`${name} is invalid`)
  }
  if (!UUID_V4.test(options.get('--subject-run-id')) || !RUN_ID.test(options.get('--workflow-run-id'))
    || !RUN_ID.test(options.get('--workflow-run-attempt')) || !RUN_ID.test(options.get('--frozen-artifact-id'))
    || !RUN_ID.test(options.get('--frozen-artifact-size'))) fail('run/artifact identity is invalid')
  if (options.get('--oidc-audience') !== 'qijenchen-managed-deep-audit-authority-v1'
    || options.get('--subject-trust-mode') !== 'exact-mounted-activation-bundle'
    || realpathSync(options.get('--trusted-control-plane-root')) !== realpathSync('/opt/qijenchen/managed-ci/control-plane')) fail('trusted control-plane binding is invalid')

  const inputRoot = options.get('--input-root')
  const outputRoot = options.get('--output-root')
  const receiptRoot = options.get('--receipt-root')
  const readbackPath = regularFile(inputRoot, `authority-results/${expectedClass}.json`, 'authority class readback')
  const readback = readJson(readbackPath, 'authority class readback').value
  exactKeys(readback, [
    'schemaVersion', 'kind', 'executionClass', 'operationId', 'status', 'workflowRunId', 'runAttempt',
    'subjectCommit', 'subjectTree', 'manifestSha256', 'subjectRunId', 'frozenArtifactSha256',
    'frozenLineageDigest', 'resultPath', 'resultSha256', 'rawReceiptPath', 'rawReceiptSha256',
    'authorityRequestDigest', 'sandboxPolicyDigest', 'completedAt',
  ], 'authority class readback')
  if (readback.schemaVersion !== 1 || readback.kind !== 'managed-ci-class-authority-readback-v1'
    || readback.executionClass !== expectedClass || readback.operationId !== expectedOperationId || readback.status !== 'complete'
    || readback.workflowRunId !== options.get('--workflow-run-id') || String(readback.runAttempt) !== options.get('--workflow-run-attempt')
    || readback.subjectCommit !== options.get('--subject-commit') || readback.subjectTree !== options.get('--subject-tree')
    || readback.manifestSha256 !== options.get('--manifest-sha256') || readback.subjectRunId !== options.get('--subject-run-id')
    || readback.frozenArtifactSha256 !== options.get('--frozen-artifact-sha256')
    || readback.frozenLineageDigest !== options.get('--frozen-lineage-digest')
    || !HEX64.test(readback.authorityRequestDigest) || !HEX64.test(readback.sandboxPolicyDigest)
    || !HEX64.test(readback.resultSha256) || !HEX64.test(readback.rawReceiptSha256)
    || new Date(readback.completedAt).toISOString() !== readback.completedAt) fail('authority class readback is detached or invalid')

  assertCanonicalRawReceiptPath(expectedClass, readback.rawReceiptPath)
  const resultBytes = readFileSync(regularFile(outputRoot, readback.resultPath, 'class result'))
  const receiptBytes = readFileSync(regularFile(receiptRoot, readback.rawReceiptPath, 'class raw receipt'))
  if (sha256(resultBytes) !== readback.resultSha256 || sha256(receiptBytes) !== readback.rawReceiptSha256) fail('class result or raw receipt bytes were substituted')
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    kind: 'managed-ci-class-adapter-verification-v1',
    executionClass: expectedClass,
    operationId: expectedOperationId,
    authorityReadbackSha256: sha256(readFileSync(readbackPath)),
    resultSha256: readback.resultSha256,
    rawReceiptSha256: readback.rawReceiptSha256,
  })}\n`)
}

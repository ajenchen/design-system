import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'

export const DEFAULT_MODEL_AUDIT_PLAN = 'infra/governance/model-evidence-plan.json'
export const DEFAULT_MODEL_AUDIT_PLAN_SCHEMA = 'infra/governance/schemas/model-evidence-plan.schema.json'

function fail(message) {
  throw new Error(`model audit contract blocked:${message}`)
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const stable = (value) => JSON.stringify(value)

function repositoryFile(root, path, label) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0') || isAbsolute(path)
    || path.split('/').some((part) => !part || part === '.' || part === '..')) fail(`${label} path is unsafe`)
  const absoluteRoot = realpathSync(resolve(root))
  const absolute = resolve(absoluteRoot, path)
  const rel = relative(absoluteRoot, absolute)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`${label} escapes repository`)
  let cursor = absoluteRoot
  for (const segment of rel.split(sep)) {
    cursor = resolve(cursor, segment)
    if (!existsSync(cursor)) fail(`${label} is missing:${path}`)
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) fail(`${label} crosses a symbolic link:${path}`)
    if (cursor === absolute && (!info.isFile() || info.nlink !== 1)) fail(`${label} must be a unique regular file:${path}`)
  }
  return absolute
}

function readJson(root, path, label) {
  const bytes = readFileSync(repositoryFile(root, path, label))
  if (!bytes.length) fail(`${label} is empty`)
  try { return { value: JSON.parse(bytes), bytes } } catch (error) { fail(`${label} is invalid JSON:${error.message}`) }
}

function matrixJudgmentDimensions(root, path) {
  const source = readFileSync(repositoryFile(root, path, 'audit coverage matrix'), 'utf8')
  const records = []
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+):\s*\{\s*tier:\s*'([^']+)',\s*mechanism:\s*(.+?)\s*\},?\s*$/)
    if (!match) continue
    const literal = match[3].match(/^'((?:\\.|[^'])*)'$/)
    records.push({ dim: Number(match[1]), tier: match[2], mechanism: literal ? literal[1].replaceAll("\\'", "'") : match[3] })
  }
  if (records.length !== 91 || records.some((record, index) => record.dim !== index + 1)) {
    fail('audit matrix must enumerate dimensions 1..91 exactly once')
  }
  return records.filter((record) => record.tier === 'PURE-JUDGMENT')
}

export function loadModelAuditContractState({ repoRoot = process.cwd(), planPath = DEFAULT_MODEL_AUDIT_PLAN } = {}) {
  const root = realpathSync(resolve(repoRoot))
  const planRead = readJson(root, planPath, 'model evidence plan')
  const schemaRead = readJson(root, DEFAULT_MODEL_AUDIT_PLAN_SCHEMA, 'model evidence plan schema')
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const validate = ajv.compile(schemaRead.value)
  if (!validate(planRead.value)) fail(`model evidence plan schema failed:${ajv.errorsText(validate.errors)}`)
  const matrix = matrixJudgmentDimensions(root, planRead.value.matrixSource)
  const expected = matrix.map(({ dim }) => ({ dim, ruleId: `DS-DIM-${String(dim).padStart(3, '0')}` }))
  if (stable(planRead.value.judgment.dimensions) !== stable(expected)) {
    fail(`judgment plan does not exactly enumerate every PURE-JUDGMENT dimension:${expected.map((item) => item.dim).join(',')}`)
  }
  return {
    root,
    path: repositoryFile(root, planPath, 'model evidence plan'),
    plan: planRead.value,
    planDigest: sha256(planRead.bytes),
    schemaDigest: sha256(schemaRead.bytes),
    judgmentDimensions: matrix,
    judgmentByDimension: new Map(matrix.map((record) => [record.dim, record])),
  }
}

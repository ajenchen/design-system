// Executable SSOT for the closed release-bom.json contract. The committed JSON Schema is a
// checked mirror of RELEASE_BOM_JSON_SCHEMA; every producer and consumer calls validateReleaseBom.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RELEASE_BOM_SCHEMA_VERSION = 5
export const RELEASE_PACKAGE_NAMES = Object.freeze([
  '@qijenchen/design-system',
  '@qijenchen/governance',
  '@qijenchen/storybook-config',
])
export const RELEASE_PUBLISH_ORDER = Object.freeze([
  '@qijenchen/governance',
  '@qijenchen/storybook-config',
  '@qijenchen/design-system',
])
export const RELEASE_SUPPLY_CHAIN = Object.freeze({
  npmProvenance: Object.freeze({
    predicateType: 'https://slsa.dev/provenance/v1',
    builderId: 'https://github.com/actions/runner/github-hosted',
    workflow: '.github/workflows/release.yml',
    workflowRef: 'refs/heads/main',
  }),
  immutableGitHubRelease: Object.freeze({ required: true, bomAsset: 'release-bom.json' }),
})

const SHAPES = Object.freeze({
  top: ['schemaVersion', 'releaseVersion', 'npmDistTag', 'publishOrder', 'source', 'supplyChain', 'packages', 'governance'],
  source: ['repository', 'repositoryUrl', 'gitCommit', 'gitTree', 'tag'],
  supplyChain: ['npmProvenance', 'immutableGitHubRelease'],
  npmProvenance: ['predicateType', 'builderId', 'workflow', 'workflowRef'],
  immutableGitHubRelease: ['required', 'bomAsset'],
  package: ['name', 'version', 'file', 'size', 'entryCount', 'shasum', 'sha256', 'integrity', 'packageJsonSha256', 'sourceManifest', 'sourceManifestSha256'],
  governance: ['controlPlane', 'consumer', 'forkCorpus', 'productTemplateScaffold'],
  controlPlane: ['path', 'sha256', 'role', 'inputDigest', 'contractDigest', 'snapshotDigest', 'generatorVersion'],
  consumer: ['path', 'sha256', 'role', 'release'],
  consumerRelease: ['designSystem', 'storybookConfig'],
  forkCorpus: ['path', 'sha256'],
  productTemplateScaffold: ['path', 'size', 'sha256', 'schemaVersion', 'releaseVersion', 'staticTreeSha256', 'publishedPathCount'],
  sbom: ['file', 'size', 'sha256'],
})

const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-(?:beta|next|rc)\.\d+)?$/
const SHA256 = /^[a-f0-9]{64}$/
const SHA1 = /^[a-f0-9]{40}$/
const GIT_OBJECT = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/
const SHA256_ID = /^sha256:[a-f0-9]{64}$/
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
const invariant = (condition, message) => { if (!condition) throw new Error(message) }
const exactKeys = (value, expected, label) => {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort()
  const keys = [...expected].sort()
  invariant(actual.length === keys.length && actual.every((key, index) => key === keys[index]), `${label} has an open or incomplete shape`)
}
const validSri = (value) => {
  if (typeof value !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(value)) return false
  const encoded = value.slice('sha512-'.length)
  const bytes = Buffer.from(encoded, 'base64')
  return bytes.length === 64 && bytes.toString('base64') === encoded
}

export function validateReleaseBom(bom, { requireSbom = false } = {}) {
  exactKeys(bom, [...SHAPES.top, ...(Object.prototype.hasOwnProperty.call(bom || {}, 'sbom') ? ['sbom'] : [])], 'release BOM')
  invariant(bom.schemaVersion === RELEASE_BOM_SCHEMA_VERSION, `release BOM schema ${bom.schemaVersion} is not the required schema ${RELEASE_BOM_SCHEMA_VERSION}`)
  invariant(EXACT_SEMVER.test(bom.releaseVersion || ''), 'release BOM releaseVersion is invalid')
  invariant(['beta', 'latest'].includes(bom.npmDistTag), `release BOM channel ${bom.npmDistTag} is unsupported; governed trains may target only beta/latest`)
  invariant(stable(bom.publishOrder) === stable(RELEASE_PUBLISH_ORDER), 'release BOM publish order differs from the closed release train')

  exactKeys(bom.source, SHAPES.source, 'release BOM source')
  invariant(REPOSITORY.test(bom.source.repository || ''), 'release BOM repository is invalid')
  invariant(bom.source.repositoryUrl === `git+https://github.com/${bom.source.repository}.git`, 'release BOM repositoryUrl is not canonical')
  invariant(GIT_OBJECT.test(bom.source.gitCommit || '') && GIT_OBJECT.test(bom.source.gitTree || ''), 'release BOM Git identity is invalid')
  invariant(bom.source.tag === `v${bom.releaseVersion}`, 'release BOM tag/version binding is invalid')

  exactKeys(bom.supplyChain, SHAPES.supplyChain, 'release BOM supplyChain')
  exactKeys(bom.supplyChain.npmProvenance, SHAPES.npmProvenance, 'release BOM npmProvenance')
  exactKeys(bom.supplyChain.immutableGitHubRelease, SHAPES.immutableGitHubRelease, 'release BOM immutableGitHubRelease')
  invariant(stable(bom.supplyChain) === stable(RELEASE_SUPPLY_CHAIN), 'release BOM supply-chain policy differs from the closed contract')

  invariant(Array.isArray(bom.packages) && bom.packages.length === RELEASE_PACKAGE_NAMES.length, 'release BOM must describe exactly three packages')
  const packageNames = []
  for (const item of bom.packages) {
    exactKeys(item, SHAPES.package, `release BOM package ${item?.name || '<missing>'}`)
    invariant(RELEASE_PACKAGE_NAMES.includes(item.name) && !packageNames.includes(item.name), `release BOM package ${item.name || '<missing>'} is unknown or duplicated`)
    invariant(item.version === bom.releaseVersion, `${item.name}: release BOM package version differs from releaseVersion`)
    invariant(item.file === `${item.name.replace(/^@/, '').replaceAll('/', '-')}-${item.version}.tgz`, `${item.name}: release BOM archive filename is invalid`)
    invariant(Number.isInteger(item.size) && item.size > 0 && Number.isInteger(item.entryCount) && item.entryCount > 0, `${item.name}: release BOM archive metrics are invalid`)
    invariant(SHA1.test(item.shasum || '') && SHA256.test(item.sha256 || '') && validSri(item.integrity), `${item.name}: release BOM archive digests are invalid`)
    invariant(SHA256.test(item.packageJsonSha256 || '') && SHA256.test(item.sourceManifestSha256 || ''), `${item.name}: release BOM manifest digests are invalid`)
    invariant(typeof item.sourceManifest === 'string' && /^packages\/[a-z0-9-]+\/package\.json$/.test(item.sourceManifest), `${item.name}: release BOM source manifest path is invalid`)
    packageNames.push(item.name)
  }
  invariant(stable(packageNames) === stable(RELEASE_PACKAGE_NAMES), 'release BOM packages are not in canonical name order')

  exactKeys(bom.governance, SHAPES.governance, 'release BOM governance')
  exactKeys(bom.governance.controlPlane, SHAPES.controlPlane, 'release BOM controlPlane')
  exactKeys(bom.governance.consumer, SHAPES.consumer, 'release BOM consumer')
  exactKeys(bom.governance.consumer.release, SHAPES.consumerRelease, 'release BOM consumer release')
  exactKeys(bom.governance.forkCorpus, SHAPES.forkCorpus, 'release BOM forkCorpus')
  exactKeys(bom.governance.productTemplateScaffold, SHAPES.productTemplateScaffold, 'release BOM productTemplateScaffold')
  const control = bom.governance.controlPlane
  invariant(control.path === 'governance/control-plane.lock.json' && control.role === 'ds-author', 'release BOM control-plane identity is invalid')
  invariant(SHA256.test(control.sha256 || '') && SHA256_ID.test(control.inputDigest || '') && SHA256_ID.test(control.contractDigest || '') && SHA256_ID.test(control.snapshotDigest || ''), 'release BOM control-plane digests are invalid')
  invariant(control.generatorVersion === bom.releaseVersion, 'release BOM control-plane generator version is stale')
  const consumer = bom.governance.consumer
  invariant(consumer.path === 'template/ds-product-template/governance/lock.json' && consumer.role === 'template-consumer', 'release BOM consumer lock identity is invalid')
  invariant(SHA256.test(consumer.sha256 || '') && consumer.release.designSystem === bom.releaseVersion && consumer.release.storybookConfig === bom.releaseVersion, 'release BOM consumer lock release is stale')
  invariant(bom.governance.forkCorpus.path === 'packages/design-system/ds-canonical/fork/governance.lock' && SHA256.test(bom.governance.forkCorpus.sha256 || ''), 'release BOM fork corpus identity is invalid')
  const scaffold = bom.governance.productTemplateScaffold
  invariant(scaffold.path === 'product-template-scaffold.lock.json', 'release BOM product-template scaffold asset path is invalid')
  invariant(Number.isInteger(scaffold.size) && scaffold.size > 0 && SHA256.test(scaffold.sha256 || ''), 'release BOM product-template scaffold bytes are invalid')
  invariant(scaffold.schemaVersion === 1 && scaffold.releaseVersion === bom.releaseVersion, 'release BOM product-template scaffold identity is stale')
  invariant(SHA256.test(scaffold.staticTreeSha256 || '') && Number.isInteger(scaffold.publishedPathCount) && scaffold.publishedPathCount > 1, 'release BOM product-template scaffold inventory is invalid')

  if (requireSbom) invariant(Object.prototype.hasOwnProperty.call(bom, 'sbom'), 'release BOM must bind the release SBOM')
  if (bom.sbom !== undefined) {
    exactKeys(bom.sbom, SHAPES.sbom, 'release BOM sbom')
    invariant(bom.sbom.file === 'release.sbom.cdx.json' && Number.isInteger(bom.sbom.size) && bom.sbom.size > 0 && SHA256.test(bom.sbom.sha256 || ''), 'release BOM sbom identity is invalid')
  }
  return bom
}

const objectSchema = (required, properties) => ({ type: 'object', additionalProperties: false, required, properties })
const string = { type: 'string' }
const sha256Schema = { type: 'string', pattern: '^[a-f0-9]{64}$' }
export const RELEASE_BOM_JSON_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://qijenchen.dev/schemas/release-bom-v5.schema.json',
  title: 'Qijenchen closed release BOM v5',
  ...objectSchema(SHAPES.top, {
    schemaVersion: { const: RELEASE_BOM_SCHEMA_VERSION },
    releaseVersion: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+(?:-(?:beta|next|rc)\\.\\d+)?$' },
    npmDistTag: { enum: ['beta', 'latest'] },
    publishOrder: { const: RELEASE_PUBLISH_ORDER },
    source: objectSchema(SHAPES.source, Object.fromEntries(SHAPES.source.map(key => [key, string]))),
    supplyChain: { const: RELEASE_SUPPLY_CHAIN },
    packages: { type: 'array', minItems: 3, maxItems: 3, items: objectSchema(SHAPES.package, Object.fromEntries(SHAPES.package.map(key => [key, {}]))) },
    governance: objectSchema(SHAPES.governance, {
      controlPlane: objectSchema(SHAPES.controlPlane, Object.fromEntries(SHAPES.controlPlane.map(key => [key, {}]))),
      consumer: objectSchema(SHAPES.consumer, {
        path: string, sha256: sha256Schema, role: string,
        release: objectSchema(SHAPES.consumerRelease, { designSystem: string, storybookConfig: string }),
      }),
      forkCorpus: objectSchema(SHAPES.forkCorpus, { path: string, sha256: sha256Schema }),
      productTemplateScaffold: objectSchema(SHAPES.productTemplateScaffold, {
        path: string,
        size: { type: 'integer', minimum: 1 },
        sha256: sha256Schema,
        schemaVersion: { const: 1 },
        releaseVersion: string,
        staticTreeSha256: sha256Schema,
        publishedPathCount: { type: 'integer', minimum: 2 },
      }),
    }),
    sbom: objectSchema(SHAPES.sbom, { file: string, size: { type: 'integer', minimum: 1 }, sha256: sha256Schema }),
  }),
})

export function assertReleaseBomSchemaMirror(path = resolve(dirname(fileURLToPath(import.meta.url)), 'schemas/release-bom.schema.json')) {
  let mirror
  try { mirror = JSON.parse(readFileSync(path, 'utf8')) }
  catch (error) { throw new Error(`release BOM JSON Schema mirror is missing or invalid: ${error.message}`) }
  invariant(stable(mirror) === stable(RELEASE_BOM_JSON_SCHEMA), 'release BOM JSON Schema mirror drifted from executable contract SSOT')
  return true
}

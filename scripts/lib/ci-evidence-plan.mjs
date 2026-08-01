import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { sha256, stableStringify } from './deep-audit-evidence-contract.mjs'

const EXPECTED_DIMS = Object.freeze([64, 66])
const EXPECTED = Object.freeze({
  64: {
    id: 'DS-DIM-064',
    capability: 'protected-release-propagation',
    workflow: '.github/workflows/release.yml',
    checkName: 'Protected release propagation',
  },
  66: {
    id: 'DS-DIM-066',
    capability: 'cross-repo-visual-parity',
    workflow: '.github/workflows/mirror-to-published-template.yml',
    checkName: 'Cross-repo visual parity',
  },
})

const CANONICAL_INPUTS = Object.freeze({
  inventory: 'infra/governance/inventory/managed-repos.json',
  desired: 'infra/governance/desired/github.json',
  rings: 'infra/governance/release-rings.json',
  certifications: 'infra/governance/providers/certifications.json',
  compatibility: 'infra/governance/providers/compatibility-matrix.json',
  issuers: 'infra/governance/trust/issuers.json',
  waivers: 'infra/governance/waivers.json',
  runtimeProfile: 'infra/governance/providers/runtime-conformance.json',
  externalActivationRequirements: 'infra/governance/external-activation-requirements.json',
  externalActivationPolicy: 'infra/governance/external-activation-policy.json',
  githubMutationBoundaryContract: 'infra/governance/providers/github-mutation-boundary-contract.json',
  releaseTagAuthorizationPolicy: 'infra/governance/release-tag-authorization-policy.json',
})

const EXPECTED_REQUIRED_PATHS = Object.freeze({
  64: Object.freeze([
    '.github/workflows/mirror-to-published-template.yml',
    '.github/workflows/release.yml',
    'infra/governance/bin/consumerctl.mjs',
    'infra/governance/bin/reconcile-github.mjs',
    'infra/governance/desired/github.json',
    'infra/governance/external-activation-policy.json',
    'infra/governance/external-activation-requirements.json',
    'infra/governance/inventory/managed-repos.json',
    'infra/governance/lib/check-run-trust.mjs',
    'infra/governance/lib/external-activation.mjs',
    'infra/governance/lib/fleet-reconcile-mirror.mjs',
    'infra/governance/lib/issuer-registry.mjs',
    'infra/governance/lib/release-evidence.mjs',
    'infra/governance/lib/release-tag-authorization.mjs',
    'infra/governance/lib/release-trust-preflight.mjs',
    'infra/governance/lib/rollout-state-machine.mjs',
    'infra/governance/lib/runtime-certification.mjs',
    'infra/governance/lib/signed-release-tag.mjs',
    'infra/governance/lib/staged-rollout.mjs',
    'infra/governance/lib/workflow-trust.mjs',
    'infra/governance/providers/certifications.json',
    'infra/governance/providers/compatibility-matrix.json',
    'infra/governance/providers/github-mutation-boundary-contract.json',
    'infra/governance/providers/runtime-conformance.json',
    'infra/governance/release-rings.json',
    'infra/governance/release-tag-authorization-policy.json',
    'infra/governance/schemas/external-activation-policy.schema.json',
    'infra/governance/schemas/external-activation-requirements.schema.json',
    'infra/governance/schemas/github-mutation-boundary-contract.schema.json',
    'infra/governance/schemas/release-tag-authorization-policy.schema.json',
    'infra/governance/schemas/release-tag-authorization.schema.json',
    'infra/governance/schemas/release-trust-preflight-evidence.schema.json',
    'infra/governance/test/release-tag-authorization.test.mjs',
    'infra/governance/test/release-trust-preflight.test.mjs',
    'infra/governance/test/signed-release-tag.test.mjs',
    'infra/governance/trust/issuers.json',
    'infra/governance/waivers.json',
    'scripts/build-published-template-mirror.mjs',
    'scripts/check-branch-protection.mjs',
    'scripts/ci-evidence-plan.json',
    'scripts/generate-product-template-package-lock.mjs',
    'scripts/lib/branch-protection-policy.mjs',
    'scripts/lib/ci-evidence-live-observer.mjs',
    'scripts/lib/ci-evidence-pipeline.mjs',
    'scripts/lib/ci-evidence-plan.mjs',
    'scripts/lib/deep-audit-evidence-contract.mjs',
    'scripts/lib/github-actions-artifact-identity.mjs',
    'scripts/lib/github-mutation-boundary.mjs',
    'scripts/lib/governance-dependency-bootstrap.mjs',
    'scripts/lib/published-template-provider-surfaces.mjs',
    'scripts/lib/runtime-dependency-closure.mjs',
    'scripts/mirror-run-artifact-identity.mjs',
    'scripts/produce-ci-enforced-evidence.mjs',
    'scripts/product-template-scaffold-lock.mjs',
    'scripts/release-bom-contract.mjs',
    'scripts/release-tag-authorization.mjs',
    'scripts/release-trust-preflight.mjs',
    'scripts/schemas/ci-evidence-attestation.schema.json',
    'scripts/schemas/ci-evidence-observation.schema.json',
    'scripts/schemas/ci-evidence-plan.schema.json',
    'scripts/setup-governance.mjs',
    'scripts/test-check-branch-protection.mjs',
    'scripts/test-mirror-run-artifact-identity.mjs',
    'scripts/test-product-template-scaffold-lock.mjs',
    'scripts/test-verify-mirror-activation-boundary.mjs',
    'scripts/test-verify-mirror-evidence.mjs',
    'scripts/test-verify-mirror-release.mjs',
    'scripts/verify-mirror-activation-boundary.mjs',
    'scripts/verify-mirror-evidence.mjs',
    'scripts/verify-mirror-release.mjs',
    'scripts/verify-upgrade-provenance.mjs',
  ]),
  66: Object.freeze([
    '.github/workflows/composition-fidelity.yml',
    '.github/workflows/mirror-to-published-template.yml',
    'infra/governance/bin/consumerctl.mjs',
    'infra/governance/bin/reconcile-github.mjs',
    'infra/governance/desired/github.json',
    'infra/governance/external-activation-policy.json',
    'infra/governance/external-activation-requirements.json',
    'infra/governance/inventory/managed-repos.json',
    'infra/governance/lib/check-run-trust.mjs',
    'infra/governance/lib/external-activation.mjs',
    'infra/governance/lib/issuer-registry.mjs',
    'infra/governance/lib/release-evidence.mjs',
    'infra/governance/lib/release-tag-authorization.mjs',
    'infra/governance/lib/release-trust-preflight.mjs',
    'infra/governance/lib/runtime-certification.mjs',
    'infra/governance/lib/signed-release-tag.mjs',
    'infra/governance/lib/workflow-trust.mjs',
    'infra/governance/providers/certifications.json',
    'infra/governance/providers/compatibility-matrix.json',
    'infra/governance/providers/github-mutation-boundary-contract.json',
    'infra/governance/providers/runtime-conformance.json',
    'infra/governance/release-rings.json',
    'infra/governance/release-tag-authorization-policy.json',
    'infra/governance/schemas/external-activation-policy.schema.json',
    'infra/governance/schemas/external-activation-requirements.schema.json',
    'infra/governance/schemas/github-mutation-boundary-contract.schema.json',
    'infra/governance/schemas/release-tag-authorization-policy.schema.json',
    'infra/governance/schemas/release-tag-authorization.schema.json',
    'infra/governance/schemas/release-trust-preflight-evidence.schema.json',
    'infra/governance/test/release-tag-authorization.test.mjs',
    'infra/governance/test/release-trust-preflight.test.mjs',
    'infra/governance/test/signed-release-tag.test.mjs',
    'infra/governance/trust/issuers.json',
    'infra/governance/waivers.json',
    'scripts/build-published-template-mirror.mjs',
    'scripts/check-branch-protection.mjs',
    'scripts/ci-evidence-plan.json',
    'scripts/composition-fidelity-visual-diff.mjs',
    'scripts/dogfood-prepublish-verify.mjs',
    'scripts/generate-product-template-package-lock.mjs',
    'scripts/lib/branch-protection-policy.mjs',
    'scripts/lib/ci-evidence-live-observer.mjs',
    'scripts/lib/ci-evidence-pipeline.mjs',
    'scripts/lib/ci-evidence-plan.mjs',
    'scripts/lib/deep-audit-evidence-contract.mjs',
    'scripts/lib/github-actions-artifact-identity.mjs',
    'scripts/lib/github-mutation-boundary.mjs',
    'scripts/lib/governance-dependency-bootstrap.mjs',
    'scripts/lib/published-template-provider-surfaces.mjs',
    'scripts/lib/runtime-dependency-closure.mjs',
    'scripts/mirror-run-artifact-identity.mjs',
    'scripts/produce-ci-enforced-evidence.mjs',
    'scripts/product-template-scaffold-lock.mjs',
    'scripts/release-bom-contract.mjs',
    'scripts/release-tag-authorization.mjs',
    'scripts/release-trust-preflight.mjs',
    'scripts/schemas/ci-evidence-attestation.schema.json',
    'scripts/schemas/ci-evidence-observation.schema.json',
    'scripts/schemas/ci-evidence-plan.schema.json',
    'scripts/setup-governance.mjs',
    'scripts/test-check-branch-protection.mjs',
    'scripts/test-mirror-run-artifact-identity.mjs',
    'scripts/test-product-template-scaffold-lock.mjs',
    'scripts/test-verify-mirror-activation-boundary.mjs',
    'scripts/test-verify-mirror-evidence.mjs',
    'scripts/test-verify-mirror-release.mjs',
    'scripts/verify-mirror-activation-boundary.mjs',
    'scripts/verify-mirror-evidence.mjs',
    'scripts/verify-mirror-release.mjs',
    'scripts/verify-upgrade-provenance.mjs',
    'scripts/visual-assertions.json',
    'template/ds-product-template/.github/workflows/audit.yml',
  ]),
})

function fail(message) {
  throw new Error(`CI evidence plan blocked:${message}`)
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(`${label} has an invalid or open shape`)
}

function parseMatrixCiRows(source) {
  const rows = new Map()
  for (const dim of EXPECTED_DIMS) {
    const match = source.match(new RegExp(`\\n\\s*${dim}: \\{ tier: '([^']+)', mechanism: '([^']+)' \\},`))
    if (!match) fail(`matrix source lacks canonical dim ${dim}`)
    rows.set(dim, { tier: match[1], mechanism: match[2] })
  }
  const allCi = [...source.matchAll(/\n\s*(\d+): \{ tier: 'CI-ENFORCED', mechanism: '([^']+)' \},/g)]
    .map((match) => Number(match[1])).sort((left, right) => left - right)
  if (stableStringify(allCi) !== stableStringify(EXPECTED_DIMS)) fail(`matrix CI dimension closure differs:${allCi.join(',')}`)
  return rows
}

export function validateCiEvidencePlan(plan, { repoRoot }) {
  const schema = JSON.parse(readFileSync(resolve(repoRoot, 'scripts/schemas/ci-evidence-plan.schema.json'), 'utf8'))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  if (!ajv.compile(schema)(plan)) fail(`schema validation failed:${ajv.errorsText(ajv.errors, { separator: '; ' })}`)
  const dims = plan.dimensions.map((item) => item.dim)
  if (stableStringify(dims) !== stableStringify(EXPECTED_DIMS)) fail(`dimensions must be exactly ${EXPECTED_DIMS.join(',')} in order`)
  const names = plan.observation.canonicalInputs.map((item) => item.name)
  if (new Set(names).size !== names.length || stableStringify([...names].sort()) !== stableStringify(Object.keys(CANONICAL_INPUTS).sort())) fail('canonical input name closure differs')
  for (const input of plan.observation.canonicalInputs) {
    if (input.path !== CANONICAL_INPUTS[input.name]) fail(`canonical input override is forbidden:${input.name}`)
  }
  const expectedConsumerChecks = [
    { id: 'audit', workflow: '.github/workflows/audit.yml', checkName: 'audit' },
    { id: 'visual', workflow: '.github/workflows/audit.yml', checkName: 'visual' },
  ]
  if (stableStringify(plan.observation.consumerChecks) !== stableStringify(expectedConsumerChecks)) fail('consumer audit/visual check closure differs')
  const matrixSource = readFileSync(resolve(repoRoot, plan.matrixSource), 'utf8')
  const matrix = parseMatrixCiRows(matrixSource)
  for (const dimension of plan.dimensions) {
    const expected = EXPECTED[dimension.dim]
    const matrixRow = matrix.get(dimension.dim)
    if (dimension.id !== expected.id || dimension.capability !== expected.capability
      || dimension.subject.workflow !== expected.workflow || dimension.subject.checkName !== expected.checkName
      || dimension.tier !== matrixRow.tier || dimension.mechanism !== matrixRow.mechanism) fail(`dim ${dimension.dim} identity/mechanism drifted from matrix`)
    if (stableStringify(dimension.coverage.requiredPaths) !== stableStringify(EXPECTED_REQUIRED_PATHS[dimension.dim])) {
      fail(`dim ${dimension.dim} frozen coverage must exactly equal the reviewed path closure`)
    }
    for (const path of dimension.coverage.requiredPaths) readFileSync(resolve(repoRoot, path))
  }
  return true
}

export function loadCiEvidencePlan({ repoRoot = process.cwd(), planPath = 'scripts/ci-evidence-plan.json' } = {}) {
  const absolute = resolve(repoRoot, planPath)
  const plan = JSON.parse(readFileSync(absolute, 'utf8'))
  validateCiEvidencePlan(plan, { repoRoot })
  const planDigest = sha256(stableStringify(plan))
  return {
    plan,
    planDigest,
    dimensionByNumber: new Map(plan.dimensions.map((item) => [item.dim, item])),
    canonicalInputByName: new Map(plan.observation.canonicalInputs.map((item) => [item.name, item])),
  }
}

export function loadCanonicalCiModels(planState, { repoRoot = process.cwd() } = {}) {
  const models = {}
  const bindings = []
  for (const input of planState.plan.observation.canonicalInputs) {
    const bytes = readFileSync(resolve(repoRoot, input.path))
    let value
    try { value = JSON.parse(bytes.toString('utf8')) } catch (error) { fail(`${input.name} is invalid JSON:${error.message}`) }
    models[input.name] = value
    bindings.push({ name: input.name, path: input.path, sha256: sha256(bytes) })
  }
  return { models, bindings }
}

export function assertCiPlanCoverage(planState, manifest) {
  if (!manifest || !Array.isArray(manifest.inventory)) fail('active frozen inventory is unavailable')
  const files = new Set(manifest.inventory.filter((row) => row.kind !== 'missing').map((row) => row.path))
  for (const dimension of planState.plan.dimensions) {
    for (const path of dimension.coverage.requiredPaths) if (!files.has(path)) fail(`dim ${dimension.dim} frozen coverage path is absent:${path}`)
  }
  return true
}

export { CANONICAL_INPUTS, EXPECTED_DIMS, EXPECTED_REQUIRED_PATHS }

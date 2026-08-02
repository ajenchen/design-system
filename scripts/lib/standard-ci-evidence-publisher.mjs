import {
  buildDeepAuditEvidenceEnvelope,
  deepAuditEvidenceContract,
  loadActiveDeepAuditRun,
  writeDeepAuditEvidenceEnvelopeBatch,
} from './deep-audit-evidence-contract.mjs'
import {
  buildStandardDimensionPayloads,
  loadStandardCiEvidencePlan,
  validateStandardFiveStepObservation,
} from './standard-ci-evidence.mjs'

function fail(message) { throw new Error(`standard five-step CI evidence publication blocked:${message}`) }

export async function publishStandardFiveStepCiEvidence({
  repoRoot = process.cwd(),
  collector,
  writer = writeDeepAuditEvidenceEnvelopeBatch,
  now = new Date(),
} = {}) {
  if (typeof collector !== 'function') fail('a read-only live collector is required')
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('publication clock is invalid')
  const activeRun = loadActiveDeepAuditRun({ repoRoot, requireCurrent: true })
  const { plan } = loadStandardCiEvidencePlan({ repoRoot })
  const observation = await collector({ repoRoot })
  validateStandardFiveStepObservation(observation, { repoRoot, activeRun })
  const dimensionPayloads = buildStandardDimensionPayloads(observation, plan.dimensions)
  const receipt = dimensionPayloads[0].receipt
  const startedAt = now.toISOString()
  const items = dimensionPayloads.map((payload) => ({
    relativePath: `ci-enforced/dim-${payload.dim}.json`,
    envelope: buildDeepAuditEvidenceEnvelope({
      activeRun,
      evidenceKind: 'deep-audit-ci-enforced',
      producer: deepAuditEvidenceContract.genericProducer,
      command: {
        argv: ['node', 'scripts/produce-standard-ci-evidence.mjs', '--observe', '--allow-network'],
        cwd: '.',
        exitCode: 0,
        startedAt,
        finishedAt: now.toISOString(),
      },
      coveragePaths: activeRun.manifest.rubricPaths,
      payload,
    }),
  }))
  const published = await writer({ repoRoot, items })
  if (!published || published.count !== 2 || !Array.isArray(published.paths) || published.paths.length !== 2) {
    fail('atomic dim-64/dim-66 publication did not complete')
  }
  return { ...published, observationSha256: receipt.observationSha256 }
}

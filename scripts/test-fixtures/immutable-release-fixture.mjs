import { createHash } from 'node:crypto'

import {
  NPM_FINALIZATION_RECEIPT_ASSET,
  RELEASE_TRUST_PREFLIGHT_ASSET,
} from '../verify-upgrade-provenance.mjs'

const sha256 = value => createHash('sha256').update(value).digest('hex')
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function authorization({ repository, tag, tagObject, commit, tree, timestamp }) {
  const value = {
    schemaVersion: 1,
    kind: 'release-tag-authorization',
    repository,
    tag,
    tagObject,
    commit,
    tree,
    issuerRegistryDigest: sha256('fixture issuer registry'),
    policyDigest: sha256('fixture release-tag policy'),
    issuedAt: timestamp,
    expiresAt: new Date(new Date(timestamp).getTime() + 60 * 60 * 1000).toISOString(),
    nonce: 'fixture-release-authorization-nonce-0001',
    authorizationDigest: '',
    signatures: [{ signerKeyId: 'fixture-authorizer', subject: 'fixture-subject', signature: 'fixture_signature' }],
  }
  const statement = { ...value }
  delete statement.authorizationDigest
  delete statement.signatures
  value.authorizationDigest = sha256(stable(statement))
  return value
}

export function immutableReleaseFixture({
  repository,
  version,
  commit,
  tree,
  tagObject = 'e'.repeat(40),
  bom: inputBom,
  scaffoldLockBody,
  timestamp = '2026-07-20T00:00:00.000Z',
  releaseId = 123456,
  assetIdBase = 900000,
} = {}) {
  const tag = `v${version}`
  const bom = structuredClone(inputBom)
  const assetBodies = {}
  for (const item of bom.packages) {
    const bytes = Buffer.from(`fixture package archive: ${item.name}@${version}\n`)
    item.size = bytes.length
    item.sha256 = sha256(bytes)
    assetBodies[item.file] = bytes
  }
  const sbomBody = Buffer.from(`${JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.6', version: 1 })}\n`)
  bom.sbom.size = sbomBody.length
  bom.sbom.sha256 = sha256(sbomBody)
  assetBodies[bom.sbom.file] = sbomBody
  assetBodies[bom.governance.productTemplateScaffold.path] = Buffer.from(scaffoldLockBody)

  const bomBody = Buffer.from(`${JSON.stringify(bom, null, 2)}\n`)
  assetBodies['release-bom.json'] = bomBody
  const releaseSetNames = Object.keys(assetBodies).sort()
  if (releaseSetNames.length !== 6) throw new Error('fixture BOM must resolve to six release-set files')
  const releaseSetSha256 = sha256(releaseSetNames.map(name => `${sha256(assetBodies[name])}  ${name}\n`).join(''))

  const releaseTagAuthorization = authorization({ repository, tag, tagObject, commit, tree, timestamp })
  const trust = {
    schemaVersion: 3,
    kind: 'release-trust-preflight',
    repository,
    workflow: { path: '.github/workflows/release.yml', event: 'repository_dispatch', runId: '7001', runAttempt: '1' },
    release: {
      tag,
      tagObject,
      commit,
      tree,
      verification: { verified: true, reason: 'valid', verifiedAt: timestamp },
    },
    releaseTagAuthorization,
    releaseTagAuthorizationPolicy: { path: 'infra/governance/release-tag-authorization-policy.json', sha256: releaseTagAuthorization.policyDigest },
    inventoryDigest: sha256('fixture inventory'),
    desiredDigest: sha256('fixture desired'),
    observedStateDigest: sha256('fixture observed'),
    trust: { integrations: [{}], rulesets: ['fixture'], requiredChecks: [{}], environments: [], workflows: [{}], immutableReleases: true },
    requiredCheckEvidence: [{}],
    externalActivationRequirements: { path: 'infra/governance/external-activation-requirements.json', sha256: sha256('fixture activation') },
    verifiedAt: timestamp,
  }
  const trustBody = Buffer.from(`${JSON.stringify(trust, null, 2)}\n`)
  assetBodies[RELEASE_TRUST_PREFLIGHT_ASSET] = trustBody

  const packageNames = bom.publishOrder
  const exactVersions = Object.fromEntries(packageNames.map(name => [name, version]))
  const stageIds = Object.fromEntries(packageNames.map((name, index) => [name, `00000000-0000-4000-8000-00000000000${index}`]))
  const releaseTrustArtifact = {
    name: 'release-trust-7001-1',
    digest: `sha256:${sha256('fixture trust artifact')}`,
    workflow: { path: '.github/workflows/release.yml', event: 'repository_dispatch', headBranch: 'main', headSha: commit, runId: '7001', runAttempt: 1 },
  }
  const receipt = {
    schemaVersion: 3,
    state: 'certified',
    source: { repository, tag, gitHead: commit, gitTree: tree },
    releaseTrust: {
      authorizationDigest: releaseTagAuthorization.authorizationDigest,
      evidenceSha256: sha256(stable(trust)),
      evidenceFileSha256: sha256(trustBody),
      tagObject,
      artifact: releaseTrustArtifact,
    },
    releaseSetSha256,
    bomSha256: sha256(bomBody),
    stageReceiptSha256: sha256('fixture stage receipt'),
    stageRun: {
      schemaVersion: 2,
      repository,
      workflow: { path: '.github/workflows/release.yml', event: 'repository_dispatch', headBranch: 'main', runId: '7001', runAttempt: 1, headSha: commit, status: 'completed', conclusion: 'success' },
      artifact: { id: '8001', name: 'npm-stage-v1', digest: `sha256:${sha256('fixture stage artifact')}`, sizeInBytes: 1, createdAt: timestamp, expiresAt: new Date(new Date(timestamp).getTime() + 86_400_000).toISOString() },
      releaseTrustArtifact: { id: '8002', name: releaseTrustArtifact.name, digest: releaseTrustArtifact.digest, sizeInBytes: 1, createdAt: timestamp, expiresAt: new Date(new Date(timestamp).getTime() + 86_400_000).toISOString() },
    },
    finalizerRun: { workflow: '.github/workflows/release-finalize.yml', event: 'repository_dispatch', runId: '7002', runAttempt: 1 },
    stagingTag: `governance-stage-${version}`,
    targetTag: bom.npmDistTag,
    targetVersion: version,
    publishOrder: bom.publishOrder,
    stageIds,
    isolatedTags: exactVersions,
    targetTags: exactVersions,
    packages: bom.publishOrder.map(name => {
      const item = bom.packages.find(candidate => candidate.name === name)
      return { name, version, integrity: item.integrity, shasum: item.shasum }
    }),
    certifiedAt: timestamp,
    updatedAt: timestamp,
  }
  const receiptBody = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`)
  assetBodies[NPM_FINALIZATION_RECEIPT_ASSET] = receiptBody

  const names = Object.keys(assetBodies).sort()
  if (names.length !== 8) throw new Error('fixture must resolve to the writer closed eight-asset set')
  const assets = names.map((name, index) => ({
    id: assetIdBase + index,
    name,
    state: 'uploaded',
    size: assetBodies[name].length,
    digest: `sha256:${sha256(assetBodies[name])}`,
    browser_download_url: `https://github.com/${repository}/releases/download/${tag}/${name}`,
  }))
  const signature = '-----BEGIN PGP SIGNATURE-----fixture'
  const payload = `object ${commit}\ntype commit\ntag ${tag}`
  return {
    bom,
    bomBody,
    scaffoldLockBody: assetBodies[bom.governance.productTemplateScaffold.path],
    trust,
    receipt,
    release: {
      id: releaseId,
      tag_name: tag,
      name: tag,
      draft: false,
      prerelease: tag.includes('-'),
      immutable: true,
      assets,
    },
    assetBodies,
    tagIdentity: {
      ref: `refs/tags/${tag}`,
      tag,
      tagObject,
      commit,
      tree,
      verification: {
        verified: true,
        reason: 'valid',
        verifiedAt: timestamp,
        signatureSha256: sha256(signature),
        payloadSha256: sha256(payload),
      },
    },
    tagApi: {
      reference: { ref: `refs/tags/${tag}`, object: { type: 'tag', sha: tagObject } },
      tagObject: {
        sha: tagObject,
        tag,
        object: { type: 'commit', sha: commit },
        verification: { verified: true, reason: 'valid', signature, payload, verified_at: timestamp },
      },
    },
  }
}

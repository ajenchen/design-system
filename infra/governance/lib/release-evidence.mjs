import {
  IMMUTABLE_RELEASE_ASSET_COUNT,
  NPM_FINALIZATION_RECEIPT_ASSET,
  RELEASE_TRUST_PREFLIGHT_ASSET,
  TRUSTED_UPGRADE_POLICY,
  resolveImmutableReleaseSnapshot,
  validateImmutableReleaseSnapshot,
} from '../../../scripts/verify-upgrade-provenance.mjs'
import { invariant, sha256, stableStringify } from './common.mjs'

const SHA1 = /^[a-f0-9]{40}$/
const SHA256 = /^[a-f0-9]{64}$/
const SRI = /^sha512-[A-Za-z0-9+/]+={0,2}$/
const VERSION = /^\d+\.\d+\.\d+(?:-(?:beta|next|rc)\.\d+)?$/
const POSITIVE_INTEGER = /^[1-9][0-9]*$/
const CANDIDATE_KEYS = ['id', 'version', 'sourceCommit', 'sourceTree', 'bomSha256', 'packages', 'observedAt']
const EVIDENCE_KEYS = [
  'schemaVersion', 'candidateReleaseDigest', 'repository', 'tag', 'version', 'releaseId',
  'tagObject', 'tagVerification', 'sourceCommit', 'sourceTree', 'bomSha256',
  'releaseSetSha256', 'finalizationReceiptSha256', 'releaseTrustEvidenceSha256',
  'assets', 'packages',
]

const clone = value => JSON.parse(JSON.stringify(value))

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  invariant(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has an invalid or open shape`)
}

function validSri(value) {
  if (!SRI.test(value || '')) return false
  const encoded = value.slice('sha512-'.length)
  const digest = Buffer.from(encoded, 'base64')
  return digest.length === 64 && digest.toString('base64') === encoded
}

function candidateDigest(candidateRelease) {
  return sha256(stableStringify(candidateRelease, 0))
}

function expectedAssetNames(candidateRelease, policy) {
  return [
    ...policy.releasePackages.map(name => `${name.replace(/^@/, '').replaceAll('/', '-')}-${candidateRelease.version}.tgz`),
    policy.releaseBomAsset,
    'release.sbom.cdx.json',
    'product-template-scaffold.lock.json',
    NPM_FINALIZATION_RECEIPT_ASSET,
    RELEASE_TRUST_PREFLIGHT_ASSET,
  ].sort()
}

export function validateCandidateRelease(candidateRelease, policy = TRUSTED_UPGRADE_POLICY) {
  exactKeys(candidateRelease, CANDIDATE_KEYS, 'candidate release')
  invariant(VERSION.test(candidateRelease.version || ''), 'candidate release version is invalid')
  const tag = `v${candidateRelease.version}`
  invariant(candidateRelease.id === `${policy.repository}@${tag}`, 'candidate release id does not bind the trusted repository/tag/version')
  invariant(SHA1.test(candidateRelease.sourceCommit || ''), 'candidate release sourceCommit must be a full SHA-1')
  invariant(SHA1.test(candidateRelease.sourceTree || ''), 'candidate release sourceTree must be a full SHA-1')
  invariant(SHA256.test(candidateRelease.bomSha256 || ''), 'candidate release bomSha256 must be SHA-256')
  const observedAt = new Date(candidateRelease.observedAt)
  invariant(Number.isFinite(observedAt.getTime()), 'candidate release observedAt must be a valid date')
  invariant(Array.isArray(candidateRelease.packages) && candidateRelease.packages.length === policy.releasePackages.length, 'candidate release npm package evidence is incomplete')
  const names = []
  for (const item of candidateRelease.packages) {
    exactKeys(item, ['name', 'version', 'integrity'], `candidate release package ${item?.name || '<missing>'}`)
    invariant(policy.releasePackages.includes(item.name) && !names.includes(item.name), `candidate release package ${item.name || '<missing>'} is unknown or duplicated`)
    invariant(item.version === candidateRelease.version, `${item.name}: candidate release package version mismatch`)
    invariant(validSri(item.integrity), `${item.name}: candidate release npm SRI is invalid`)
    names.push(item.name)
  }
  invariant(JSON.stringify(names) === JSON.stringify(policy.releasePackages), 'candidate release package order/set differs from the trusted release train')
  return candidateRelease
}

export function validateVerifiedReleaseEvidence(evidence, candidateRelease, policy = TRUSTED_UPGRADE_POLICY) {
  validateCandidateRelease(candidateRelease, policy)
  exactKeys(evidence, EVIDENCE_KEYS, 'verified release evidence')
  invariant(evidence.schemaVersion === 2, 'verified release evidence schemaVersion must be 2')
  invariant(evidence.candidateReleaseDigest === candidateDigest(candidateRelease), 'verified release evidence is stale for the current candidate release')
  invariant(evidence.repository === policy.repository, 'verified release evidence repository mismatch')
  invariant(evidence.tag === `v${candidateRelease.version}` && evidence.version === candidateRelease.version, 'verified release evidence tag/version mismatch')
  invariant(POSITIVE_INTEGER.test(String(evidence.releaseId ?? '')), 'verified release evidence release id is invalid')
  invariant(SHA1.test(evidence.tagObject || ''), 'verified release evidence annotated tag object is invalid')
  exactKeys(evidence.tagVerification, ['verified', 'reason', 'verifiedAt', 'signatureSha256', 'payloadSha256'], 'verified release tag signature evidence')
  invariant(evidence.tagVerification.verified === true && evidence.tagVerification.reason === 'valid', 'verified release evidence tag signature is not valid')
  invariant(SHA256.test(evidence.tagVerification.signatureSha256 || '') && SHA256.test(evidence.tagVerification.payloadSha256 || ''), 'verified release evidence tag signature digests are invalid')
  invariant(Number.isFinite(new Date(evidence.tagVerification.verifiedAt).getTime()), 'verified release evidence tag verification timestamp is invalid')
  invariant(evidence.sourceCommit === candidateRelease.sourceCommit && evidence.sourceTree === candidateRelease.sourceTree, 'verified release evidence source commit/tree mismatch')
  invariant(evidence.bomSha256 === candidateRelease.bomSha256, 'verified release evidence BOM digest mismatch')
  for (const field of ['releaseSetSha256', 'finalizationReceiptSha256', 'releaseTrustEvidenceSha256']) {
    invariant(SHA256.test(evidence[field] || ''), `verified release evidence ${field} is invalid`)
  }
  invariant(Array.isArray(evidence.assets) && evidence.assets.length === IMMUTABLE_RELEASE_ASSET_COUNT, 'verified release evidence asset set is incomplete')
  const expectedNames = expectedAssetNames(candidateRelease, policy)
  const actualNames = evidence.assets.map(item => item?.name)
  invariant(stableStringify(actualNames, 0) === stableStringify(expectedNames, 0), 'verified release evidence does not contain the writer closed eight-asset set')
  for (const asset of evidence.assets) {
    exactKeys(asset, ['id', 'name', 'digest', 'size'], `verified release asset ${asset?.name || '<missing>'}`)
    invariant(POSITIVE_INTEGER.test(String(asset.id ?? '')), `verified release asset ${asset.name} id is invalid`)
    invariant(/^sha256:[a-f0-9]{64}$/.test(asset.digest || ''), `verified release asset ${asset.name} digest is invalid`)
    invariant(Number.isSafeInteger(asset.size) && asset.size > 0, `verified release asset ${asset.name} size is invalid`)
  }
  const bomAsset = evidence.assets.find(item => item.name === policy.releaseBomAsset)
  const trustAsset = evidence.assets.find(item => item.name === RELEASE_TRUST_PREFLIGHT_ASSET)
  const receiptAsset = evidence.assets.find(item => item.name === NPM_FINALIZATION_RECEIPT_ASSET)
  invariant(bomAsset.digest === `sha256:${candidateRelease.bomSha256}`, 'verified release evidence BOM asset digest mismatch')
  invariant(trustAsset.digest === `sha256:${evidence.releaseTrustEvidenceSha256}`, 'verified release evidence trust asset digest mismatch')
  invariant(receiptAsset.digest === `sha256:${evidence.finalizationReceiptSha256}`, 'verified release evidence finalization receipt digest mismatch')
  invariant(stableStringify(evidence.packages, 0) === stableStringify(candidateRelease.packages, 0), 'verified release evidence npm SRI set mismatch')
  return evidence
}

export function verifiedReleaseEvidenceDigest(evidence, candidateRelease, policy = TRUSTED_UPGRADE_POLICY) {
  validateVerifiedReleaseEvidence(evidence, candidateRelease, policy)
  return sha256(stableStringify(evidence, 0))
}

export function createVerifiedReleaseEvidence({ candidateRelease, snapshot, policy = TRUSTED_UPGRADE_POLICY }) {
  validateCandidateRelease(candidateRelease, policy)
  invariant(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot), 'immutable release snapshot is missing')
  const immutable = validateImmutableReleaseSnapshot({
    ...snapshot,
    packages: candidateRelease.packages,
    version: candidateRelease.version,
    policy,
  })
  invariant(immutable.gitCommit === candidateRelease.sourceCommit, 'candidate release peeled tag/source commit mismatch')
  invariant(immutable.gitTree === candidateRelease.sourceTree, 'candidate release source tree mismatch')
  invariant(immutable.bomSha256 === candidateRelease.bomSha256, 'candidate release BOM digest mismatch')
  invariant(POSITIVE_INTEGER.test(String(snapshot.release.id ?? '')), 'GitHub immutable release id is invalid')
  const evidence = {
    schemaVersion: 2,
    candidateReleaseDigest: candidateDigest(candidateRelease),
    repository: policy.repository,
    tag: immutable.tag,
    version: candidateRelease.version,
    releaseId: String(snapshot.release.id),
    tagObject: immutable.tagObject,
    tagVerification: clone(immutable.tagVerification),
    sourceCommit: immutable.gitCommit,
    sourceTree: immutable.gitTree,
    bomSha256: immutable.bomSha256,
    releaseSetSha256: immutable.releaseSetSha256,
    finalizationReceiptSha256: immutable.finalizationReceiptSha256,
    releaseTrustEvidenceSha256: immutable.releaseTrustEvidenceSha256,
    assets: clone(immutable.assets),
    packages: clone(candidateRelease.packages),
  }
  return validateVerifiedReleaseEvidence(evidence, candidateRelease, policy)
}

export async function resolveVerifiedCandidateRelease(
  candidateRelease,
  { policy = TRUSTED_UPGRADE_POLICY, releaseLookup = resolveImmutableReleaseSnapshot } = {},
) {
  validateCandidateRelease(candidateRelease, policy)
  const snapshot = await releaseLookup({
    repository: policy.repository,
    tag: `v${candidateRelease.version}`,
    assetName: policy.releaseBomAsset,
  })
  return createVerifiedReleaseEvidence({ candidateRelease, snapshot, policy })
}

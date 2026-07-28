#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TRUSTED_UPGRADE_POLICY,
  resolveImmutableReleaseSnapshot,
  validateImmutableReleaseSnapshot,
} from './verify-upgrade-provenance.mjs'
import {
  PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET,
  validateProductTemplateScaffoldLock,
} from './product-template-scaffold-lock.mjs'

const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const invariant = (condition, message) => { if (!condition) throw new Error(message) }

function regularJson(path, label) {
  const stat = lstatSync(path)
  invariant(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular non-symlink file`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function verifyMirrorRelease({ bomBytes, scaffoldLockBytes, snapshot, repository, version, sourceSha, sourceTree, npmPackages }) {
  invariant(/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(repository ?? ''), 'MIRROR-RELEASE-001: repository identity is invalid')
  invariant(repository === TRUSTED_UPGRADE_POLICY.repository, 'MIRROR-RELEASE-001: repository differs from trusted release authority')
  invariant(SHA.test(sourceSha ?? '') && SHA.test(sourceTree ?? ''), 'MIRROR-RELEASE-001: Git identity is invalid')
  invariant(Array.isArray(npmPackages) && npmPackages.length === TRUSTED_UPGRADE_POLICY.upgradePackages.length, 'MIRROR-RELEASE-007: npm readback evidence is incomplete')
  invariant(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot), 'MIRROR-RELEASE-002: immutable release snapshot is missing')
  invariant(Buffer.compare(Buffer.from(bomBytes), Buffer.from(snapshot.assetBodies?.[TRUSTED_UPGRADE_POLICY.releaseBomAsset] || '')) === 0, 'MIRROR-RELEASE-006: downloaded BOM differs from the independently read release asset')
  invariant(Buffer.compare(Buffer.from(scaffoldLockBytes), Buffer.from(snapshot.assetBodies?.[PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET] || '')) === 0, 'MIRROR-RELEASE-008: downloaded scaffold lock differs from the independently read release asset')
  const immutable = validateImmutableReleaseSnapshot({
    ...snapshot,
    packages: npmPackages,
    version,
    policy: TRUSTED_UPGRADE_POLICY,
    // Mirror 認證的是 ordinary release(tag→commit→tree + BOM + SLSA provenance;
    // 簽章與 finalizer evidence 是 opt-in 高保證車道)。
    ordinaryRelease: true,
  })
  invariant(immutable.bom.source.gitCommit === sourceSha
    && immutable.bom.source.gitTree === sourceTree
    && immutable.gitCommit === sourceSha
    && immutable.gitTree === sourceTree,
  'MIRROR-RELEASE-003: source, verified annotated tag, and BOM commit/tree are not one immutable identity')
  const asset = snapshot.release.assets.find(item => item?.name === TRUSTED_UPGRADE_POLICY.releaseBomAsset)
  invariant(asset.size === bomBytes.length, 'MIRROR-RELEASE-006: release asset size does not bind downloaded BOM bytes')
  const scaffoldLock = validateProductTemplateScaffoldLock(JSON.parse(scaffoldLockBytes.toString('utf8')))
  const scaffoldDigest = createHash('sha256').update(scaffoldLockBytes).digest('hex')
  const scaffoldBinding = immutable.bom.governance.productTemplateScaffold
  invariant(
    scaffoldBinding.path === PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET
      && scaffoldBinding.size === scaffoldLockBytes.length
      && scaffoldBinding.sha256 === scaffoldDigest
      && scaffoldBinding.schemaVersion === scaffoldLock.schemaVersion
      && scaffoldBinding.releaseVersion === scaffoldLock.releaseVersion
      && scaffoldBinding.staticTreeSha256 === scaffoldLock.staticTreeSha256
      && scaffoldBinding.publishedPathCount === scaffoldLock.publishedPathCount,
    'MIRROR-RELEASE-008: release BOM does not bind exact product-template scaffold lock bytes',
  )
  const scaffoldAsset = snapshot.release.assets.find(item => item?.name === PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET)
  invariant(scaffoldAsset?.state === 'uploaded' && scaffoldAsset.size === scaffoldLockBytes.length && scaffoldAsset.digest === `sha256:${scaffoldDigest}`, 'MIRROR-RELEASE-008: immutable release scaffold asset readback differs from BOM-bound bytes')
  return {
    repository,
    version,
    tag: immutable.tag,
    tagObject: immutable.tagObject,
    sourceSha,
    sourceTree,
    bomDigest: immutable.assetDigest,
    releaseSetSha256: immutable.releaseSetSha256,
    scaffoldLockDigest: scaffoldDigest,
  }
}

function arg(args, flag) {
  const at = args.indexOf(flag)
  invariant(at >= 0 && args[at + 1] && !args[at + 1].startsWith('--'), `missing ${flag}`)
  return args[at + 1]
}

async function main() {
  const args = process.argv.slice(2)
  const bomPath = resolve(arg(args, '--bom'))
  const scaffoldLockPath = resolve(arg(args, '--scaffold-lock'))
  const bomStat = lstatSync(bomPath)
  const scaffoldLockStat = lstatSync(scaffoldLockPath)
  invariant(bomStat.isFile() && !bomStat.isSymbolicLink(), 'release BOM must be a regular non-symlink file')
  invariant(scaffoldLockStat.isFile() && !scaffoldLockStat.isSymbolicLink(), 'scaffold lock must be a regular non-symlink file')
  const bomBytes = readFileSync(bomPath)
  const repository = arg(args, '--repository')
  const version = arg(args, '--version')
  const snapshot = await resolveImmutableReleaseSnapshot({
    repository,
    tag: `v${version}`,
    assetName: TRUSTED_UPGRADE_POLICY.releaseBomAsset,
    ordinaryRelease: true,
  })
  const result = verifyMirrorRelease({
    bomBytes,
    scaffoldLockBytes: readFileSync(scaffoldLockPath),
    snapshot,
    repository,
    version,
    sourceSha: arg(args, '--source-sha'),
    sourceTree: arg(args, '--source-tree'),
    npmPackages: regularJson(resolve(arg(args, '--npm-evidence')), 'npm evidence'),
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}

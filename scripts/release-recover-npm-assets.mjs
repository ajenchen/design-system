#!/usr/bin/env node
// Recovery: rehydrate the exact published npm tarballs for an interrupted release.
//
// 2026-08-28 beta.126 incident class: npm publish completed (packages live, Trusted
// Publishing provenance attached) but the run died before the GitHub Release job, so the
// six-file Release ceremony never happened and consumers fail closed on the missing
// Release. Rebuilding from source cannot recover it — cross-run builds are not
// bit-identical — so recovery MUST use the registry's own bytes. This script downloads
// the exact three-package train for one version, verifies every byte against the
// registry dist digests, and then runs the same hardened registry/provenance validator
// the publish path uses (identity-bound SLSA attestation readback). Everything fails
// closed; on success the artifacts directory holds tarballs whose digests equal the
// registry's, ready for the sidecar + BOM + Release steps.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { npmRegistry, npmView, validateRegistryPackage } from './release-npm-lib.mjs'
import { TRUSTED_UPGRADE_POLICY } from './verify-upgrade-provenance.mjs'

function parseArgs(argv) {
  const allowed = new Set(['--version', '--artifacts', '--git-head'])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(name) || !value || value.startsWith('--')) throw new Error(`invalid argument: ${name || '<missing>'}`)
    values[name] = value
  }
  for (const required of ['--version', '--artifacts', '--git-head']) {
    if (!values[required]) throw new Error(`${required} is required`)
  }
  if (!/^[0-9a-f]{40}$/.test(values['--git-head'])) throw new Error('--git-head must be a full commit SHA')
  if (!/^\d+\.\d+\.\d+(-(?:beta|next|rc)\.\d+)?$/.test(values['--version'])) throw new Error('--version is not an exact release version')
  return values
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const artifacts = resolve(args['--artifacts'])
  const version = args['--version']
  mkdirSync(artifacts, { recursive: true })
  const identity = {
    repository: TRUSTED_UPGRADE_POLICY.repository,
    workflow: TRUSTED_UPGRADE_POLICY.workflow,
    workflowRef: TRUSTED_UPGRADE_POLICY.workflowRef,
    builderId: TRUSTED_UPGRADE_POLICY.builderId,
    gitHead: args['--git-head'],
  }
  for (const name of TRUSTED_UPGRADE_POLICY.releasePackages) {
    const dist = npmView('npm', `${name}@${version}`, 'dist')
    if (dist.kind !== 'found' || !dist.value?.tarball) {
      throw new Error(`${name}@${version}: registry dist is missing — nothing to recover`)
    }
    const tarballUrl = new URL(dist.value.tarball)
    if (tarballUrl.origin !== npmRegistry) throw new Error(`${name}@${version}: tarball URL is not the canonical registry`)
    const response = await fetch(tarballUrl, { signal: AbortSignal.timeout(300_000) })
    if (!response.ok) throw new Error(`${name}@${version}: tarball download failed with HTTP ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    const sha512 = `sha512-${createHash('sha512').update(buffer).digest('base64')}`
    const sha1 = createHash('sha1').update(buffer).digest('hex')
    if (sha512 !== dist.value.integrity || sha1 !== dist.value.shasum) {
      throw new Error(`${name}@${version}: downloaded bytes do not match the registry dist digests`)
    }
    const file = `${name.replace('@', '').replace('/', '-')}-${version}.tgz`
    writeFileSync(join(artifacts, file), buffer)
    await validateRegistryPackage('npm', { name, version, integrity: sha512, shasum: sha1 }, identity)
    console.log(`✅ recovered exact registry bytes with verified provenance: ${name}@${version} sha256:${createHash('sha256').update(buffer).digest('hex')}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  })
}

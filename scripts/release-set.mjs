#!/usr/bin/env node
// Compute and verify the canonical digest of the six-file release set.

import { createHash } from 'node:crypto'
import { appendFileSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const sha256 = (body) => createHash('sha256').update(body).digest('hex')

export function inspectReleaseSet(artifactsPath) {
  const artifacts = resolve(artifactsPath)
  const dirStat = lstatSync(artifacts)
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) {
    throw new Error(`release artifacts path must be a real directory: ${artifacts}`)
  }
  if (realpathSync(artifacts) !== artifacts) {
    throw new Error(`release artifacts path must be canonical (no symlinked parent): ${artifacts}`)
  }

  const bomPath = join(artifacts, 'release-bom.json')
  const bomStat = lstatSync(bomPath)
  if (!bomStat.isFile() || bomStat.isSymbolicLink()) throw new Error('release-bom.json must be a regular file')
  const bom = JSON.parse(readFileSync(bomPath, 'utf8'))
  if (!Array.isArray(bom.packages) || bom.packages.length !== 3) {
    throw new Error('release BOM must describe exactly three packages')
  }

  const packageFiles = bom.packages.map((item) => item?.file)
  if (packageFiles.some((name) => typeof name !== 'string' || basename(name) !== name || !name.endsWith('.tgz'))) {
    throw new Error('release BOM contains an invalid archive filename')
  }
  const scaffoldAsset = bom.governance?.productTemplateScaffold?.path
  if (scaffoldAsset !== 'product-template-scaffold.lock.json') {
    throw new Error('release BOM does not bind the canonical product-template scaffold lock asset')
  }
  const expected = [...packageFiles, 'release-bom.json', 'release.sbom.cdx.json', scaffoldAsset].sort()
  if (new Set(expected).size !== 6) throw new Error('release BOM does not resolve to six unique release files')

  const entries = readdirSync(artifacts, { withFileTypes: true }).sort((a, b) => compareUtf8Bytes(a.name, b.name))
  const actual = entries.map((entry) => entry.name)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`release directory must contain exactly six allowlisted files; expected [${expected.join(', ')}], got [${actual.join(', ')}]`)
  }

  const files = entries.map((entry) => {
    const path = join(artifacts, entry.name)
    const stats = lstatSync(path)
    if (!entry.isFile() || entry.isSymbolicLink() || !stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`release file must be regular (no directory/symlink): ${entry.name}`)
    }
    if (realpathSync(path) !== path) throw new Error(`release file path must be canonical: ${entry.name}`)
    const body = readFileSync(path)
    if (body.length === 0) throw new Error(`release file must not be empty: ${entry.name}`)
    return { name: entry.name, size: body.length, sha256: sha256(body) }
  })
  const scaffoldFile = files.find(item => item.name === scaffoldAsset)
  const scaffoldBinding = bom.governance.productTemplateScaffold
  if (!scaffoldFile || scaffoldFile.size !== scaffoldBinding.size || scaffoldFile.sha256 !== scaffoldBinding.sha256) {
    throw new Error('release product-template scaffold lock bytes differ from the BOM binding')
  }
  const canonical = files.map((item) => `${item.sha256}  ${item.name}\n`).join('')
  return { artifacts, files, canonical, sha256: sha256(canonical) }
}

function parseArgs(argv) {
  const allowed = new Set(['--artifacts', '--expected', '--github-output'])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(name) || !value || value.startsWith('--')) throw new Error(`invalid argument: ${name || '<missing>'}`)
    values[name] = value
  }
  if (!values['--artifacts']) throw new Error('--artifacts is required')
  return values
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const result = inspectReleaseSet(args['--artifacts'])
  const expected = args['--expected']
  if (expected && !/^[0-9a-f]{64}$/.test(expected)) throw new Error('--expected must be a lowercase SHA-256 digest')
  if (expected && result.sha256 !== expected) {
    throw new Error(`release-set digest mismatch: ${result.sha256} != ${expected}`)
  }
  if (args['--github-output']) appendFileSync(args['--github-output'], `sha256=${result.sha256}\n`)
  console.log(`✅ exact six-file release set: sha256:${result.sha256}`)
  for (const item of result.files) console.log(`   ${item.name} sha256:${item.sha256}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

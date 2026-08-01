#!/usr/bin/env node
// Read back the exact three-package release train and Trusted Publishing provenance.

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareVerifiedExactNpmRuntime } from './lib/verified-exact-npm-runtime.mjs'
import { loadReleaseContext, readTagVersions, validateRegistryPackage } from './release-npm-lib.mjs'

function parseArgs(argv) {
  const allowed = new Set(['--artifacts', '--bom', '--repository', '--tag', '--git-head'])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(name) || !value || value.startsWith('--')) throw new Error(`invalid argument: ${name || '<missing>'}`)
    values[name] = value
  }
  for (const name of allowed) if (!values[name]) throw new Error(`${name} is required`)
  return values
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const runtime = await prepareVerifiedExactNpmRuntime({ repositoryRoot })
  try {
    const context = loadReleaseContext({
      artifacts: resolve(args['--artifacts']),
      bomPath: resolve(args['--bom']),
      repository: args['--repository'],
      tag: args['--tag'],
      gitHead: args['--git-head'],
    })
    for (const item of context.ordered) await validateRegistryPackage(runtime.cli, item, context.identity)
    const tags = readTagVersions(runtime.cli, context.ordered, context.targetTag)
    for (const item of context.ordered) {
      if (tags[item.name] !== context.targetVersion) {
        throw new Error(`${item.name}: npm ${context.targetTag} tag is ${tags[item.name] || '<missing>'}, expected ${context.targetVersion}`)
      }
    }
    console.log(`✅ exact three-package ${context.targetTag} train and npm provenance read back successfully`)
  } finally {
    runtime.cleanup?.()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  })
}
